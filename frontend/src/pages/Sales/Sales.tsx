import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Receipt, Search } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { Badge } from "../../components/ui/Badge";
import { SaleDrawer } from "./SaleDrawer";
import { ReturnModal } from "./ReturnModal";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useLocations } from "../../hooks/useLocations";
import * as saleService from "../../services/sale.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney } from "../../utils/format";
import type { PaymentMethod, SaleDetail, SaleListItem } from "../../types";
import "./Sales.css";

const PAGE_SIZE = 20;

export default function Sales() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const labels = useLabels();
  const { locations, multiple } = useLocations();
  const [params, setParams] = useSearchParams();
  const [sales, setSales] = useState<SaleListItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [locationId, setLocationId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<SaleDetail | null>(null);
  const [returning, setReturning] = useState<SaleDetail | null>(null);

  const load = useCallback(() => {
    setSales(null);
    saleService
      .listSales({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch.trim() || undefined,
        paymentMethod: paymentMethod || undefined,
        locationId: locationId || undefined,
        from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
      })
      .then((res) => {
        setSales(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [page, debouncedSearch, paymentMethod, locationId, from, to, showToast, t]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, paymentMethod, locationId, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const open = useCallback(
    async (id: string) => {
      try {
        setSelected(await saleService.getSale(id));
      } catch (error) {
        showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) });
      }
    },
    [showToast, t],
  );

  // Deep link from the global search / customer profile: /sales?open=<id>
  useEffect(() => {
    const id = params.get("open");
    if (id) {
      open(id);
      params.delete("open");
      setParams(params, { replace: true });
    }
  }, [params, setParams, open]);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("sales.title")}</h1>
          <p className="page-subtitle">{t("sales.subtitle")}</p>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar row gap-3" style={{ padding: "var(--space-4)", flexWrap: "wrap" }}>
          <div className="input-with-icon" style={{ flex: 1, minWidth: 220 }}>
            <Search size={16} />
            <input className="input" placeholder={t("sales.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" style={{ width: 160 }} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | "")}>
            <option value="">{t("sales.allPayments")}</option>
            {(["CASH", "CARD", "QR", "DEBT"] as const).map((m) => (
              <option key={m} value={m}>
                {labels.paymentMethod[m]}
              </option>
            ))}
          </select>
          {multiple && (
            <select className="select" style={{ width: 170 }} value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{t("stock.allLocations")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
          <input type="date" className="input" style={{ width: 150 }} value={from} onChange={(e) => setFrom(e.target.value)} />
          <input type="date" className="input" style={{ width: 150 }} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        {sales === null ? (
          <div className="card-pad">
            <SkeletonRows rows={8} height={46} />
          </div>
        ) : sales.length === 0 ? (
          <EmptyState icon={<Receipt size={26} />} title={t("sales.empty")} subtitle={t("sales.emptySubtitle")} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>{t("stock.table.date")}</th>
                    <th>{t("sales.customer")}</th>
                    <th>{t("sales.payment")}</th>
                    <th className="table-cell-num">{t("sales.items")}</th>
                    <th className="table-cell-num">{t("sales.total")}</th>
                    <th>{t("sales.cashier")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className="table-row-clickable" onClick={() => open(s.id)}>
                      <td className="mono-num">{s.number ?? "—"}</td>
                      <td className="text-muted">{formatDateTime(s.createdAt)}</td>
                      <td>{s.customerName ?? "—"}</td>
                      <td>
                        <Badge variant={s.paymentMethod === "DEBT" ? "warning" : "neutral"}>{labels.paymentMethod[s.paymentMethod]}</Badge>
                      </td>
                      <td className="table-cell-num">{s.itemCount}</td>
                      <td className="table-cell-num">
                        <span className="mono-num" style={{ fontWeight: 600 }}>
                          {formatMoney(s.total)}
                        </span>
                        {s.returnedTotal > 0 && (
                          <div className="text-danger" style={{ fontSize: "var(--font-size-xs)" }}>
                            −{formatMoney(s.returnedTotal)}
                          </div>
                        )}
                      </td>
                      <td className="text-muted">{s.cashierName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </>
        )}
      </div>

      <SaleDrawer sale={selected} onClose={() => setSelected(null)} onReturn={(sale) => setReturning(sale)} />
      <ReturnModal
        sale={returning}
        onClose={() => setReturning(null)}
        onDone={(sale) => {
          setReturning(null);
          setSelected(sale);
          load();
        }}
      />
    </div>
  );
}
