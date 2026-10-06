import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Mail, MailCheck, MessageCircle, MoveLeft, Send, UserCog } from "lucide-react";
import { BrandPanel } from "./BrandPanel";
import * as authService from "../../services/auth.service";
import { extractErrorMessage } from "../../services/api";
import "./Auth.css";

const SUPPORT_WHATSAPP = "996702952200";

/**
 * When the server can send email, anyone with a password account gets a
 * one-time reset link. Without email (or for people who'd rather not wait)
 * the page still says what works: an employee asks the owner for a new
 * temporary password; an owner signs in with Google or writes to support.
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const whatsappText = encodeURIComponent(t("auth.forgotPassword.whatsappMessage"));
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authService
      .getPasswordResetStatus()
      .then((s) => setEmailEnabled(s.emailEnabled))
      .catch(() => setEmailEnabled(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      await authService.requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="auth-shell">
      <BrandPanel />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">{t("auth.forgotPassword.title")}</h1>
            <p className="auth-subtitle">{emailEnabled ? t("auth.forgotPassword.emailSubtitle") : t("auth.forgotPassword.subtitle")}</p>
          </div>

          {emailEnabled &&
            (sent ? (
              <div className="forgot-option">
                <MailCheck size={20} />
                <div className="stack gap-1">
                  <strong>{t("auth.forgotPassword.sentTitle")}</strong>
                  <span className="text-muted">{t("auth.forgotPassword.sentText", { email: email.trim() })}</span>
                </div>
              </div>
            ) : (
              <form className="stack gap-3" onSubmit={handleSubmit}>
                <div className="field">
                  <label className="field-label" htmlFor="reset-email">
                    {t("auth.login.email")}
                  </label>
                  <div className="input-with-icon">
                    <Mail size={16} />
                    <input id="reset-email" type="email" required className="input" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                  </div>
                  {error && <span className="field-error">{error}</span>}
                </div>
                <button type="submit" className="btn btn-primary btn-block" disabled={sending || !email.trim()}>
                  <Send size={16} />
                  {sending ? t("auth.forgotPassword.sending") : t("auth.forgotPassword.send")}
                </button>
              </form>
            ))}

          {emailEnabled && <div className="auth-divider">{t("auth.forgotPassword.otherWays")}</div>}

          <div className="stack gap-4">
            <div className="forgot-option">
              <UserCog size={20} />
              <div className="stack gap-1">
                <strong>{t("auth.forgotPassword.employeeTitle")}</strong>
                <span className="text-muted">{t("auth.forgotPassword.employeeText")}</span>
              </div>
            </div>
            <div className="forgot-option">
              <MessageCircle size={20} />
              <div className="stack gap-2">
                <strong>{t("auth.forgotPassword.ownerTitle")}</strong>
                <span className="text-muted">{t("auth.forgotPassword.ownerText")}</span>
                <a className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${whatsappText}`} target="_blank" rel="noreferrer">
                  <MessageCircle size={14} /> {t("auth.forgotPassword.whatsapp")}
                </a>
              </div>
            </div>
          </div>

          <Link to="/login" className="auth-footer-note" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
            <MoveLeft size={14} /> {t("auth.forgotPassword.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
