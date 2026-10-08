import { randomBytes } from "crypto";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/prisma";
import { env, isPlatformAdminUser, isProduction } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { comparePassword, hashPassword, hashToken } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { ChangePasswordInput, ForgotPasswordInput, GoogleAuthInput, LoginInput, RegisterInput, ResetPasswordInput } from "../validators/auth.validator";
import { escapeHtml, isEmailEnabled, sendEmail } from "../utils/mailer";
import { applyTemplate } from "./settings.service";
import type { Lang } from "../i18n/messages";
import { permissionsFor, Role } from "../config/permissions";
import { PlanId, subscriptionInfo, TRIAL_PLAN, trialEndsAt } from "../config/plans";

const REFRESH_TOKEN_TTL_DAYS = 30;
/** Wrong passwords in a row before the account is locked for a while. */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_MINUTES = 15;
/** The seed's well-known demo login must never work on a real deployment. */
const DEMO_EMAIL = "owner@ainabi.kg";
const googleClient = new OAuth2Client(env.google.clientId);

function serializeSession(employee: {
  id: string;
  role: Role;
  locationId?: string | null;
  business: {
    id: string;
    name: string;
    currency: string;
    phone?: string | null;
    address?: string | null;
    qrPaymentInfo?: string | null;
    plan: PlanId;
    planExpiresAt: Date | null;
    isTrial: boolean;
  };
  user: ReturnType<typeof toSessionUser>;
}) {
  return {
    user: employee.user,
    business: employee.business,
    role: employee.role,
    // What this role may do — the frontend shows menus/buttons from this list.
    permissions: permissionsFor(employee.role),
    subscription: subscriptionInfo(employee.business),
    isPlatformAdmin: employee.user.isPlatformAdmin,
    employeeId: employee.id,
    locationId: employee.locationId ?? null,
  };
}

async function issueTokens(userId: string, businessId: string, employeeId: string, role: Role) {
  const accessToken = signAccessToken({ userId, businessId, employeeId, role });
  const refreshToken = signRefreshToken({ userId });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hashToken(refreshToken), expiresAt },
  });

  return { accessToken, refreshToken };
}

async function primaryEmployeeFor(userId: string) {
  return prisma.employee.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { business: true, user: true },
    orderBy: { createdAt: "asc" },
  });
}

function toSessionUser(user: {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  provider: string;
  passwordHash?: string | null;
  googleId?: string | null;
  mustChangePassword?: boolean;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    provider: user.provider,
    hasPassword: !!user.passwordHash,
    mustChangePassword: !!user.mustChangePassword,
    isPlatformAdmin: isPlatformAdminUser({ email: user.email, googleId: user.googleId ?? null }),
  };
}

export async function register(input: RegisterInput, lang: Lang = "ky") {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict("Бул email менен аккаунт мурунтан бар.");
  }
  // The platform owner's account is created through Google sign-in (Google
  // proves the address is theirs), never through the open sign-up form.
  if (env.platformAdminEmails.includes(input.email.trim().toLowerCase())) {
    throw ApiError.forbidden("Бул email менен катталууга болбойт. «Google менен кирүү» баскычын колдонуңуз.");
  }

  const passwordHash = await hashPassword(input.password);

  const { user, employee, business } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash,
        provider: "PASSWORD",
      },
    });

    const created = await tx.business.create({
      data: { name: input.businessName, ownerId: user.id, phone: input.phone, plan: TRIAL_PLAN, isTrial: true, planExpiresAt: trialEndsAt() },
    });

    const employee = await tx.employee.create({
      data: { userId: user.id, businessId: created.id, role: "OWNER", status: "ACTIVE", lastLoginAt: new Date() },
    });

    // Seeds the chosen preset's categories + product fields (GENERAL just
    // adds the one default category the app always started with).
    const business = await applyTemplate(
      tx,
      created.id,
      { businessType: input.businessType, addCategories: true, addFields: true },
      lang,
    );

    return { user, employee, business };
  });

  const tokens = await issueTokens(user.id, business.id, employee.id, employee.role);
  return {
    ...tokens,
    session: serializeSession({ id: employee.id, role: employee.role, business, user: toSessionUser(user) }),
  };
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw ApiError.unauthorized("Email же пароль туура эмес.");
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(429, "Пароль көп жолу туура эмес терилди. 15 мүнөттөн кийин кайра аракет кылыңыз же паролду калыбына келтириңиз.");
  }

  if (!user.passwordHash) {
    throw ApiError.unauthorized("Бул аккаунт Google аркылуу катталган. \"Google менен кирүү\" баскычын колдонуңуз.");
  }

  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    // Counted in the database: the per-IP limiter lives in one serverless
    // instance's memory and doesn't stop a guesser spread across instances.
    // Atomic increment, so parallel guesses can't all read the same count.
    const { failedLogins } = await prisma.user.update({
      where: { id: user.id },
      data: { failedLogins: { increment: 1 } },
      select: { failedLogins: true },
    });
    if (failedLogins >= MAX_FAILED_LOGINS) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60_000) },
      });
    }
    throw ApiError.unauthorized("Email же пароль туура эмес.");
  }
  if (isProduction && user.email === DEMO_EMAIL && input.password === "password123") {
    throw ApiError.unauthorized("Email же пароль туура эмес.");
  }
  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }

  const employee = await primaryEmployeeFor(user.id);
  if (!employee) {
    throw ApiError.forbidden("Сиздин аккаунт эч бир бизнеске бириктирилген эмес же өчүрүлгөн.");
  }

  await prisma.employee.update({ where: { id: employee.id }, data: { lastLoginAt: new Date() } });

  const tokens = await issueTokens(user.id, employee.businessId, employee.id, employee.role);
  return {
    ...tokens,
    session: serializeSession({ id: employee.id, role: employee.role, business: employee.business, user: toSessionUser(employee.user) }),
  };
}

