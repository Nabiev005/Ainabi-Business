import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import { useLabels } from "../../hooks/useLabels";
import { ASSIGNABLE_ROLES, type AssignableRole } from "../../types";

interface InviteEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  submitting: boolean;
  onSubmit: (values: { name: string; email: string; phone: string; password: string; role: AssignableRole }) => Promise<void>;
}

export function InviteEmployeeModal({ open, onClose, submitting, onSubmit }: InviteEmployeeModalProps) {
  const { t } = useTranslation();
  const labels = useLabels();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("CASHIER");

  useEffect(() => {
    if (open) {
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setRole("CASHIER");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !email || !password) return;
    await onSubmit({ name, email, phone, password, role });
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form className="stack gap-4" onSubmit={handleSubmit}>
        <h2 className="card-title">{t("employees.inviteModal.title")}</h2>

        <div className="field">
          <label className="field-label">{t("employees.inviteModal.name")}</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("employees.inviteModal.email")}</label>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label className="field-label">{t("employees.inviteModal.phone")}</label>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
        </div>
        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("employees.inviteModal.tempPassword")}</label>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>
          <div className="field">
            <label className="field-label">{t("employees.inviteModal.role")}</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {labels.role[r]}
                </option>
              ))}
            </select>
            <span className="field-hint">{t(`employees.roleHints.${role}`)}</span>
          </div>
        </div>
        <p className="field-hint">{t("employees.inviteModal.hint")}</p>

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? t("common.saving") : t("common.add")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
