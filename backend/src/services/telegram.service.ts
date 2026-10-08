import { randomBytes } from "crypto";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { hasPermission, Permission, Role } from "../config/permissions";
import { dayKey } from "../utils/dateRange";
import { sendTelegram, telegramEnabled } from "../utils/telegram";
import { normalizeLang, type Lang } from "../i18n/messages";
import { monthForecast, profitAndLoss } from "./analytics.service";
import { debtSummary } from "./debt.service";
import { getLowStock } from "./dashboard.service";
import * as assistant from "./assistant.service";

/**
 * Telegram for owners and managers: link once from Settings (a one-time
 * /start code), then get an evening report, instant alerts (cash short at a
 * shift close, new wholesale orders) and — when the AI assistant is on —
 * answers to questions about the shop.
 *
 * Every message goes only to people of that business whose role may see
 * the figures in it.
 */

const LINK_TTL_MINUTES = 15;

const TEXT = {
  ky: {
    linked: (shop: string) => `✅ Туташтырылды: «${shop}».\nАр кечинде отчет жана шашылыш кабарлар ушул жерге келет.\nБайланышты өчүрүү: /stop`,
    badCode: "Шилтеме эскирген же туура эмес. Ainabi → Настройкалар → Telegram'дан кайра басыңыз.",
    stopped: "Байланыш өчүрүлдү. Кабарлар мындан ары келбейт.",
    help: "Бул Ainabi Business боту. Туташтыруу үчүн: Ainabi → Настройкалар → Telegram → «Туташтыруу».",
    linkedHelp: "Мен ар кечинде отчет жөнөтөм жана маанилүү окуяларды кабарлайм.",
    noAi: "AI жардамчы азырынча жандырылган эмес — суроолорго жооп бере албайм.",
    daily: "📊 Бүгүнкү жыйынтык",
    revenue: "Сатуу",
    profit: "Таза пайда",
    checks: "Чек",
    plan: (p: number) => `🎯 Айлык план: ${p}% (ушул темп менен ай аягына)`,
    overdue: (n: number, sum: string) => `⏰ Мөөнөтү өткөн карыз: ${n} кардар, ${sum}`,
    remind: (n: number) => `💬 Бүгүн эскертүү керек: ${n} карыз`,
    lowStock: (names: string) => `📦 Бүтүп баратат: ${names}`,
    cashShort: (who: string, sum: string) => `🔴 ${who} сменаны жапты: кассада ${sum} жетишпейт.`,
    wholesaleNew: (buyer: string, sum: string) => `🤝 Жаңы оптом заказ: ${buyer}, ${sum}. Ainabi → Оптом тармак.`,
  },
  ru: {
    linked: (shop: string) => `✅ Подключено: «${shop}».\nКаждый вечер сюда будет приходить отчёт и срочные уведомления.\nОтключить: /stop`,
    badCode: "Ссылка устарела или неверна. Нажмите ещё раз в Ainabi → Настройки → Telegram.",
    stopped: "Отключено. Уведомления больше не придут.",
    help: "Это бот Ainabi Business. Чтобы подключить: Ainabi → Настройки → Telegram → «Подключить».",
    linkedHelp: "Я присылаю отчёт каждый вечер и сообщаю о важных событиях.",
    noAi: "AI-помощник пока не включён — на вопросы ответить не могу.",
    daily: "📊 Итоги дня",
    revenue: "Продажи",
    profit: "Чистая прибыль",
    checks: "Чеков",
    plan: (p: number) => `🎯 Месячный план: ${p}% (к концу месяца при текущем темпе)`,
    overdue: (n: number, sum: string) => `⏰ Просроченные долги: ${n} клиент(ов), ${sum}`,
    remind: (n: number) => `💬 Сегодня напомнить: ${n} долг(ов)`,
    lowStock: (names: string) => `📦 Заканчивается: ${names}`,
    cashShort: (who: string, sum: string) => `🔴 ${who} закрыл(а) смену: недостача в кассе ${sum}.`,
    wholesaleNew: (buyer: string, sum: string) => `🤝 Новый оптовый заказ: ${buyer}, ${sum}. Ainabi → Оптовая сеть.`,
  },
};

const som = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} сом`;
const textFor = (lang: string | null | undefined) => TEXT[normalizeLang(lang)];

// ---------- linking ----------

export async function linkStatus(employeeId: string) {
  const e = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { telegramChatId: true } });
  return { enabled: telegramEnabled(), botUsername: env.telegram.username, connected: !!e.telegramChatId };
}

/** One-time deep link: t.me/<bot>?start=<code>. Opening it and pressing Start links this employee. */
export async function createLink(employeeId: string, lang: Lang) {
  const code = randomBytes(18).toString("base64url");
  await prisma.employee.update({
    where: { id: employeeId },
    data: { telegramLinkCode: code, telegramLinkExpiresAt: new Date(Date.now() + LINK_TTL_MINUTES * 60_000), telegramLang: lang },
  });
  return { url: `https://t.me/${env.telegram.username}?start=${code}` };
}

