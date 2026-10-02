import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import { extractErrorMessage } from "../services/api";

/**
 * Lets the signed-in person set their own password. Used in Settings and as
 * the forced first-login screen after the owner chose a temporary password.
 * Other devices are signed out by the server when it succeeds.
 */
export function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const { t } = useTranslation();
  const { session, changePassword } = useAuth();
  const { showToast } = useToast();
  const needsCurrent = session?.user.hasPassword !== false;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < 8) return setError(t("password.tooShort"));
    if (next !== repeat) return setError(t("password.mismatch"));
    setSaving(true);
    try {
      await changePassword({ currentPassword: needsCurrent ? current : undefined, newPassword: next });
      showToast({ variant: "success", title: t("password.changed"), message: t("password.changedMessage") });
      setCurrent("");
      setNext("");
      setRepeat("");
      onDone?.();
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const type = show ? "text" : "password";

  return (
    <form className="stack gap-4" onSubmit={handleSubmit}>
      {needsCurrent && (
        <div className="field">
          <label className="field-label">{t("password.current")}</label>
          <input type={type} className="input" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
        </div>
      )}
      <div className="form-grid">
        <div className="field">
          <label className="field-label">{t("password.new")}</label>
          <input type={type} className="input" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
        <div className="field">
          <label className="field-label">{t("password.repeat")}</label>
          <input type={type} className="input" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      <span className="field-hint">{t("password.hint")}</span>
      {error && <span className="field-error">{error}</span>}
      <div className="row gap-3" style={{ flexWrap: "wrap" }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          <KeyRound size={16} />
          {saving ? t("common.saving") : t("password.submit")}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShow((v) => !v)}>
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
          {show ? t("password.hide") : t("password.show")}
        </button>
      </div>
    </form>
  );
}
