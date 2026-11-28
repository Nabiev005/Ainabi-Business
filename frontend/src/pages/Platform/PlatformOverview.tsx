import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlarmClock, MessageCircle, TrendingDown, Trophy } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import * as billingService from "../../services/billing.service";
import type { OverviewBusiness, PlatformOverview as Overview } from "../../services/billing.service";
import { formatDate, formatMoney, formatNumber } from "../../utils/format";
import { whatsappShareLink } from "../../utils/messages";

/** Who pays, what comes in, and who to call: about to run out, or gone quiet. */
export function PlatformOverview() {
  const { t } = useTranslation();
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    billingService.getPlatformOverview().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <div className="card card-pad" style={{ height: 120 }} />;
  const maxRevenue = Math.max(1, ...data.revenueByMonth.map((m) => m.amount));
  const tiles: [string, string, string?][] = [
    [t("platform.overview.businesses"), formatNumber(data.totals.businesses), t("platform.overview.newMonth", { count: data.totals.newLast30Days })],
    [t("platform.overview.paying"), formatNumber(data.totals.paying), t("platform.overview.trials", { count: data.totals.trials })],
    [t("platform.overview.mrr"), formatMoney(data.mrr), t("platform.overview.mrrHint")],
    [t("platform.overview.active"), formatNumber(data.totals.activeLast7Days), t("platform.overview.expired", { count: data.totals.expired })],
  ];

  return (
    <div className="stack gap-4">
      <div className="kpi-grid">
        {tiles.map(([label, value, hint]) => (
          <div key={label} className="card card-pad stack gap-1">
            <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>{label}</span>
            <strong className="mono-num" style={{ fontSize: "var(--font-size-2xl, 24px)" }}>{value}</strong>
            {hint && <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{hint}</span>}
          </div>
        ))}
      </div>

      <div className="card card-pad stack gap-3">
        <strong>{t("platform.overview.revenue")}</strong>
        <div className="platform-bars">
          {data.revenueByMonth.map((m) => (
            <div key={m.month} className="platform-bar">
              <span className="mono-num platform-bar-value">{m.amount > 0 ? formatMoney(m.amount) : "—"}</span>
              <div className="platform-bar-fill" style={{ height: `${Math.max(3, (m.amount / maxRevenue) * 100)}%` }} />
              <span className="text-muted platform-bar-label">{m.month.slice(5)}.{m.month.slice(2, 4)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="platform-lists">
        <CallList
          icon={<AlarmClock size={16} />}
          title={t("platform.overview.expiring")}
          empty={t("platform.overview.expiringEmpty")}
          rows={data.expiringSoon}
          badge={(b) => <Badge variant={b.daysLeft <= 2 ? "danger" : "warning"}>{t("platform.overview.daysLeft", { count: b.daysLeft })}</Badge>}
          message={(b) => t("platform.overview.expiringMessage", { name: b.ownerName, shop: b.name, date: b.expiresAt ? formatDate(b.expiresAt) : "" })}
        />
        <CallList
          icon={<TrendingDown size={16} />}
          title={t("platform.overview.atRisk")}
          empty={t("platform.overview.atRiskEmpty")}
          rows={data.atRisk}
          badge={(b) => <Badge variant="warning">{b.lastSaleAt ? t("platform.overview.lastSale", { date: formatDate(b.lastSaleAt) }) : t("platform.overview.noSales")}</Badge>}
          message={(b) => t("platform.overview.atRiskMessage", { name: b.ownerName, shop: b.name })}
        />
        <CallList
          icon={<Trophy size={16} />}
          title={t("platform.overview.mostActive")}
          empty={t("platform.overview.mostActiveEmpty")}
          rows={data.mostActive}
          badge={(b) => <Badge variant="success">{t("platform.overview.sales30d", { count: b.sales30d })}</Badge>}
        />
      </div>
    </div>
  );
}

function CallList({
  icon,
  title,
  empty,
  rows,
  badge,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  rows: OverviewBusiness[];
  badge: (b: OverviewBusiness) => React.ReactNode;
  message?: (b: OverviewBusiness) => string;
}) {
  const { t } = useTranslation();
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <span style={{ marginRight: 6, verticalAlign: -2, display: "inline-flex" }}>{icon}</span>
          {title} {rows.length > 0 && <span className="text-muted">({rows.length})</span>}
        </h2>
      </div>
      {rows.length === 0 ? (
        <div className="card-pad text-muted" style={{ fontSize: "var(--font-size-sm)" }}>{empty}</div>
      ) : (
        <div className="stack">
          {rows.slice(0, 15).map((b) => (
            <div key={b.id} className="platform-call-row">
              <div className="stack" style={{ minWidth: 0, flex: 1 }}>
                <strong>{b.name}</strong>
                <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                  {b.ownerName}
                  {b.phone ? ` · ${b.phone}` : ""} · {t(`billing.plans.${b.plan}.name`)}
                  {b.isTrial ? ` (${t("platform.overview.trial")})` : ""}
                </span>
              </div>
              {badge(b)}
              {message && b.phone && (
                <a className="btn btn-ghost btn-icon btn-sm" href={whatsappShareLink(b.phone, message(b))} target="_blank" rel="noreferrer" title="WhatsApp">
                  <MessageCircle size={16} color="var(--color-success-text)" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
