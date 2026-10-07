import { env } from "../config/env";

/**
 * Transactional email through Resend's HTTP API (plain fetch — no SDK, no
 * SMTP socket, which serverless hosts don't love). Without RESEND_API_KEY
 * and MAIL_FROM the app simply has no email, and features that need it
 * (password reset) fall back to their manual path.
 */
export function isEmailEnabled(): boolean {
  return !!env.mail.resendApiKey && !!env.mail.from;
}

export async function sendEmail(message: { to: string; subject: string; html: string; text: string }): Promise<void> {
  if (!isEmailEnabled()) throw new Error("Email is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.mail.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.mail.from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  });
  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

/** Minimal HTML escaping for values interpolated into an email body. */
export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
