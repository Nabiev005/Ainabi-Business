import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, RefreshCw } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import type { Employee } from "../../types";

interface ResetPasswordModalProps {
  employee: Employee | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}

/** Readable temporary password without look-alike characters (0/O, 1/l/I). */
function generatePassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Owner gives an employee who forgot their password a temporary one. The
 * employee is signed out everywhere and must pick their own on next sign-in.
 */
export function ResetPasswordModal({ employee, submitting, onClose, onSubmit }: ResetPasswordModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (employee) {
      setPassword(generatePassword());
      setCopied(false);
    }
  }, [employee]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal open={!!employee} onClose={onClose}>
      <form
        className="stack gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length >= 8) onSubmit(password);
        }}
      >
        <div className="stack gap-1">
          <h2 className="card-title">{t("employees.resetPassword.title")}</h2>
          <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            {t("employees.resetPassword.subtitle", { name: employee?.name ?? "" })}
          </p>
        </div>

        <div className="field">
          <label className="field-label">{t("employees.resetPassword.tempPassword")}</label>
          <div className="row gap-2">
            <input className="input mono-num" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
            <button type="button" className="btn btn-secondary btn-icon" title={t("employees.resetPassword.generate")} onClick={() => setPassword(generatePassword())}>
              <RefreshCw size={16} />
            </button>
            <button type="button" className="btn btn-secondary btn-icon" title={t("employees.resetPassword.copy")} onClick={copy}>
              <Copy size={16} />
            </button>
          </div>
          <span className="field-hint">{copied ? t("employees.resetPassword.copied") : t("employees.resetPassword.hint")}</span>
        </div>

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || password.length < 8}>
            {submitting ? t("common.saving") : t("employees.resetPassword.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
