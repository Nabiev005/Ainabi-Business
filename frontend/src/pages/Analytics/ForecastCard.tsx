import { FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Pencil, Target, TrendingDown } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../hooks/useToast";
import * as analyticsService from "../../services/analytics.service";
import type { MonthForecast } from "../../services/analytics.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney, formatNumber } from "../../utils/format";
import { PALETTE } from "./Charts3D";

const ACTUAL_COLOR = PALETTE[0];
const FORECAST_COLOR = PALETTE[1];
const PLAN_COLOR = PALETTE[5];

/** ≥100% on track, 85–100% close, below that — the plan is out of reach at this pace. */
function status(percent: number) {
  if (percent >= 100) return { key: "onTrack", tone: "success", Icon: CheckCircle2 } as const;
  if (percent >= 85) return { key: "atRisk", tone: "warning", Icon: AlertTriangle } as const;
  return { key: "offTrack", tone: "danger", Icon: TrendingDown } as const;
}

interface Props {
  forecast: MonthForecast;
  canEditPlan: boolean;
  onPlanChange: (plan: number | null) => void;
}

export function ForecastCard({ forecast: f, canEditPlan, onPlanChange }: Props) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const monthName = new Date(`${f.month}-01T00:00:00`).toLocaleDateString(i18n.language === "ru" ? "ru-RU" : "ky-KG", { month: "long", year: "numeric" });
  const st = f.forecastPercent === null ? null : status(f.forecastPercent);
  const planDone = f.plan !== null && f.actual >= f.plan;

  // Progress bar scale: whichever is furthest — plan or forecast.
  const scale = Math.max(f.plan ?? 0, f.forecast, f.actual, 1);
  const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / scale) * 100)}%`;

  return (
    <div className="card forecast-card">
      <div className="card-header">
        <div className="row gap-3">
          <div className="forecast-icon">
            <Target size={20} />
          </div>
          <div className="stack">
            <h2 className="card-title">{t("analytics.forecast.title")}</h2>
            <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
              {t("analytics.forecast.subtitle", { month: monthName, day: f.daysElapsed, days: f.daysInMonth })}
            </span>
          </div>
        </div>
        {canEditPlan && (
          <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            <Pencil size={14} /> {f.plan === null ? t("analytics.forecast.setPlan") : t("analytics.forecast.editPlan")}
          </button>
        )}
      </div>

      <div className="card-pad forecast-body">
        <div className="stack gap-4">
          {f.plan !== null && st ? (
            <div className={`forecast-hero tone-${planDone ? "success" : st.tone}`}>
              <span className="forecast-hero-label">{planDone ? t("analytics.forecast.done") : t("analytics.forecast.willReach")}</span>
              <span className="forecast-hero-value mono-num">{formatNumber(f.forecastPercent ?? 0)}%</span>
              <span className="forecast-status">
                <st.Icon size={14} /> {planDone ? t("analytics.forecast.onTrack") : t(`analytics.forecast.${st.key}`)}
              </span>
            </div>
          ) : (
            <div className="forecast-noplan">
              <strong>{t("analytics.forecast.noPlanTitle")}</strong>
              <span>{canEditPlan ? t("analytics.forecast.noPlanOwner") : t("analytics.forecast.noPlanStaff")}</span>
              {canEditPlan && (
                <button className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start" }} onClick={() => setEditing(true)}>
                  <Target size={14} /> {t("analytics.forecast.setPlan")}
                </button>
              )}
            </div>
          )}

          <div className="forecast-progress" aria-hidden="true">
            <div className="forecast-progress-track">
              <div className="forecast-progress-forecast" style={{ width: pct(f.forecast) }} />
              <div className="forecast-progress-actual" style={{ width: pct(f.actual) }} />
              {f.plan !== null && (
                <div className="forecast-progress-plan" style={{ left: pct(f.plan) }}>
                  <span>{t("analytics.forecast.plan")}</span>
                </div>
              )}
            </div>
            <div className="forecast-legend">
              <span>
                <i style={{ background: ACTUAL_COLOR }} /> {t("analytics.forecast.legendActual")}
              </span>
              <span>
                <i className="striped" style={{ background: FORECAST_COLOR }} /> {t("analytics.forecast.legendForecast")}
              </span>
              {f.plan !== null && (
                <span>
                  <i style={{ background: PLAN_COLOR }} /> {t("analytics.forecast.legendPlan")}: {formatMoney(f.plan)}
                </span>
              )}
            </div>
          </div>

          <div className="forecast-stats">
            <div className="forecast-stat">
              <span>{t("analytics.forecast.actual")}</span>
              <strong className="mono-num">{formatMoney(f.actual)}</strong>
              {f.actualPercent !== null && <em>{t("analytics.forecast.ofPlan", { percent: formatNumber(f.actualPercent) })}</em>}
            </div>
            <div className="forecast-stat">
              <span>{t("analytics.forecast.forecast")}</span>
              <strong className="mono-num">{formatMoney(f.forecast)}</strong>
              {f.forecastPercent !== null && <em>{t("analytics.forecast.ofPlan", { percent: formatNumber(f.forecastPercent) })}</em>}
            </div>
            <div className="forecast-stat">
              <span>{t("analytics.forecast.avgDaily")}</span>
              <strong className="mono-num">{formatMoney(f.avgDaily)}</strong>
            </div>
            {f.neededPerDay !== null && !planDone && (
              <div className="forecast-stat">
                <span>{t("analytics.forecast.needed")}</span>
                <strong className="mono-num" style={{ color: f.neededPerDay > f.avgDaily ? "var(--color-danger-text)" : "var(--color-success-text)" }}>
                  {formatMoney(f.neededPerDay)}
                </strong>
              </div>
            )}
            <div className="forecast-stat">
              <span>{t("analytics.forecast.forecastProfit")}</span>
              <strong className="mono-num" style={{ color: f.forecastProfit < 0 ? "var(--color-danger-text)" : undefined }}>
                {formatMoney(f.forecastProfit)}
              </strong>
            </div>
          </div>
        </div>

        <div className="stack gap-2">
          <span className="forecast-chart-title">{t("analytics.forecast.chartTitle")}</span>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={f.cumulative} margin={{ top: 16, right: 12, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="forecast-actual-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACTUAL_COLOR} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={ACTUAL_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(v: string) => String(Number(v.slice(8)))} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} width={68} tickFormatter={(v) => formatNumber(v)} domain={[0, (max: number) => Math.max(max, f.plan ?? 0) * 1.05]} />
              <Tooltip
                cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
                labelFormatter={(v) => formatDate(v as string)}
                formatter={(value: number, name: string) => [formatMoney(value), t(`analytics.forecast.${name === "actual" ? "legendActual" : "legendForecast"}`)]}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }}
              />
              {f.plan !== null && (
                <ReferenceLine
                  y={f.plan}
                  stroke={PLAN_COLOR}
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  label={{ value: t("analytics.forecast.plan"), position: "insideTopLeft", fill: "var(--color-text-secondary)", fontSize: 11, fontWeight: 700 }}
                />
              )}
              <Area type="monotone" dataKey="actual" stroke={ACTUAL_COLOR} strokeWidth={2.5} fill="url(#forecast-actual-fill)" connectNulls={false} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} />
              <Line type="monotone" dataKey="forecast" stroke={FORECAST_COLOR} strokeWidth={2.5} strokeDasharray="6 5" dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="field-hint">
            {f.basis === "recent" ? t("analytics.forecast.basisRecent") : t("analytics.forecast.basisMonth", { count: f.daysElapsed - 1 })}
            {f.weekdayAdjusted && ` ${t("analytics.forecast.basisWeekdays")}`}
          </p>
        </div>
      </div>

      <PlanModal open={editing} initial={f.plan} onClose={() => setEditing(false)} onSaved={(plan) => { setEditing(false); onPlanChange(plan); }} />
    </div>
  );
}

function PlanModal({ open, initial, onClose, onSaved }: { open: boolean; initial: number | null; onClose: () => void; onSaved: (plan: number | null) => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setValue(initial ? String(initial) : "");
  }, [open, initial]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const { monthlyRevenuePlan } = await analyticsService.setMonthlyPlan(value.trim() ? Number(value) : null);
      showToast({ variant: "success", title: t("analytics.forecast.saved") });
      onSaved(monthlyRevenuePlan);
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose}>
      <form className="stack gap-4" onSubmit={handleSubmit}>
        <h2 className="card-title">{t("analytics.forecast.modalTitle")}</h2>
        <div className="field">
          <label className="field-label">{t("analytics.forecast.modalLabel")}</label>
          <input type="number" min={0} step="1" className="input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus placeholder="500000" />
          <span className="field-hint">{t("analytics.forecast.modalHint")}</span>
        </div>
        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
