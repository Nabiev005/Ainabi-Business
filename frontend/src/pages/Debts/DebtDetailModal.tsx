import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import { usePermissions } from "../../hooks/usePermissions";
import * as debtService from "../../services/debt.service";
import { extractErrorMessage } from "../../services/api";
import type { DebtDetail, InstallmentState } from "../../types";
import { formatDate, formatDateTime, formatMoney } from "../../utils/format";
import { DebtPlanFields, emptyPlan, PlanValue, planToPayload } from "./DebtPlanFields";

const STATE_BADGE: Record<InstallmentState, "success" | "warning" | "danger" | "info" | "neutral"> = {
  PAID: "success",
  PARTIAL: "warning",
  OVERDUE: "danger",
  DUE_SOON: "warning",
  UPCOMING: "neutral",
};

/** A debt's payment plan and payments; managers can set or change the plan. */
export function DebtDetailModal({ debtId, onClose, onChanged }: { debtId: string | null; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { can } = usePermissions();
  const labels = useLabels();
  const [debt, setDebt] = useState<DebtDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState<PlanValue>(emptyPlan);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDebt(null);
    setEditing(false);
    if (!debtId) return;
    debtService
      .getDebt(debtId)
      .then((d) => {
        setDebt(d);
        setPlan({ ...emptyPlan(), kind: d.installmentsCount > 0 ? "installments" : d.dueDate ? "single" : "none", dueDate: d.dueDate ?? emptyPlan().dueDate });
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [debtId, showToast, t]);

  async function savePlan() {
    if (!debt) return;
    setSaving(true);
    try {
      setDebt(await debtService.setDebtSchedule(debt.id, planToPayload(plan)));
      setEditing(false);
      showToast({ variant: "success", title: t("debts.detail.planSaved") });
      onChanged();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!debtId} onClose={onClose} size="wide">
      <div className="stack gap-4">
        <h2 className="card-title">{t("debts.detail.title", { name: debt?.customerName ?? "" })}</h2>
        {!debt ? (
          <SkeletonRows rows={4} height={36} />
        ) : (
          <>
            <div className="row gap-4" style={{ flexWrap: "wrap" }}>
              <span>
                {t("debts.table.total")}: <strong className="mono-num">{formatMoney(debt.totalAmount)}</strong>
              </span>
              <span>
                {t("debts.table.paid")}: <strong className="mono-num">{formatMoney(debt.paidAmount)}</strong>
              </span>
              <span>
                {t("debts.table.remaining")}: <strong className="mono-num">{formatMoney(debt.remainingAmount)}</strong>
              </span>
              <Badge variant={debt.status === "PAID" ? "success" : debt.status === "PARTIAL" ? "warning" : "danger"}>{labels.debtStatus[debt.status]}</Badge>
            </div>

            <div className="stack gap-2">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{t("debts.detail.schedule")}</strong>
                {can("debts.create") && debt.status !== "PAID" && !editing && (
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                    {t("debts.detail.changePlan")}
                  </button>
                )}
              </div>
              {editing ? (
                <div className="stack gap-3">
                  <DebtPlanFields value={plan} onChange={setPlan} total={debt.totalAmount} />
                  <div className="row gap-2" style={{ justifyContent: "flex-end" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(false)} disabled={saving}>
                      {t("common.cancel")}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={savePlan} disabled={saving}>
                      {saving ? t("common.saving") : t("debts.detail.savePlan")}
                    </button>
                  </div>
                </div>
              ) : debt.schedule.length === 0 ? (
                <span className="text-muted">{t("debts.detail.noSchedule")}</span>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {debt.schedule.map((s, i) => (
                        <tr key={i}>
                          <td>{formatDate(s.dueDate)}</td>
                          <td className="table-cell-num mono-num">{formatMoney(s.amount)}</td>
                          <td className="table-cell-num text-muted mono-num">{s.paid > 0 && s.paid < s.amount ? formatMoney(s.paid) : ""}</td>
                          <td>
                            <Badge variant={STATE_BADGE[s.state]}>{t(`debts.detail.states.${s.state}`)}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="stack gap-2">
              <strong>{t("debts.detail.payments")}</strong>
              {debt.payments.length === 0 ? (
                <span className="text-muted">{t("debts.detail.noPayments")}</span>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      {debt.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="text-muted">{formatDateTime(p.createdAt)}</td>
                          <td className="table-cell-num mono-num">{formatMoney(p.amount)}</td>
                          <td>{labels.paymentMethod[p.method] ?? p.method}</td>
                          <td className="text-muted">{p.comment ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