export async function unlink(employeeId: string) {
  await prisma.employee.update({ where: { id: employeeId }, data: { telegramChatId: null, telegramLinkCode: null } });
}

// ---------- incoming messages ----------

interface TelegramUpdate {
  message?: { chat: { id: number; type: string }; text?: string; from?: { language_code?: string } };
}

export async function handleUpdate(update: TelegramUpdate) {
  const msg = update.message;
  if (!msg?.text || msg.chat.type !== "private") return;
  const chatId = String(msg.chat.id);
  const text = msg.text.trim();
  const guessLang = msg.from?.language_code === "ru" ? "ru" : "ky";

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    if (!code) return sendTelegram(chatId, textFor(guessLang).help);
    const employee = await prisma.employee.findFirst({
      where: { telegramLinkCode: code, telegramLinkExpiresAt: { gt: new Date() }, status: "ACTIVE" },
      include: { business: { select: { name: true } } },
    });
    if (!employee) return sendTelegram(chatId, textFor(guessLang).badCode);
    await prisma.employee.update({ where: { id: employee.id }, data: { telegramChatId: chatId, telegramLinkCode: null, telegramLinkExpiresAt: null } });
    return sendTelegram(chatId, textFor(employee.telegramLang).linked(employee.business.name));
  }

  const linked = await prisma.employee.findFirst({ where: { telegramChatId: chatId, status: "ACTIVE" }, orderBy: { createdAt: "asc" } });
  if (text === "/stop") {
    await prisma.employee.updateMany({ where: { telegramChatId: chatId }, data: { telegramChatId: null } });
    return sendTelegram(chatId, textFor(linked?.telegramLang ?? guessLang).stopped);
  }
  if (!linked) return sendTelegram(chatId, textFor(guessLang).help);

  const t = textFor(linked.telegramLang);
  // Anything else is a question for the AI assistant, under the same rules as in the app.
  if (!hasPermission(linked.role as Role, "assistant.use")) return sendTelegram(chatId, t.linkedHelp);
  if (!assistant.assistantStatus().enabled) return sendTelegram(chatId, t.noAi);
  try {
    const { answer } = await assistant.ask(linked.businessId, [{ role: "user", content: text.slice(0, 4000) }], normalizeLang(linked.telegramLang));
    await sendTelegram(chatId, answer);
  } catch (error) {
    await sendTelegram(chatId, error instanceof Error ? error.message : "Error");
  }
}

// ---------- outgoing ----------

/** Sends to every linked, active employee of the business whose role has `permission`. Never throws. */
export async function notifyBusiness(businessId: string, permission: Permission, message: (t: (typeof TEXT)["ky"]) => string) {
  if (!telegramEnabled()) return;
  try {
    const people = await prisma.employee.findMany({
      where: { businessId, status: "ACTIVE", telegramChatId: { not: null } },
      select: { role: true, telegramChatId: true, telegramLang: true },
    });
    await Promise.all(
      people
        .filter((p) => hasPermission(p.role as Role, permission))
        .map((p) => sendTelegram(p.telegramChatId!, message(textFor(p.telegramLang))).catch((e) => console.error("Telegram send failed:", e))),
    );
  } catch (error) {
    console.error("Telegram notify failed:", error);
  }
}

export function notifyCashShort(businessId: string, employeeName: string, shortage: number) {
  return notifyBusiness(businessId, "analytics.view", (t) => t.cashShort(employeeName, som(shortage)));
}

export function notifyWholesaleOrder(sellerBusinessId: string, buyerName: string, total: number) {
  return notifyBusiness(sellerBusinessId, "wholesale.sell", (t) => t.wholesaleNew(buyerName, som(total)));
}

/** The evening report, for every business that has someone linked. Run once a day by Vercel Cron. */
export async function sendDailyReports() {
  if (!telegramEnabled()) return { businesses: 0 };
  const businesses = await prisma.employee.findMany({
    where: { telegramChatId: { not: null }, status: "ACTIVE" },
    select: { businessId: true },
    distinct: ["businessId"],
  });
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (const { businessId } of businesses) {
    try {
      const [pnl, forecast, debts, low] = await Promise.all([
        profitAndLoss(businessId, startOfDay, now),
        monthForecast(businessId),
        debtSummary(businessId),
        getLowStock(businessId, 5),
      ]);
      const s = pnl.statement;
      await notifyBusiness(businessId, "reports.view", (t) =>
        [
          `${t.daily} — ${dayKey(now)}`,
          `${t.revenue}: ${som(s.revenue)}`,
          `${t.profit}: ${som(s.netProfit)}`,
          `${t.checks}: ${s.salesCount}`,
          forecast.forecastPercent !== null ? t.plan(Math.round(forecast.forecastPercent)) : null,
          debts.overdueCount > 0 ? t.overdue(debts.overdueCount, som(debts.overdueAmount)) : null,
          debts.remindToday > 0 ? t.remind(debts.remindToday) : null,
          low.length > 0 ? t.lowStock(low.map((p) => p.name).join(", ")) : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (error) {
      console.error(`Daily Telegram report failed for ${businessId}:`, error);
    }
  }
  return { businesses: businesses.length };
}
