import { OAuth2Client } from "google-auth-library";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { comparePassword, hashPassword, hashToken } from "../utils/password";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../utils/jwt";
import { GoogleAuthInput, LoginInput, RegisterInput } from "../validators/auth.validator";
import { applyTemplate } from "./settings.service";
import type { Lang } from "../i18n/messages";

const REFRESH_TOKEN_TTL_DAYS = 30;
const googleClient = new OAuth2Client(env.google.clientId);

function serializeSession(employee: {
  id: string;
  role: "OWNER" | "ADMIN" | "CASHIER";
  business: { id: string; name: string; currency: string; phone?: string | null; address?: string | null; qrPaymentInfo?: string | null };
  user: { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null; provider: string };
}) {
  return {
    user: employee.user,
    business: employee.business,
    role: employee.role,
    employeeId: employee.id,
  };
}

async function issueTokens(userId: string, businessId: string, employeeId: string, role: "OWNER" | "ADMIN" | "CASHIER") {
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

function toSessionUser(user: { id: string; name: string; email: string; phone: string | null; avatarUrl: string | null; provider: string }) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone, avatarUrl: user.avatarUrl, provider: user.provider };
}

export async function register(input: RegisterInput, lang: Lang = "ky") {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw ApiError.conflict("Бул email менен аккаунт мурунтан бар.");
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
      data: { name: input.businessName, ownerId: user.id, phone: input.phone },
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

  if (!user.passwordHash) {
    throw ApiError.unauthorized("Бул аккаунт Google аркылуу катталган. \"Google менен кирүү\" баскычын колдонуңуз.");
  }

  const valid = await comparePassword(input.password, user.passwordHash);
  if (!valid) {
    throw ApiError.unauthorized("Email же пароль туура эмес.");
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
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleId: payload.sub, avatarUrl: payload.picture ?? existingByEmail.avatarUrl },
      });
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
        data: { name: `${name} дүкөнү`, ownerId: newUser.id },
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
    where: { userId, businessId },
    include: { business: true, user: true },
  });
  if (!employee) throw ApiError.unauthorized();

  return serializeSession({ id: employee.id, role: employee.role, business: employee.business, user: toSessionUser(employee.user) });
}
