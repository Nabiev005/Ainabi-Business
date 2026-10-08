import { env } from "../config/env";

/**
 * Minimal Telegram Bot API client (plain fetch — the whole surface we need
 * is two methods). No TELEGRAM_BOT_TOKEN = Telegram is simply off.
 */

export const telegramEnabled = () => !!env.telegram.token;

async function call(method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${env.telegram.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? response.status}`);
  return data;
}

/** Sends plain text (Telegram caps a message at 4096 characters). */
export async function sendTelegram(chatId: string, text: string) {
  if (!telegramEnabled()) return;
  await call("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), disable_web_page_preview: true });
}

let webhookSet = false;

/**
 * Points the bot at our webhook (idempotent). Done lazily the first time
 * someone opens the Telegram card, so deploying needs no manual step.
 */
export async function ensureWebhook() {
  if (!telegramEnabled() || webhookSet) return;
  const base = env.clientUrls[0];
  await call("setWebhook", {
    url: `${base}/api/telegram/webhook`,
    secret_token: env.telegram.webhookSecret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });
  webhookSet = true;
}
