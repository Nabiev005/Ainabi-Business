import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, KeyRound, Lock, LogIn, MoveLeft } from "lucide-react";
import { BrandPanel } from "./BrandPanel";
import * as authService from "../../services/auth.service";
import { extractErrorMessage } from "../../services/api";
import "./Auth.css";

/** Opened from the emailed link: /reset-password?token=… */
export default function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setError(t("password.tooShort"));
    if (password !== repeat) return setError(t("password.mismatch"));
    setSaving(true);
    setError(null);
    try {
      await authService.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-shell">
      <BrandPanel />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">{t("auth.resetPassword.title")}</h1>
            <p className="auth-subtitle">{t("auth.resetPassword.subtitle")}</p>
          </div>

          {!token ? (
            <div className="forgot-option">
              <KeyRound size={20} />
              <div className="stack gap-2">
                <span className="text-muted">{t("auth.resetPassword.noToken")}</span>
                <Link to="/forgot-password" className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }}>
                  {t("auth.resetPassword.requestNew")}
                </Link>
              </div>
            </div>
          ) : done ? (
            <div className="stack gap-4">
              <div className="forgot-option">
                <CheckCircle2 size={20} />
                <div className="stack gap-1">
                  <strong>{t("auth.resetPassword.doneTitle")}</strong>
                  <span className="text-muted">{t("auth.resetPassword.doneText")}</span>
                </div>
              </div>
              <Link to="/login" className="btn btn-primary btn-block">
                <LogIn size={16} /> {t("auth.login.submit")}
              </Link>
            </div>
          ) : (
            <form className="stack gap-4" onSubmit={handleSubmit}>
              <div className="field">
                <label className="field-label" htmlFor="new-password">
                  {t("password.new")}
                </label>
                <div className="input-with-icon">
                  <Lock size={16} />
                  <input id="new-password" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="field">
                <label className="field-label" htmlFor="repeat-password">
                  {t("password.repeat")}
                </label>
                <div className="input-with-icon">
                  <Lock size={16} />
                  <input id="repeat-password" type="password" autoComplete="new-password" className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
                </div>
                <span className="field-hint">{t("auth.resetPassword.hint")}</span>
                {error && <span className="field-error">{error}</span>}
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={saving || !password || !repeat}>
                <KeyRound size={18} />
                {saving ? t("common.saving") : t("password.submit")}
              </button>
              {error && (
                <Link to="/forgot-password" style={{ textAlign: "center", fontSize: "var(--font-size-sm)" }}>
                  {t("auth.resetPassword.requestNew")}
                </Link>
              )}
            </form>
          )}

          <Link to="/login" className="auth-footer-note" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
            <MoveLeft size={14} /> {t("auth.forgotPassword.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