/**
 * Verifies a Google Identity Services ID token and signs the person in.
 * First-time users get a User + Business (auto-named from their Google
 * profile) + OWNER Employee created in one transaction, mirroring `register`.
 * Returning users are matched by googleId, falling back to a matching email
 * (an existing password account gets Google linked to it automatically).
 */
export async function loginWithGoogle(input: GoogleAuthInput, lang: Lang = "ky") {
  if (!env.google.clientId) {
    throw ApiError.badRequest("Google менен кирүү бул сервер үчүн азырынча конфигурацияланган эмес.");
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: input.idToken, audience: env.google.clientId });
    payload = ticket.getPayload();
  } catch {
    throw ApiError.unauthorized("Google токени жараксыз.");
  }

  if (!payload?.email || !payload.sub) {
    throw ApiError.unauthorized("Google аккаунттан email алынган жок.");
  }
  if (payload.email_verified === false) {
    throw ApiError.unauthorized("Google email дареги ырасталган эмес.");
  }

  let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });

  if (!user) {
    const existingByEmail = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existingByEmail) {
      // Same email already registered (password account) — link Google to it.
      // Sign-up never verified that address, so the password may have been
      // chosen by someone else who registered it first, waiting for the real
      // owner to arrive. Google has now proven who owns the mailbox: drop
      // that password and every session it opened. The owner can set a new
      // password from their profile.
      const [linked] = await prisma.$transaction([
        prisma.user.update({
          where: { id: existingByEmail.id },
          data: {
            googleId: payload.sub,
            avatarUrl: payload.picture ?? existingByEmail.avatarUrl,
            passwordHash: null,
            mustChangePassword: false,
            failedLogins: 0,
            lockedUntil: null,
          },
        }),
        prisma.refreshToken.updateMany({ where: { userId: existingByEmail.id, revoked: false }, data: { revoked: true } }),
        prisma.passwordResetToken.deleteMany({ where: { userId: existingByEmail.id } }),
      ]);
      user = linked;
    }
  }

  let employee = user ? await primaryEmployeeFor(user.id) : null;

  if (!user || !employee) {
    const name = payload.name || payload.email.split("@")[0];
    const created = await prisma.$transaction(async (tx) => {
      const newUser =
        user ??
        (await tx.user.create({
          data: {
            name,
            email: payload!.email!,
            googleId: payload!.sub,
            avatarUrl: payload!.picture ?? null,
            provider: "GOOGLE",
          },
        }));

      const createdBusiness = await tx.business.create({
        data: { name: `${name} дүкөнү`, ownerId: newUser.id, plan: TRIAL_PLAN, isTrial: true, planExpiresAt: trialEndsAt() },
      });

      const newEmployee = await tx.employee.create({
        data: { userId: newUser.id, businessId: createdBusiness.id, role: "OWNER", status: "ACTIVE", lastLoginAt: new Date() },
      });

      // Google sign-up has no form to pick a type on — start GENERAL; the
      // owner can switch in Settings.
      const business = await applyTemplate(
        tx,
        createdBusiness.id,
        { businessType: "GENERAL", addCategories: true, addFields: true },
        lang,
      );

      return { user: newUser, business, employee: newEmployee };
    });

    user = created.user;
    employee = { ...created.employee, business: created.business, user: created.user };
  } else {
    await prisma.employee.update({ where: { id: employee.id }, data: { lastLoginAt: new Date() } });
  }

  const tokens = await issueTokens(user.id, employee.businessId, employee.id, employee.role);
  return {
    ...tokens,
    session: serializeSession({ id: employee.id, role: employee.role, business: employee.business, user: toSessionUser(employee.user) }),
  };
}

export async function refresh(refreshTokenValue: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshTokenValue);
  } catch {
    throw ApiError.unauthorized("Сессиянын мөөнөтү бүттү. Кайра кириңиз.");
  }

  const tokenHash = hashToken(refreshTokenValue);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revoked || stored.expiresAt < new Date()) {
    throw ApiError.unauthorized("Сессиянын мөөнөтү бүттү. Кайра кириңиз.");
  }

  const employee = await primaryEmployeeFor(payload.userId);
  if (!employee) {
    throw ApiError.unauthorized();
  }

  // Rotate refresh token.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
  const tokens = await issueTokens(employee.userId, employee.businessId, employee.id, employee.role);

  return {
    ...tokens,
    session: serializeSession({ id: employee.id, role: employee.role, business: employee.business, user: toSessionUser(employee.user) }),
  };
}

