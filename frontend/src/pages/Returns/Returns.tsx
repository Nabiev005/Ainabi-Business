import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Undo2 } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Pagination } from "../../components/ui/Pagination";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as insightsService from "../../services/insights.service";
import type { ReturnsJournal } from "../../services/insights.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney, formatNumber } from "../../utils/format";

/** Everything customers brought back — owner, accountant and registrar. */
export default function Returns() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const labels = useLabels();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ReturnsJournal | null>(null);

  useEffect(() => {
    setData(null);
    insightsService
      .getReturns({ from: from || undefined, to: to || undefined, page })
      .then(setData)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [from, to, page, showToast, t]);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("returnsPage.title")}</h1>
          <p className="page-subtitle">{t("returnsPage.subtitle")}</p>
        </div>
      </div>

      <div className="card card-pad row gap-6" style={{ flexWrap: "wrap" }}>
        <div className="stack gap-1">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("returnsPage.count")}</span>
          <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>{data ? formatNumber(data.summary.count) : "—"}</span>
        </div>
        <div className="stack gap-1">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("returnsPage.amount")}</span>
          <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>{data ? formatMoney(data.summary.amount) : "—"}</span>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar" style={{ flexWrap: "wrap" }}>
          <input type="date" className="input" style={{ width: 170 }} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          <span className="text-muted">—</span>
          <input type="date" className="input" style={{ width: 170 }} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>

        {data === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={52} />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Undo2 size={26} />} title={t("returnsPage.empty")} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("returnsPage.date")}</th>
                    <th>{t("returnsPage.products")}</th>
                    <th>{t("returnsPage.reason")}</th>
                    <th>{t("returnsPage.customer")}</th>
                    <th>{t("returnsPage.refund")}</th>
                    <th>{t("returnsPage.employee")}</th>
                    <th className="table-cell-num">{t("returnsPage.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="stack gap-1">
                          <span>{formatDateTime(r.createdAt)}</span>
                          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            {t("returnsPage.sale", { number: r.saleNumber ?? "—", date: formatDate(r.soldAt) })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="stack gap-1">
                          {r.items.map((i, idx) => (
                            <span key={idx}>
                              {i.productName} × {formatNumber(i.quantity)}
                              {i.serialNumbers.length > 0 && (
                                <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                                  {" "}
                                  · {i.serialNumbers.join(", ")}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-muted">{r.reason ?? "—"}</td>
                      <td className="text-muted">{r.customer ? `${r.customer.name}${r.customer.phone ? ` · ${r.customer.phone}` : ""}` : "—"}</td>
                      <td>{labels.paymentMethod[r.refundMethod] ?? r.refundMethod}</td>
                      <td className="text-muted">{r.employeeName}</td>
                      <td className="table-cell-num" style={{ fontWeight: 700 }}>{formatMoney(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
