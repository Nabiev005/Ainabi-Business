import { api } from "./api";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export async function getAssistantStatus(): Promise<{ enabled: boolean; dailyLimit: number }> {
  const { data } = await api.get<{ enabled: boolean; dailyLimit: number }>("/assistant");
  return data;
}

/** Sends the whole conversation (ending with the new question); the server keeps no history. */
export async function askAssistant(messages: ChatTurn[]): Promise<{ answer: string; remaining: number }> {
  // Answers that need several lookups can take a while.
  const { data } = await api.post<{ answer: string; remaining: number }>("/assistant/chat", { messages }, { timeout: 120_000 });
  return data;
}
