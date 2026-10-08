import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Send, Unlink } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { api, extractErrorMessage } from "../../services/api";

interface LinkStatus {
  enabled: boolean;
  botUsername: string;
  connected: boolean;
}

/** Link this person's Telegram to the Ainabi bot: evening report + alerts (+ questions to the AI). */
export function TelegramCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [waiting, setWaiting] = useState(false);
  const poll = useRef<number | null>(null);

  const load = () =>
    api
      .get<LinkStatus>("/telegram/link")
      .then(({ data }) => {
        setStatus(data);
        return data;
      })
      .catch(() => null);

  useEffect(() => {
    void load();
    return () => {
      if (poll.current) window.clearInterval(poll.current);
    };
  }, []);

  async function connect() {
    // Open the tab synchronously (popup blockers), then point it at the link.
    const tab = window.open("about:blank", "_blank");
    try {
      const { data } = await api.post<{ url: string }>("/telegram/link");
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
      setWaiting(true);
      // Wait for the person to press Start in Telegram (up to ~2 minutes).
      let tries = 0;
      poll.current = window.setInterval(async () => {
        tries += 1;
        const s = await load();
        if (s?.connected || tries > 40) {
          window.clearInterval(poll.current!);
          setWaiting(false);
          if (s?.connected) showToast({ variant: "success", title: t("settings.telegram.connected") });
        }
      }, 3000);
    } catch (error) {
      tab?.close();
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  async function disconnect() {
    await api.delete("/telegram/link").catch(() => undefined);
    void load();
  }

  if (status && !status.enabled) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <Send size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          Telegram
        </h2>
      </div>
      <div className="card-pad stack gap-3">
        <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
          {t("settings.telegram.intro")}
        </p>
        {status?.connected ? (
          <div className="row gap-3" style={{ flexWrap: "wrap" }}>
            <span className="row gap-2" style={{ color: "var(--color-success-text)", fontWeight: 700 }}>
              <CheckCircle2 size={18} /> {t("settings.telegram.connectedTo", { bot: `@${status.botUsername}` })}
            </span>
            <button className="btn btn-secondary btn-sm" onClick={disconnect}>
              <Unlink size={14} /> {t("settings.telegram.disconnect")}
            </button>
          </div>
        ) : (
          <div className="row gap-3" style={{ flexWrap: "wrap" }}>
            <button className="btn btn-primary" onClick={connect} disabled={!status || waiting}>
              <Send size={16} /> {waiting ? t("settings.telegram.waiting") : t("settings.telegram.connect")}
            </button>
            {waiting && <span className="field-hint">{t("settings.telegram.pressStart")}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
