import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, TrendingDown } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../hooks/useAuth";
import * as supplierService from "../../services/supplier.service";
import type { ReorderSuggestion } from "../../services/stock.service";
import { formatNumber, unitLabel } from "../../utils/format";
import { supplierOrderMessage, whatsappShareLink } from "../../utils/messages";
import type { Supplier } from "../../types";

interface RowState {
  checked: boolean;
  quantity: number;
  supplierId: string;
}

/**
 * Running-low goods, each with a two-week quantity and the supplier it was
 * last bought from. Ticked rows turn into one ready WhatsApp order per supplier.
 */
export function ReorderCard({ suggestions }: { suggestions: ReorderSuggestion[] }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});

  useEffect(() => {
    supplierService.listSuppliers().then(setSuppliers).catch(() => undefined);
  }, []);

  useEffect(() => {
    setRows(Object.fromEntries(suggestions.map((s) => [s.productId, { checked: true, quantity: s.suggestedQuantity, supplierId: s.supplier?.id ?? "" }])));
  }, [suggestions]);

  const update = (id: string, patch: Partial<RowState>) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // One order per supplier; ticked rows without a supplier go in their own group.
  const orders = useMemo(() => {
    const groups = new Map<string, { row: ReorderSuggestion; quantity: number }[]>();
    for (const s of suggestions) {
      const state = rows[s.productId];
      if (!state?.checked || !(state.quantity > 0)) continue;
      const list = groups.get(state.supplierId) ?? [];
      list.push({ row: s, quantity: state.quantity });
      groups.set(state.supplierId, list);
    }
    return [...groups].map(([supplierId, items]) => ({ supplier: suppliers.find((x) => x.id === supplierId) ?? null, items }));
  }, [rows, suggestions, suppliers]);

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <TrendingDown size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("stock.reorder.title")}
          </h2>
          <p className="card-subtitle">{t("stock.reorder.orderSubtitle")}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>{t("stock.reorder.product")}</th>
              <th className="table-cell-num">{t("stock.reorder.currentStock")}</th>
              <th>{t("stock.reorder.eta")}</th>
              <th>{t("stock.reorder.orderQty")}</th>
              <th>{t("stock.reorder.supplier")}</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((r) => {
              const state = rows[r.productId];
              if (!state) return null;
              return (
                <tr key={r.productId}>
                  <td>
                    <input type="checkbox" checked={state.checked} onChange={(e) => update(r.productId, { checked: e.target.checked })} aria-label={r.name} />
                  </td>
                  <td style={{ fontWeight: 600 }}>{r.name}</td>
                  <td className="table-cell-num">
                    {formatNumber(r.quantity)} {unitLabel(r.unit)}
                  </td>
                  <td>
                    {r.daysUntilStockout !== null ? (
                      <Badge variant={r.daysUntilStockout <= 2 ? "danger" : "warning"}>
                        {r.daysUntilStockout === 0 ? t("stock.reorder.etaToday") : t("stock.reorder.etaDays", { days: r.daysUntilStockout })}
                      </Badge>
                    ) : (
                      <Badge variant="warning">{t("stock.reorder.belowMin", { min: formatNumber(r.minQuantity) })}</Badge>
                    )}
                  </td>
                  <td>
                    <div className="row gap-1">
                      <input
                        type="number"
                        min={0}
                        step="any"
                        className="input"
                        style={{ width: 80, height: 32 }}
                        value={state.quantity || ""}
                        onChange={(e) => update(r.productId, { quantity: Number(e.target.value) })}
                      />
                      <span className="text-muted">{unitLabel(r.unit)}</span>
                    </div>
                  </td>
                  <td>
                    <select className="select" style={{ minWidth: 150, height: 32 }} value={state.supplierId} onChange={(e) => update(r.productId, { supplierId: e.target.value })}>
                      <option value="">{t("stock.reorder.noSupplier")}</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {orders.length > 0 && (
        <div className="card-pad row gap-2" style={{ flexWrap: "wrap", borderTop: "1px solid var(--color-border)" }}>
          {orders.map(({ supplier, items }) => (
            <a
              key={supplier?.id ?? "none"}
              className="btn btn-secondary btn-sm"
              href={whatsappShareLink(supplier?.phone, supplierOrderMessage(items, session?.business.name ?? ""))}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={14} color="var(--color-success-text)" />
              {supplier ? t("stock.reorder.sendTo", { name: supplier.name, count: items.length }) : t("stock.reorder.sendNoSupplier", { count: items.length })}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
