import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlarmClock, DollarSign, Handshake, Instagram, LucideIcon, ShieldAlert, Sparkles, Target, X } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { sessionCan } from "../hooks/usePermissions";
import type { Permission } from "../types";
import "./WhatsNew.css";

/** What shipped in the latest release — shown on the landing page and once on the dashboard. */
export const NEW_FEATURES: { key: string; icon: LucideIcon; path: string; permission: Permission }[] = [
  { key: "debts", icon: AlarmClock, path: "/debts", permission: "debts.view" },
  { key: "usd", icon: DollarSign, path: "/settings", permission: "settings.products" },
  { key: "risk", icon: ShieldAlert, path: "/risk", permission: "analytics.view" },
  { key: "catalog", icon: Instagram, path: "/settings", permission: "settings.business" },
  { key: "wholesale", icon: Handshake, path: "/wholesale", permission: "wholesale.buy" },
  { key: "assistant", icon: Sparkles, path: "/assistant", permission: "assistant.use" },
  { key: "forecast", icon: Target, path: "/analytics", permission: "analytics.view" },
];

/** Bump when a new batch of features ships, so the dashboard card shows again. */
const RELEASE = "2026-10";
const STORAGE_KEY = "ainabi.whatsNew.dismissed";

function isDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === RELEASE;
  } catch {
    return false;
  }
}

/** Dashboard card: the new features this person can actually open, until they close it. */
export function WhatsNewCard() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [hidden, setHidden] = useState(isDismissed);
  const items = NEW_FEATURES.filter((f) => sessionCan(session, f.permission));
  if (hidden || items.length === 0) return null;

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(STORAGE_KEY, RELEASE);
    } catch {
      /* private mode — it just shows again next time */
    }
  }

  return (
    <div className="card whatsnew-card animate-in">
      <div className="whatsnew-head">
        <div className="stack">
          <strong>🎉 {t("whatsNew.title")}</strong>
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
            {t("whatsNew.subtitle")}
          </span>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={dismiss} aria-label={t("common.close")}>
          <X size={16} />
        </button>
      </div>
      <div className="whatsnew-grid">
        {items.map(({ key, icon: Icon, path }) => (
          <Link key={key} to={path} className="whatsnew-item">
            <span className="whatsnew-icon">
              <Icon size={18} />
            </span>
            <span className="stack" style={{ minWidth: 0 }}>
              <strong>{t(`whatsNew.items.${key}.title`)}</strong>
              <span className="text-muted">{t(`whatsNew.items.${key}.short`)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
