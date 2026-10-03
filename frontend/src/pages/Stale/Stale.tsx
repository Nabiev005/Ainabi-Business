import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hourglass } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import * as insightsService from "../../services/insights.service";
import type { StaleStock } from "../../services/insights.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney, formatNumber, unitLabel } from "../../utils/format";

const PERIODS = [30, 60, 90, 180];

/**
 * Goods that have sat on the shelf too long. The seller sees what to push;
 * the owner also sees how much money it ties up (the API leaves cost out
 * for the seller).
 */
export default function Stale() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [days, setDays] = useState(60);
  const [data, setData] = useState<StaleStock | null>(null);

  useEffect(() => {
    setData(null);
    insightsService
      .getStaleStock(days)
      .then(setData)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [days, showToast, t]);

  const showCost = data?.frozenValue !== null && data?.frozenValue !== undefined;

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("stalePage.title")}</h1>
          <p className="page-subtitle">{showCost ? t("stalePage.subtitleOwner") : t("stalePage.subtitleSeller")}</p>
        </div>
        <div className="tabs">
          {PERIODS.map((d) => (
            <button key={d} className={`tab ${days === d ? "active" : ""}`} onClick={() => setDays(d)}>
              {t("stalePage.period", { count: d })}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <div className="card card-pad row gap-6" style={{ flexWrap: "wrap" }}>
          <div className="stack gap-1">
            <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("stalePage.products")}</span>
            <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>{formatNumber(data.items.length)}</span>
          </div>
          {showCost && (
            <div className="stack gap-1">
              <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("stalePage.frozen")}</span>
              <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: "var(--color-warning-text)" }}>
                {formatMoney(data.frozenValue!)}
              </span>
            </div>
          )}
          <p className="field-hint" style={{ flexBasis: "100%", margin: 0 }}>
            {showCost ? t("stalePage.hintOwner") : t("stalePage.hintSeller")}
          </p>
        </div>
      )}

      <div className="card">
        {data === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={48} />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Hourglass size={26} />} title={t("stalePage.empty", { count: days })} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("stalePage.product")}</th>
                  <th className="table-cell-num">{t("stalePage.quantity")}</th>
                  <th className="table-cell-num">{t("stalePage.price")}</th>
                  {showCost && <th className="table-cell-num">{t("stalePage.frozenColumn")}</th>}
                  <th>{t("stalePage.lastSold")}</th>
                  <th className="table-cell-num">{t("stalePage.idle")}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.productId}>
                    <td>
                      <div className="stack gap-1">
                        <strong>{p.name}</strong>
                        <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                          {[p.sku, p.categoryName].filter(Boolean).join(" · ") || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell-num">
                      {formatNumber(p.quantity)} {unitLabel(p.unit)}
                    </td>
                    <td className="table-cell-num">{formatMoney(p.salePrice)}</td>
                    {showCost && <td className="table-cell-num">{formatMoney(p.frozenValue ?? 0)}</td>}
                    <td className="text-muted">{p.lastSoldAt ? formatDate(p.lastSoldAt) : t("stalePage.neverSold")}</td>
                    <td className="table-cell-num">
                      <Badge variant={p.idleDays >= 120 ? "danger" : "warning"}>{t("stalePage.days", { count: p.idleDays })}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