export async function logout(refreshTokenValue: string) {
  const tokenHash = hashToken(refreshTokenValue);
  await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revoked: true } });
}

export async function getSession(userId: string, businessId: string) {
  const employee = await prisma.employee.findFirst({
    where: { userId, businessId, status: "ACTIVE" },
    include: { business: true, user: true },
  });
  if (!employee) throw ApiError.unauthorized();

  return serializeSession({ id: employee.id, role: employee.role, business: employee.business, user: toSessionUser(employee.user) });
}

/**
 * The signed-in person sets a new password. Every other session of theirs is
 * signed out (all refresh tokens revoked) and this one gets fresh tokens.
 */
export async function changePassword(
  auth: { userId: string; businessId: string; employeeId: string; role: Role },
  input: ChangePasswordInput,
) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId } });
  if (user.passwordHash) {
    if (!input.currentPassword || !(await comparePassword(input.currentPassword, user.passwordHash))) {
      throw ApiError.badRequest("Учурдагы пароль туура эмес.");
    }
    if (await comparePassword(input.newPassword, user.passwordHash)) {
      throw ApiError.badRequest("Жаңы пароль мурункусунан башка болушу керек.");
    }
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } }),
    prisma.refreshToken.updateMany({ where: { userId: user.id, revoked: false }, data: { revoked: true } }),
  ]);

  const tokens = await issueTokens(auth.userId, auth.businessId, auth.employeeId, auth.role);
  return { ...tokens, session: await getSession(auth.userId, auth.businessId) };
}

const RESET_TOKEN_TTL_MINUTES = 60;

const RESET_EMAIL = {
  ky: {
    subject: "Ainabi Business — паролду калыбына келтирүү",
    greeting: (name: string) => `Саламатсызбы, ${name}!`,
    body: "Ainabi Business аккаунтуңуз үчүн жаңы пароль коюу суралды. Төмөнкү шилтемени басып, жаңы паролуңузду коюңуз:",
    button: "Жаңы пароль коюу",
    expiry: `Шилтеме ${RESET_TOKEN_TTL_MINUTES} мүнөт иштейт жана бир жолу гана колдонулат.`,
    ignore: "Эгер муну сиз сураган эмес болсоңуз, бул катты көңүлгө албаңыз — паролуңуз өзгөрбөйт.",
  },
  ru: {
    subject: "Ainabi Business — восстановление пароля",
    greeting: (name: string) => `Здравствуйте, ${name}!`,
    body: "Для вашего аккаунта Ainabi Business запрошен новый пароль. Нажмите на ссылку ниже и задайте новый пароль:",
    button: "Задать новый пароль",
    expiry: `Ссылка действует ${RESET_TOKEN_TTL_MINUTES} минут и только один раз.`,
    ignore: "Если вы этого не запрашивали, просто проигнорируйте письмо — пароль не изменится.",
  },
};

/**
 * Emails a one-time link to set a new password. Always "succeeds" from the
 * caller's point of view — whether the email exists is never revealed.
 */
export async function requestPasswordReset(input: ForgotPasswordInput, lang: Lang = "ky") {
  if (!isEmailEnabled()) throw ApiError.badRequest("Email аркылуу калыбына келтирүү бул серверде жандырылган эмес.");

  // Emails were stored as typed, so match regardless of case.
  const user = await prisma.user.findFirst({ where: { email: { equals: input.email, mode: "insensitive" } } });
  if (!user) return;
  // Someone hammering the form shouldn't flood the person's inbox.
  const recent = await prisma.passwordResetToken.findFirst({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent) return;

  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Only the newest link works.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000) },
    }),
  ]);

  const link = `${env.clientUrls[0]}/reset-password?token=${token}`;
  const m = RESET_EMAIL[lang];
  const name = escapeHtml(user.name);
  try {
    await sendEmail({
      to: user.email,
      subject: m.subject,
      text: `${m.greeting(user.name)}\n\n${m.body}\n${link}\n\n${m.expiry}\n${m.ignore}`,
      html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#101828;line-height:1.5">
<p>${m.greeting(name)}</p>
<p>${m.body}</p>
<p><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${m.button}</a></p>
<p style="color:#475467;font-size:13px">${m.expiry}<br>${m.ignore}</p>
</div>`,
    });
  } catch (error) {
    console.error("Password reset email failed:", error);
    throw new ApiError(502, "Катты жөнөтүү мүмкүн болбоду. Бир аздан кийин кайра аракет кылыңыз.");
  }
}

/** Sets the new password from an emailed link and signs the person out everywhere. */
export async function resetPassword(input: ResetPasswordInput) {
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest("Шилтеменин мөөнөтү өтүп кеткен же ал мурун колдонулган. Жаңы шилтеме сураңыз.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash, mustChangePassword: false, failedLogins: 0, lockedUntil: null } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({ where: { userId: record.userId, revoked: false }, data: { revoked: true } }),
  ]);
}
