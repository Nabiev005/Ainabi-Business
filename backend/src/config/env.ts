import "dotenv/config";
import { createHash } from "crypto";

const nodeEnv = process.env.NODE_ENV ?? "development";
export const isProduction = nodeEnv === "production";

function required(name: string): string {
  // .trim() guards against a stray trailing newline/space from copy-pasting
  // a value into a dashboard env var field (a real, previously-hit bug).
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

/**
 * JWT secrets have NO fallback on purpose — a silently-applied default would
 * mean anyone who can read this source (it's open) could forge tokens for a
 * deployment that forgot to set its own secret. Missing/weak values fail the
 * process at boot instead of running insecurely.
 */
function requiredSecret(name: string): string {
  const value = required(name);
  const looksLikePlaceholder = /change_this|change_me|dev_.*_secret/i.test(value);
  if (isProduction && (looksLikePlaceholder || value.length < 32)) {
    throw new Error(
      `${name} looks like a placeholder or is too short for production. ` +
        `Generate a real secret, e.g. \`openssl rand -base64 48\`, and set it in the environment.`,
    );
  }
  return value;
}

// CLIENT_URL accepts one origin, or a comma-separated list (handy for a
// production domain + Vercel preview deployments during rollout).
const clientUrls = (process.env.CLIENT_URL ?? "http://localhost:5173")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

export const env = {
  nodeEnv,
  port: Number(process.env.PORT ?? 4000),
  clientUrls,
  databaseUrl: required("DATABASE_URL"),
  jwt: {
    accessSecret: requiredSecret("JWT_ACCESS_SECRET"),
    refreshSecret: requiredSecret("JWT_REFRESH_SECRET"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? "30d",
  },
  google: {
    clientId: (process.env.GOOGLE_CLIENT_ID ?? "").trim(),
  },
  refreshCookieName: "ainabi_refresh_token",
  // Transactional email (password reset links) via Resend. Both unset = no
  // email; "forgot password" then points people to the owner / support.
  // AI assistant (Claude). No ANTHROPIC_API_KEY = the assistant is off.
  assistant: {
    apiKey: (process.env.ANTHROPIC_API_KEY ?? "").trim(),
    // Questions per business per day — keeps the API bill predictable.
    dailyLimit: Number(process.env.ASSISTANT_DAILY_LIMIT ?? 40),
  },
  // Telegram bot for owners (reports, alerts, questions). No token = off.
  telegram: {
    token: (process.env.TELEGRAM_BOT_TOKEN ?? "").trim(),
    username: (process.env.TELEGRAM_BOT_USERNAME ?? "ainabi_business_bot").trim().replace(/^@/, ""),
    // Telegram echoes this on every webhook call. Derived from the token unless set.
    webhookSecret: (process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim() || createHash("sha256").update(`webhook:${process.env.TELEGRAM_BOT_TOKEN ?? ""}`).digest("hex").slice(0, 48),
    // Vercel Cron sends "Authorization: Bearer $CRON_SECRET".
    cronSecret: (process.env.CRON_SECRET ?? "").trim(),
  },
  mail: {
    resendApiKey: (process.env.RESEND_API_KEY ?? "").trim(),
    // e.g. "Ainabi Business <no-reply@ainabi.site>" — the domain must be verified in Resend.
    from: (process.env.MAIL_FROM ?? "").trim(),
  },
  // Platform owner(s) — can see every business and extend subscriptions
  // after a payment. Comma-separated emails of existing accounts.
  platformAdminEmails: (process.env.PLATFORM_ADMIN_EMAILS || "ajbeknabiev90@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
  // Shown on the billing page: where customers send the subscription fee
  // (e.g. "MBank QR / +996 700 000 000, Айбек Н.").
  platformPaymentInfo: (process.env.PLATFORM_PAYMENT_INFO || "O!Деньги / MBank: +996 702 952 200 (Айбек Н.)").trim(),
  // Payment QR shown on the billing page (a file in frontend/public, or a full URL).
  platformPaymentQr: (process.env.PLATFORM_PAYMENT_QR || "/payment-qr.jpg").trim(),
  platformSupportWhatsapp: (process.env.PLATFORM_SUPPORT_WHATSAPP ?? "996702952200").trim(),
  // Set to "true" when the frontend and backend live on different domains
  // (e.g. Vercel frontend + Railway backend) — browsers only send a
  // same-site cookie ("Lax") on same-origin requests, so a cross-domain
  // deployment needs SameSite=None (which in turn requires Secure/HTTPS).
  // Same-domain deployments (or local dev) should leave this unset.
  cookieCrossSite: process.env.COOKIE_CROSS_SITE === "true",
};

/**
 * The platform owner: an account whose email is in PLATFORM_ADMIN_EMAILS
 * *and* is linked to Google. The Google link is the proof the person
 * controls that mailbox — a password account could have been created with
 * any address (there is no email verification on sign-up).
 */
export function isPlatformAdminUser(user: { email: string; googleId: string | null }): boolean {
  return !!user.googleId && env.platformAdminEmails.includes(user.email.trim().toLowerCase());
}
