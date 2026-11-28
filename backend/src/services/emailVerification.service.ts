import { randomBytes } from "crypto";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { hashToken } from "../utils/password";
import { escapeHtml, isEmailEnabled, sendEmail } from "../utils/mailer";
import { TRIAL_DAYS } from "../config/plans";
import type { Lang } from "../i18n/messages";

/**
 * "Confirm your email" for password sign-ups. While unconfirmed, the new
 * business gets a short trial (UNVERIFIED_TRIAL_DAYS); confirming extends it
 * to the full TRIAL_DAYS. Only switched on when the server can send email —
 * without Resend nobody could ever confirm, so every sign-up counts as
 * confirmed and nothing changes.
 */

const LINK_TTL_HOURS = 72;

const EMAIL = {
  ky: {
    subject: "Ainabi Business — email'иңизди тастыктаңыз",
    greeting: (name: string) => `Саламатсызбы, ${name}!`,
    body: `Ainabi Business'те катталганыңыз үчүн рахмат. Email'иңизди тастыктаңыз — ошондо бекер сынамык мөөнөт ${TRIAL_DAYS} күнгө узарат:`,
    button: "Email'ди тастыктоо",
    expiry: `Шилтеме ${LINK_TTL_HOURS} саат иштейт.`,
    ignore: "Эгер сиз катталбаган болсоңуз, бул катты көңүлгө албаңыз.",
  },
  ru: {
    subject: "Ainabi Business — подтвердите email",
    greeting: (name: string) => `Здравствуйте, ${name}!`,
    body: `Спасибо за регистрацию в Ainabi Business. Подтвердите email — тогда бесплатный пробный период продлится до ${TRIAL_DAYS} дней:`,
    button: "Подтвердить email",
    expiry: `Ссылка действует ${LINK_TTL_HOURS} часа.`,
    ignore: "Если вы не регистрировались, просто проигнорируйте письмо.",
  },
};

/** Whether new password sign-ups have to confirm their address. */
export function verificationRequired() {
  return isEmailEnabled();
}

export async function sendVerificationEmail(user: { id: string; name: string; email: string }, lang: Lang = "ky") {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Only the newest link works.
    prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
    prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_TTL_HOURS * 3_600_000) },
    }),
  ]);
  const link = `${env.clientUrls[0]}/verify-email?token=${token}`;
  const m = EMAIL[lang];
  await sendEmail({
    to: user.email,
    subject: m.subject,
    text: `${m.greeting(user.name)}\n\n${m.body}\n${link}\n\n${m.expiry}\n${m.ignore}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#101828;line-height:1.5">
<p>${m.greeting(escapeHtml(user.name))}</p>
<p>${m.body}</p>
<p><a href="${link}" style="display:inline-block;background:#1d4ed8;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:bold">${m.button}</a></p>
<p style="color:#475467;font-size:13px">${m.expiry}<br>${m.ignore}</p>
</div>`,
  });
}

/** The signed-in owner asks for the link again. */
export async function resendVerification(userId: string, lang: Lang = "ky") {
  if (!verificationRequired()) throw ApiError.badRequest("Email жөнөтүү бул серверде жандырылган эмес.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { alreadyVerified: true };
  // Someone hammering the button shouldn't flood the inbox.
  const recent = await prisma.emailVerificationToken.findFirst({ where: { userId, createdAt: { gt: new Date(Date.now() - 60_000) } } });
  if (recent) throw ApiError.badRequest("Кат жаңы эле жөнөтүлдү. Бир мүнөттөн кийин кайра аракет кылыңыз.");
  try {
    await sendVerificationEmail(user, lang);
  } catch (error) {
    console.error("Verification email failed:", error);
    throw new ApiError(502, "Катты жөнөтүү мүмкүн болбоду. Бир аздан кийин кайра аракет кылыңыз.");
  }
  return { alreadyVerified: false };
}

/** Confirms the address from the emailed link and gives the full trial. */
export async function verifyEmail(token: string) {
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw ApiError.badRequest("Шилтеменин мөөнөтү өтүп кеткен же ал мурун колдонулган. Жаңы шилтеме сураңыз.");
  }
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.emailVerificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: now } });
    if (count === 0) throw ApiError.badRequest("Шилтеменин мөөнөтү өтүп кеткен же ал мурун колдонулган. Жаңы шилтеме сураңыз.");
    await tx.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: now } });
    // The short trial grows to the full one, counted from the sign-up day.
    const trials = await tx.business.findMany({ where: { ownerId: record.userId, isTrial: true, complimentary: false } });
    for (const b of trials) {
      const fullEnd = new Date(b.createdAt.getTime() + TRIAL_DAYS * 86_400_000);
      if (!b.planExpiresAt || b.planExpiresAt < fullEnd) {
        await tx.business.update({ where: { id: b.id }, data: { planExpiresAt: fullEnd } });
      }
    }
  });
}
