import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Award, Download, Percent, Receipt, ShoppingBag, TrendingUp, Trophy, Undo2, Wallet, Wrench } from "lucide-react";
import { KpiCard } from "../../components/ui/KpiCard";
import { Skeleton, SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useToast } from "../../hooks/useToast";
import * as reportService from "../../services/report.service";
import type { ReportData, ReportPreset } from "../../services/report.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney, formatNumber } from "../../utils/format";

const PRESET_ORDER: ReportPreset[] = ["today", "yesterday", "7d", "30d", "month", "prevMonth", "custom"];

export default function Reports() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [preset, setPreset] = useState<ReportPreset>("7d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (preset === "custom" && (!from || !to)) return;
    setReport(null);
    reportService
      .getReport(preset, preset === "custom" ? from : undefined, preset === "custom" ? to : undefined)
      .then(setReport)
      .catch((error) => showToast({ variant: "error", title: t("reports.reportLoadFailed"), message: extractErrorMessage(error) }));
  }, [preset, from, to, showToast, t]);

  async function handleExport() {
    setExporting(true);
    try {
      await reportService.downloadReportCsv(preset, preset === "custom" ? from : undefined, preset === "custom" ? to : undefined);
    } catch (error) {
      showToast({ variant: "error", title: t("reports.exportFailed"), message: extractErrorMessage(error) });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("reports.title")}</h1>
          <p className="page-subtitle">{t("reports.subtitle")}</p>
        </div>
        <button className="btn btn-secondary" onClick={handleExport} disabled={exporting || !report}>
          <Download size={16} />
          {exporting ? t("reports.exporting") : t("reports.export")}
        </button>
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
      ) : !report ? (
        <div className="kpi-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={132} radius="16px" />
          ))}
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard index={0} label={t("reports.kpi.totalSales")} value={formatMoney(report.summary.totalSales)} icon={TrendingUp} accent="primary" />
            <KpiCard index={1} label={t("reports.kpi.netProfit")} value={formatMoney(report.summary.netProfit)} icon={Wallet} accent="success" />
            <KpiCard index={2} label={t("reports.kpi.totalExpenses")} value={formatMoney(report.summary.totalExpenses)} icon={Receipt} accent="danger" />
            <KpiCard index={3} label={t("reports.kpi.totalCogs")} value={formatMoney(report.summary.totalCogs)} icon={ShoppingBag} accent="warning" />
            <KpiCard index={4} label={t("reports.kpi.avgCheck")} value={formatMoney(report.summary.avgCheck)} icon={Percent} accent="primary" />
            <KpiCard index={5} label={t("reports.kpi.salesCount")} value={formatNumber(report.summary.salesCount)} icon={Award} accent="primary" />
            {report.summary.totalReturns > 0 && (
              <KpiCard index={6} label={t("reports.kpi.totalReturns")} value={formatMoney(report.summary.totalReturns)} icon={Undo2} accent="danger" />
            )}
            {report.summary.repairsCount > 0 && (
              <KpiCard index={7} label={t("reports.kpi.repairRevenue", { count: report.summary.repairsCount })} value={formatMoney(report.summary.repairRevenue)} icon={Wrench} accent="success" />
            )}
          </div>

          <div className="dashboard-bottom-grid">
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">{t("reports.dynamicsTitle")}</h2>
              </div>
              <div className="card-pad">
                {report.series.length === 0 ? (
                  <EmptyState title={t("reports.noData")} subtitle={t("reports.noDataSubtitle")} />
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={report.series} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesFill2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="expenseFill2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-danger-text)" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="var(--color-danger-text)" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(v) => formatDate(v)} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--color-text-muted)" }} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} width={64} tickFormatter={(v) => formatNumber(v)} />
                      <Tooltip labelFormatter={(v) => formatDate(v as string)} formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 12, border: "1px solid var(--color-border)" }} />
                      <Area type="monotone" dataKey="sales" name={t("reports.sales")} stroke="var(--color-primary-600)" strokeWidth={2.5} fill="url(#salesFill2)" />
                      <Area type="monotone" dataKey="expenses" name={t("reports.expense")} stroke="var(--color-danger-text)" strokeWidth={2} fill="url(#expenseFill2)" />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="stack gap-5">
              <div className="card card-pad stack gap-2">
                <div className="row gap-2">
                  <Trophy size={18} color="var(--color-warning-text)" />
                  <span className="card-title" style={{ fontSize: "var(--font-size-md)" }}>{t("reports.bestSelling")}</span>
                </div>
                {report.bestSelling ? (
                  <>
                    <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{report.bestSelling.name}</span>
                    <span className="text-muted">{t("reports.bestSellingText", { qty: formatNumber(report.bestSelling.quantitySold), revenue: formatMoney(report.bestSelling.revenue) })}</span>
                  </>
                ) : (
                  <span className="text-muted">{t("reports.noInfo")}</span>
                )}
              </div>
              <div className="card card-pad stack gap-2">
                <div className="row gap-2">
                  <Award size={18} color="var(--color-success-text)" />
                  <span className="card-title" style={{ fontSize: "var(--font-size-md)" }}>{t("reports.mostProfitable")}</span>
                </div>
                {report.mostProfitable ? (
                  <>
                    <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 700 }}>{report.mostProfitable.name}</span>
                    <span className="text-muted">{t("reports.mostProfitableText", { profit: formatMoney(report.mostProfitable.profit) })}</span>
                  </>
                ) : (
                  <span className="text-muted">{t("reports.noInfo")}</span>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t("reports.productPerformance")}</h2>
            </div>
            {report.productPerformance.length === 0 ? (
              <div className="card-pad">
                <EmptyState title={t("reports.noSales")} subtitle={t("reports.noSalesSubtitle")} />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("reports.table.product")}</th>
                      <th className="table-cell-num">{t("reports.table.sold")}</th>
                      <th className="table-cell-num">{t("reports.table.revenue")}</th>
                      <th className="table-cell-num">{t("reports.table.profit")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.productPerformance.map((p) => (
                      <tr key={p.productId}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td>
                        <td className="table-cell-num">{formatNumber(p.quantitySold)}</td>
                        <td className="table-cell-num">{formatMoney(p.revenue)}</td>
                        <td className="table-cell-num">{formatMoney(p.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
