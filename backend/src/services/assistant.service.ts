import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { dayKey } from "../utils/dateRange";
import type { Lang } from "../i18n/messages";
import { ASSISTANT_TOOLS, runAssistantTool } from "./assistant.tools";

/**
 * The in-app AI assistant: the owner asks about their business in plain
 * Kyrgyz or Russian, Claude looks the answer up through read-only tools
 * scoped to that business, and replies.
 *
 * Stateless: the browser keeps the conversation (text only) and sends it
 * with every question.
 */

const MODEL = "claude-opus-5-5";
/** Tool round-trips per question before we stop and answer with what we have. */
const MAX_STEPS = 8;

let client: Anthropic | null = null;
function getClient() {
  if (!env.assistant.apiKey) throw new ApiError(503, "AI жардамчы бул серверде жандырылган эмес.");
  client ??= new Anthropic({ apiKey: env.assistant.apiKey });
  return client;
}

export function assistantStatus() {
  return { enabled: !!env.assistant.apiKey, dailyLimit: env.assistant.dailyLimit };
}

const LANGUAGE: Record<Lang, string> = { ky: "Kyrgyz", ru: "Russian" };

// Frozen text first (cacheable); the per-request facts go in a second block.
const INSTRUCTIONS = `You are the business assistant inside Ainabi Business, a point-of-sale and inventory system used by shops in Kyrgyzstan.
You answer the owner's or manager's questions about their own shop: sales, profit, expenses, stock, customer debts, slow-moving goods, the monthly plan, and how each employee is doing.

How to work:
- Always look numbers up with the tools. Never guess or invent figures. If the tools can't answer something, say so plainly and suggest which page of the app shows it.
- Resolve relative dates ("today", "yesterday", "this week", "last month", "бүгүн", "кечээ", "өткөн ай") against today's date given below. Weeks start on Monday.
- Money is in Kyrgyz som; write it like "12 500 сом". Round to whole som unless the amount is small.
- Be short and concrete: lead with the answer, then at most a few supporting lines. Plain text only — no Markdown tables, no headings, no ** bold **. A short "- " list is fine.
- When something looks wrong (a loss, a cash shortage, stock running out, an old debt), point it out and give one practical suggestion.
- You can only read data. If asked to change something (add a product, delete a sale, give a discount), explain where in the app to do it.
- Only discuss this business. Politely decline unrelated requests.`;

function systemPrompt(lang: Lang, businessName: string) {
  return [
    { type: "text" as const, text: INSTRUCTIONS, cache_control: { type: "ephemeral" as const } },
    {
      type: "text" as const,
      text: `Shop: ${businessName}\nToday: ${dayKey(new Date())} (Asia/Bishkek)\nReply in ${LANGUAGE[lang]}.`,
    },
  ];
}

/** Counts this question against the business's daily allowance (atomic, so parallel requests can't slip past). */
async function takeQuota(businessId: string) {
  const usage = await prisma.assistantUsage.upsert({
    where: { businessId_day: { businessId, day: dayKey(new Date()) } },
    create: { businessId, day: dayKey(new Date()), count: 1 },
    update: { count: { increment: 1 } },
  });
  if (usage.count > env.assistant.dailyLimit) {
    throw new ApiError(429, "Бүгүнкү AI суроолордун лимити бүттү. Эртең кайра аракет кылыңыз.", { code: "ASSISTANT_LIMIT" });
  }
  return env.assistant.dailyLimit - usage.count;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function ask(businessId: string, history: ChatTurn[], lang: Lang) {
  const anthropic = getClient();
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, select: { name: true } });
  const remaining = await takeQuota(businessId);

  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.content }));

  for (let step = 0; step < MAX_STEPS; step++) {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await anthropic.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // Chat-style lookups: low effort keeps answers fast and cheap.
        output_config: { effort: "low" },
        // If a safety classifier declines, the API retries on a fallback model itself.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: systemPrompt(lang, business.name),
        tools: ASSISTANT_TOOLS,
        messages,
      });
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) throw new ApiError(503, "AI жардамчы азыр бош эмес. Бир мүнөттөн кийин кайра сураңыз.");
      if (error instanceof Anthropic.APIError) {
        console.error(`Assistant API error ${error.status}:`, error.message);
        throw new ApiError(502, "AI жардамчы жооп бере алган жок. Кайра аракет кылыңыз.");
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      return { answer: lang === "ru" ? "На этот вопрос я ответить не могу." : "Бул суроого жооп бере албайм.", remaining };
    }

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results = await Promise.all(
        calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const { content, isError } = await runAssistantTool(businessId, call.name, call.input);
          return { type: "tool_result", tool_use_id: call.id, content, is_error: isError };
        }),
      );
      // All results of one turn go back in a single user message.
      messages.push({ role: "user", content: results });
      continue;
    }

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    // end_turn (or max_tokens): whatever text the model wrote is the answer.
    const answer = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return { answer: answer || (lang === "ru" ? "Не удалось сформировать ответ." : "Жооп даярдай алган жокмун."), remaining };
  }

  return {
    answer: lang === "ru" ? "Вопрос оказался слишком сложным. Попробуйте спросить проще." : "Суроо өтө татаал болуп калды. Жөнөкөйүрөөк сурап көрүңүз.",
    remaining,
  };
}
