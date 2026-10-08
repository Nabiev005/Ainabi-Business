import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bot, Eraser, SendHorizontal, Sparkles, User } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import * as assistantService from "../../services/assistant.service";
import type { ChatTurn } from "../../services/assistant.service";
import { extractErrorMessage } from "../../services/api";
import "./Assistant.css";

/** Only the last turns go to the server — enough context for follow-ups, bounded cost. */
const HISTORY_SENT = 12;
const STORAGE_KEY = "ainabi.assistant.chat";

function loadChat(): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChatTurn[]) : [];
  } catch {
    return [];
  }
}

export default function Assistant() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ enabled: boolean; dailyLimit: number } | null>(null);
  const [chat, setChat] = useState<ChatTurn[]>(loadChat);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const suggestions = t("assistant.suggestions", { returnObjects: true }) as string[];

  useEffect(() => {
    assistantService
      .getAssistantStatus()
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, dailyLimit: 0 }));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chat.slice(-40)));
    } catch {
      /* private mode — the chat just won't survive a reload */
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat, pending]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    const next = [...chat, { role: "user" as const, content: text }];
    setChat(next);
    setInput("");
    setError(null);
    setPending(true);
    try {
      // The server wants the history to start with a question.
      let history = next.slice(-HISTORY_SENT);
      while (history.length > 1 && history[0].role !== "user") history = history.slice(1);
      const { answer, remaining: left } = await assistantService.askAssistant(history);
      setChat((c) => [...c, { role: "assistant", content: answer }]);
      setRemaining(left);
    } catch (err) {
      setError(extractErrorMessage(err));
      // Keep the question in the box so it can be re-sent.
      setChat((c) => c.slice(0, -1));
      setInput(text);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <div className="stack gap-6 assistant-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("assistant.title")}</h1>
          <p className="page-subtitle">{t("assistant.subtitle")}</p>
        </div>
        {chat.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setChat([])} disabled={pending}>
            <Eraser size={14} /> {t("assistant.clear")}
          </button>
        )}
      </div>

      {status && !status.enabled ? (
        <div className="card card-pad">
          <EmptyState title={t("assistant.disabledTitle")} subtitle={t("assistant.disabledText")} />
        </div>
      ) : (
        <div className="card assistant-card">
          <div className="assistant-messages" aria-live="polite">
            {chat.length === 0 && (
              <div className="assistant-welcome">
                <div className="assistant-welcome-icon">
                  <Sparkles size={26} />
                </div>
                <h2>{t("assistant.welcomeTitle")}</h2>
                <p>{t("assistant.welcomeText")}</p>
                <div className="assistant-suggestions">
                  {suggestions.map((s) => (
                    <button key={s} className="assistant-suggestion" onClick={() => void send(s)} disabled={pending || !status}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {chat.map((turn, i) => (
              <div key={i} className={`assistant-msg assistant-msg-${turn.role}`}>
                <div className="assistant-avatar">{turn.role === "user" ? <User size={16} /> : <Bot size={16} />}</div>
                <div className="assistant-bubble">{turn.content}</div>
              </div>
            ))}

            {pending && (
              <div className="assistant-msg assistant-msg-assistant">
                <div className="assistant-avatar">
                  <Bot size={16} />
                </div>
                <div className="assistant-bubble assistant-typing">
                  <span />
                  <span />
                  <span />
                  <em>{t("assistant.thinking")}</em>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div className="assistant-error">{error}</div>}

          <form className="assistant-input" onSubmit={handleSubmit}>
            <textarea
              className="textarea"
              rows={2}
              maxLength={4000}
              placeholder={t("assistant.placeholder")}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={pending || !status}
            />
            <button type="submit" className="btn btn-primary" disabled={pending || !input.trim() || !status} aria-label={t("assistant.send")}>
              <SendHorizontal size={18} />
            </button>
          </form>
          <p className="assistant-footnote">
            {t("assistant.footnote")}
            {remaining !== null && ` ${t("assistant.remaining", { count: remaining })}`}
          </p>
        </div>
      )}
    </div>
  );
}
