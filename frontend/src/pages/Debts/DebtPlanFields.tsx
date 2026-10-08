import { useTranslation } from "react-i18next";
import type { DebtSchedulePayload } from "../../types";
import { formatMoney } from "../../utils/format";

export type PlanKind = "none" | "single" | "installments";

export interface PlanValue {
  kind: PlanKind;
  dueDate: string;
  count: string;
  firstDueDate: string;
  intervalMonths: string;
}

/** Today + n days as "YYYY-MM-DD" in the viewer's calendar. */
export function dayFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const emptyPlan = (): PlanValue => ({ kind: "none", dueDate: dayFromToday(7), count: "3", firstDueDate: dayFromToday(30), intervalMonths: "1" });

export function planToPayload(plan: PlanValue): DebtSchedulePayload {
  if (plan.kind === "single") return { dueDate: plan.dueDate || null, installments: null };
  if (plan.kind === "installments") {
    return { dueDate: null, installments: { count: Number(plan.count), firstDueDate: plan.firstDueDate, intervalMonths: Number(plan.intervalMonths) || 1 } };
  }
  return { dueDate: null, installments: null };
}

/** "When will it be paid": no date, one date, or an installment plan. */
export function DebtPlanFields({ value, onChange, total }: { value: PlanValue; onChange: (v: PlanValue) => void; total: number }) {
  const { t } = useTranslation();
  const set = (patch: Partial<PlanValue>) => onChange({ ...value, ...patch });
  const count = Number(value.count) || 0;

  return (
    <div className="stack gap-3">
      <div className="field">
        <label className="field-label">{t("debts.plan.label")}</label>
        <div className="tabs">
          {(["none", "single", "installments"] as const).map((kind) => (
            <button type="button" key={kind} className={`tab ${value.kind === kind ? "active" : ""}`} onClick={() => set({ kind })}>
              {t(`debts.plan.${kind}`)}
            </button>
          ))}
        </div>
      </div>

      {value.kind === "single" && (
        <div className="field">
          <label className="field-label">{t("debts.plan.dueDate")}</label>
          <input type="date" className="input" value={value.dueDate} onChange={(e) => set({ dueDate: e.target.value })} required />
        </div>
      )}

      {value.kind === "installments" && (
        <>
          <div className="row gap-3" style={{ flexWrap: "wrap" }}>
            <div className="field" style={{ flex: "1 1 120px" }}>
              <label className="field-label">{t("debts.plan.count")}</label>
              <input type="number" min={2} max={60} className="input" value={value.count} onChange={(e) => set({ count: e.target.value })} required />
            </div>
            <div className="field" style={{ flex: "1 1 120px" }}>
              <label className="field-label">{t("debts.plan.interval")}</label>
              <input type="number" min={1} max={12} className="input" value={value.intervalMonths} onChange={(e) => set({ intervalMonths: e.target.value })} required />
            </div>
          </div>
          <div className="field">
            <label className="field-label">{t("debts.plan.firstDueDate")}</label>
            <input type="date" className="input" value={value.firstDueDate} onChange={(e) => set({ firstDueDate: e.target.value })} required />
          </div>
          {total > 0 && count >= 2 && (
            <span className="field-hint">{t("debts.plan.preview", { count, amount: formatMoney(Math.floor(total / count)) })}</span>
          )}
        </>
      )}
    </div>
  );
}
