import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CalendarDays, Flame, Lightbulb, PiggyBank, Receipt, Snowflake, Trophy, Undo2, UserRound, Wallet } from "lucide-react";
import { KpiCard } from "../../components/ui/KpiCard";
import { Skeleton } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as insightsService from "../../services/insights.service";
import type { Insight, MonthlyInsights } from "../../services/insights.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney, formatNumber } from "../../utils/format";
import "./Insights.css";

const ICONS = {
  stale: Snowflake,
  reorder: Flame,
  lowMargin: PiggyBank,
  topProfit: Trophy,
  discounts: UserRound,
  bestDays: CalendarDays,
  overdueDebts: Wallet,
  expenses: Receipt,
  returns: Undo2,
} as const;

/** The month that just ended, as yyyy-mm. */
function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Insights() {
  const { t, i18n } = useTranslation();
  const { showToast } = useToast();
  const labels = useLabels();
  const [month, setMonth] = useState(lastMonth());
  const [data, setData] = useState<MonthlyInsights | null>(null);

  useEffect(() => {
    setData(null);
    insightsService
      .getMonthlyInsights(month)
      .then(setData)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [month, showToast, t]);

  const monthName = (key: string) => {
    const [y, m] = key.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(i18n.language === "ru" ? "ru-RU" : "ky-KG", { month: "long", year: "numeric" });
  };
  const weekdays = t("insights.weekdays", { returnObjects: true }) as string[];
  const list = (names: string[]) => names.map((n) => `«${n}»`).join(", ");

  /** Each hint: what happened (with numbers) and what to do about it. */
  function render(insight: Insight): { title: string; text: string; action: string } {
    switch (insight.type) {
      case "stale":
        return {
          title: t("insights.stale.title"),
          text: t("insights.stale.text", { count: insight.count, amount: formatMoney(insight.frozenValue), items: insight.items.map((x) => `${x.name} (${x.idleDays} ${t("insights.daysShort")})`).join(", ") }),
          action: t("insights.stale.action"),
        };
      case "reorder":
        return {
          title: t("insights.reorder.title"),
          text: insight.items.map((x) => t("insights.reorder.item", { name: x.name, perMonth: formatNumber(x.perMonth), left: formatNumber(x.left), days: x.daysLeft })).join(" "),
          action: t("insights.reorder.action"),
        };
      case "lowMargin":
        return {
          title: t("insights.lowMargin.title"),
          text: insight.items.map((x) => t("insights.lowMargin.item", { name: x.name, margin: formatNumber(x.marginPercent) })).join(" "),
          action: t("insights.lowMargin.action"),
        };
      case "topProfit":
        return {
          title: t("insights.topProfit.title"),
          text: t("insights.topProfit.text", { name: insight.name, share: insight.sharePercent, amount: formatMoney(insight.profit) }),
          action: t("insights.topProfit.action"),
        };
      case "discounts":
        return {
          title: t("insights.discounts.title"),
          text: t("insights.discounts.text", { name: insight.name, amount: formatMoney(insight.amount), times: formatNumber(insight.timesAverage) }),
          action: t("insights.discounts.action"),
        };
      case "bestDays":
        return {
          title: t("insights.bestDays.title"),
          text: t("insights.bestDays.text", { days: insight.days.map((d) => weekdays[d]).join(", "), share: insight.sharePercent }),
          action: t("insights.bestDays.action", { day: weekdays[(insight.days[0] + 6) % 7] }),
        };
      case "overdueDebts":
        return {
          title: t("insights.overdueDebts.title"),
          text: t("insights.overdueDebts.text", { count: insight.count, amount: formatMoney(insight.amount) }),
          action: t("insights.overdueDebts.action"),
        };
      case "expenses":
        return {
          title: t("insights.expenses.title"),
          text:
            insight.revenueChange === null
              ? t("insights.expenses.textNoRevenue", { change: formatNumber(insight.expensesChange) })
              : t("insights.expenses.text", { change: formatNumber(insight.expensesChange), revenue: formatNumber(insight.revenueChange) }) +
                (insight.topCategory ? " " + t("insights.expenses.mostly", { category: labels.expenseCategory[insight.topCategory] ?? insight.topCategory }) : ""),
          action: t("insights.expenses.action"),
        };
      case "returns":
        return {
          title: t("insights.returns.title"),
          text:
            t("insights.returns.text", { rate: formatNumber(insight.ratePercent), amount: formatMoney(insight.amount) }) +
            (insight.items.length ? " " + t("insights.returns.models", { items: list(insight.items.map((x) => `${x.name} ×${formatNumber(x.count)}`)) }) : "") +
            (insight.reasons.length ? " " + t("insights.returns.reasons", { reasons: list(insight.reasons) }) : ""),
          action: t("insights.returns.action"),
        };
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("insights.title")}</h1>
          <p className="page-subtitle">{t("insights.subtitle")}</p>
        </div>
        <input type="month" className="input" style={{ width: 180 }} value={month} max={lastMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)} />
      </div>

      {!data ? (
        <div className="kpi-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={132} radius="16px" />
          ))}
        </div>
      ) : (
        <>
          <h2 className="card-title insights-month">{monthName(data.month)}</h2>
          <div className="kpi-grid">
            <KpiCard index={0} label={t("insights.kpi.revenue")} value={formatMoney(data.summary.revenue)} changePercent={data.summary.revenueChange ?? undefined} icon={Wallet} accent="primary" />
            <KpiCard
              index={1}
              label={data.summary.netProfit < 0 ? t("analytics.kpi.netLoss") : t("insights.kpi.netProfit")}
              value={formatMoney(data.summary.netProfit)}
              changePercent={data.summary.netProfitChange ?? undefined}
              icon={PiggyBank}
              accent={data.summary.netProfit < 0 ? "danger" : "success"}
            />
            <KpiCard index={2} label={t("insights.kpi.sales")} value={formatNumber(data.summary.salesCount)} icon={Receipt} accent="primary" />
            <KpiCard index={3} label={t("insights.kpi.avgCheck")} value={formatMoney(data.summary.avgCheck)} icon={Wallet} accent="primary" />
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">
                <Lightbulb size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                {t("insights.adviceTitle")}
              </h2>
            </div>
            {data.insights.length === 0 ? (
              <EmptyState icon={<AlertTriangle size={26} />} title={t("insights.empty")} subtitle={t("insights.emptySubtitle")} />
            ) : (
              <div className="insight-list">
                {data.insights.map((insight, i) => {
                  const Icon = ICONS[insight.type];
                  const { title, text, action } = render(insight);
                  return (
                    <div key={i} className={`insight insight-${insight.severity}`}>
                      <span className="insight-icon">
                        <Icon size={18} />
                      </span>
                      <div className="stack gap-1">
                        <strong>{title}</strong>
                        <span className="insight-text">{text}</span>
                        <span className="insight-action">👉 {action}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <p className="field-hint">{t("insights.footnote")}</p>
        </>
      )}
    </div>
  );
}
