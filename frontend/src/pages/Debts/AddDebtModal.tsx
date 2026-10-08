import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import type { Customer, DebtSchedulePayload } from "../../types";
import { DebtPlanFields, emptyPlan, PlanValue, planToPayload } from "./DebtPlanFields";

interface AddDebtModalProps {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
  submitting: boolean;
  onSubmit: (values: { customerId: string; totalAmount: number; comment?: string } & DebtSchedulePayload) => Promise<void>;
}

export function AddDebtModal({ open, onClose, customers, submitting, onSubmit }: AddDebtModalProps) {
  const { t } = useTranslation();
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [plan, setPlan] = useState<PlanValue>(emptyPlan);

  useEffect(() => {
    if (open) {
      setCustomerId("");
      setAmount("");
      setComment("");
      setPlan(emptyPlan());
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId || !amount) return;
    await onSubmit({ customerId, totalAmount: Number(amount), comment: comment || undefined, ...planToPayload(plan) });
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form className="stack gap-4" onSubmit={handleSubmit}>
        <h2 className="card-title">{t("debts.addModal.title")}</h2>

        <div className="field">
          <label className="field-label">{t("debts.addModal.customer")}</label>
          <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">{t("debts.addModal.customerPlaceholder")}</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `— ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field-label">{t("debts.addModal.amount")}</label>
          <input type="number" min={1} step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>

        <DebtPlanFields value={plan} onChange={setPlan} total={Number(amount) || 0} />

        <div className="field">
          <label className="field-label">{t("debts.addModal.comment")}</label>
          <textarea className="textarea" value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t("debts.addModal.commentPlaceholder")} />
        </div>

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
