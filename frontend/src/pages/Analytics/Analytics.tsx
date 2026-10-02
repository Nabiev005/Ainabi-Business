import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClipboardList, Receipt, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { KpiCard } from "../../components/ui/KpiCard";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as analyticsService from "../../services/analytics.service";
import type { AnalyticsData } from "../../services/analytics.service";
import type { ReportPreset } from "../../services/report.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../../utils/format";
import "./Analytics.css";

const PRESET_ORDER: ReportPreset[] = ["today", "yesterday", "7d", "30d", "month", "prevMonth", "custom"];

/** KpiCard only takes a number; "nothing to compare with" shows no trend. */
const change = (value: number | null) => (value === null ? undefined : value);

export default function Analytics() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const labels = useLabels();
  const [preset, setPreset] = useState<ReportPreset>("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    if (preset === "custom" && (!from || !to)) return;
    setData(null);
    analyticsService
      .getAnalytics(preset, preset === "custom" ? from : undefined, preset === "custom" ? `${to}T23:59:59` : undefined)
      .then(setData)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [preset, from, to, showToast, t]);

  const s = data?.statement;
  const loss = !!s && s.netProfit < 0;
  const maxExpense = Math.max(1, ...(data?.expensesByCategory.map((e) => e.amount) ?? [1]));

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("analytics.title")}</h1>
          <p className="page-subtitle">{t("analytics.subtitle")}</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="row gap-3" style={{ flexWrap: "wrap" }}>
          <div className="tabs">
            {PRESET_ORDER.map((value) => (
              <button key={value} className={`tab ${preset === value ? "active" : ""}`} onClick={() => setPreset(value)}>
                {t(`reports.presets.${value}`)}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="row gap-2">
              <input type="date" className="input" style={{ width: 160 }} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-muted">—</span>
              <input type="date" className="input" style={{ width: 160 }} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {preset === "custom" && (!from || !to) ? (
        <div className="card card-pad">
          <EmptyState title={t("reports.selectRange")} subtitle={t("reports.selectRangeSubtitle")} />
        </div>
      ) : !data || !s ? (
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={132} radius="16px" />
          ))}
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard index={0} label={t("analytics.kpi.revenue")} value={formatMoney(s.revenue)} changePercent={change(data.changes.revenue)} icon={TrendingUp} accent="primary" />
            <KpiCard index={1} label={t("analytics.kpi.grossProfit")} value={formatMoney(s.grossProfit)} changePercent={change(data.changes.grossProfit)} icon={ShoppingBag} accent="success" />
            <KpiCard index={2} label={t("analytics.kpi.expenses")} value={formatMoney(s.expenses)} changePercent={change(data.changes.expenses)} icon={Receipt} accent="warning" />
            <KpiCard
              index={3}
              label={loss ? t("analytics.kpi.netLoss") : t("analytics.kpi.netProfit")}
              value={formatMoney(s.netProfit)}
              changePercent={change(data.changes.netProfit)}
              icon={loss ? TrendingDown : Wallet}
              accent={loss ? "danger" : "success"}
            />
          </div>

          <div className="analytics-grid">
            {/* Profit & loss statement */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t("analytics.pnl.title")}</h2>
              </div>
              <div className="card-pad">
                <table className="pnl-table">
                  <tbody>
                    <tr>
                      <td>{t("analytics.pnl.grossSales")}</td>
                      <td>{formatMoney(s.grossSales)}</td>
                    </tr>
                    {s.returns > 0 && (
                      <tr className="pnl-minus">
                        <td>{t("analytics.pnl.returns")}</td>
                        <td>−{formatMoney(s.returns)}</td>
                      </tr>
                    )}
                    <tr className="pnl-subtotal">
                      <td>{t("analytics.pnl.revenue")}</td>
                      <td>{formatMoney(s.revenue)}</td>
                    </tr>
                    <tr className="pnl-minus">
                      <td>{t("analytics.pnl.cogs")}</td>
                      <td>−{formatMoney(s.cogs)}</td>
                    </tr>
                    <tr className="pnl-subtotal">
                      <td>
                        {t("analytics.pnl.grossProfit")} <span className="text-muted">({formatNumber(s.marginPercent)}%)</span>
                      </td>
                      <td>{formatMoney(s.grossProfit)}</td>
                    </tr>
                    {s.repairRevenue > 0 && (
                      <tr>
                        <td>{t("analytics.pnl.repairs")}</td>
                        <td>+{formatMoney(s.repairRevenue)}</td>
                      </tr>
                    )}
                    <tr className="pnl-minus">
                      <td>{t("analytics.pnl.expenses")}</td>
                      <td>−{formatMoney(s.expenses)}</td>
                    </tr>
                    {s.writeOffLoss > 0 && (
                      <tr className="pnl-minus">
                        <td>{t("analytics.pnl.writeOffs")}</td>
                        <td>−{formatMoney(s.writeOffLoss)}</td>
                      </tr>
                    )}
                    {s.shortageLoss > 0 && (
                      <tr className="pnl-minus">
                        <td>{t("analytics.pnl.shortage")}</td>
                        <td>−{formatMoney(s.shortageLoss)}</td>
                      </tr>
                    )}
                    {s.surplusGain > 0 && (
                      <tr>
                        <td>{t("analytics.pnl.surplus")}</td>
                        <td>+{formatMoney(s.surplusGain)}</td>
                      </tr>
                    )}
                    <tr className={`pnl-total ${loss ? "pnl-total-loss" : ""}`}>
                      <td>{loss ? t("analytics.pnl.netLoss") : t("analytics.pnl.netProfit")}</td>
                      <td>{formatMoney(s.netProfit)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="pnl-footnote">
                  <span>{t("analytics.pnl.salesCount", { count: s.salesCount })}</span>
                  <span>{t("analytics.pnl.avgCheck", { amount: formatMoney(s.avgCheck) })}</span>
                  {s.discounts > 0 && <span>{t("analytics.pnl.discounts", { amount: formatMoney(s.discounts) })}</span>}
                </div>
              </div>
            </div>

            {/* Daily profit / loss */}
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t("analytics.dailyTitle")}</h2>
                <div className="analytics-legend">
                  <span>
                    <i style={{ background: "var(--color-success-text)" }} /> {t("analytics.legendProfit")}
                  </span>
                  <span>
                    <i style={{ background: "var(--color-danger-text)" }} /> {t("analytics.legendLoss")}
                  </span>
                </div>
              </div>
              <div className="card-pad">
                {data.series.every((d) => d.profit === 0 && d.revenue === 0) ? (
                  <EmptyState title={t("reports.noData")} subtitle={t("reports.noDataSubtitle")} />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={data.series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} minTickGap={16} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} width={64} tickFormatter={(v) => formatNumber(v)} />
                      <ReferenceLine y={0} stroke="var(--color-border-strong)" />
                      <Tooltip
                        cursor={{ fill: "var(--color-surface-muted)" }}
                        labelFormatter={(v) => formatDate(v as string)}
                        formatter={(value: number, name: string) => [formatMoney(value), t(`analytics.series.${name}`)]}
                        contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }}
                      />
                      <Bar dataKey="profit" radius={[4, 4, 4, 4]} maxBarSize={28}>
                        {data.series.map((d) => (
                          <Cell key={d.date} fill={d.profit < 0 ? "var(--color-danger-text)" : "var(--color-success-text)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* Team */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t("analytics.team.title")}</h2>
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <Badge variant="info">
                  <ClipboardList size={12} /> {t("analytics.team.tasksOpen", { count: data.tasks.open })}
                </Badge>
                {data.tasks.overdue > 0 && <Badge variant="danger">{t("analytics.team.tasksOverdue", { count: data.tasks.overdue })}</Badge>}
                <Badge variant="success">{t("analytics.team.tasksDone", { count: data.tasks.doneInPeriod })}</Badge>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("analytics.team.employee")}</th>
                    <th className="table-cell-num">{t("analytics.team.sales")}</th>
                    <th className="table-cell-num">{t("analytics.team.revenue")}</th>
                    <th className="table-cell-num">{t("analytics.team.profit")}</th>
                    <th className="table-cell-num">{t("analytics.team.discounts")}</th>
                    <th className="table-cell-num">{t("analytics.team.receipts")}</th>
                    <th className="table-cell-num">{t("analytics.team.stageMoves")}</th>
                    <th className="table-cell-num">{t("analytics.team.tasks")}</th>
                    <th className="table-cell-num">{t("analytics.team.cash")}</th>
                    <th>{t("analytics.team.lastLogin")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team.map((m) => (
                    <tr key={m.employeeId} className={m.status === "INACTIVE" ? "text-muted" : undefined}>
                      <td>
                        <div className="stack gap-1">
                          <span style={{ fontWeight: 700 }}>{m.name}</span>
                          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            {labels.role[m.role]}
                            {m.status === "INACTIVE" ? ` · ${labels.employeeStatus.INACTIVE}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell-num">{m.salesCount || "—"}</td>
                      <td className="table-cell-num">{m.revenue ? formatMoney(m.revenue) : "—"}</td>
                      <td className="table-cell-num" style={{ color: m.profit < 0 ? "var(--color-danger-text)" : undefined }}>
                        {m.profit ? formatMoney(m.profit) : "—"}
                      </td>
                      <td className="table-cell-num">{m.discounts ? formatMoney(m.discounts) : "—"}</td>
                      <td className="table-cell-num">{m.receiptsCount ? `${m.receiptsCount} · ${formatMoney(m.receiptsTotal)}` : "—"}</td>
                      <td className="table-cell-num">{m.stageMoves || "—"}</td>
                      <td className="table-cell-num">
                        <span title={t("analytics.team.tasksHint")}>
                          {m.tasksDone} / {m.tasksOpen}
                          {m.tasksOverdue > 0 && <span style={{ color: "var(--color-danger-text)", fontWeight: 700 }}> (!{m.tasksOverdue})</span>}
                        </span>
                      </td>
                      <td
                        className="table-cell-num"
                        style={{ color: m.cashDifference < 0 ? "var(--color-danger-text)" : m.cashDifference > 0 ? "var(--color-success-text)" : undefined, fontWeight: m.cashDifference ? 700 : undefined }}
                      >
                        {m.shiftsClosed ? formatMoney(m.cashDifference) : "—"}
                      </td>
                      <td className="text-muted">{m.lastLoginAt ? formatDateTime(m.lastLoginAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-hint" style={{ padding: "0 var(--space-5) var(--space-4)" }}>
              {t("analytics.team.footnote")}
            </p>
          </div>

          {/* Expenses by category */}
          {data.expensesByCategory.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t("analytics.expensesTitle")}</h2>
              </div>
              <div className="card-pad stack gap-3">
                {data.expensesByCategory.map((e) => (
                  <div key={e.category} className="expense-bar-row">
                    <span className="expense-bar-label">{labels.expenseCategory[e.category] ?? e.category}</span>
                    <div className="expense-bar-track">
                      <div className="expense-bar-fill" style={{ width: `${(e.amount / maxExpense) * 100}%` }} />
                    </div>
                    <span className="expense-bar-value">{formatMoney(e.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
