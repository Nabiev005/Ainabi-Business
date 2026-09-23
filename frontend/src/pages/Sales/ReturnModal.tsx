import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Undo2 } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as saleService from "../../services/sale.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney, formatNumber, unitLabel } from "../../utils/format";
import type { PaymentMethod, SaleDetail, SaleDetailItem } from "../../types";

interface ReturnModalProps {
  sale: SaleDetail | null;
  onClose: () => void;
  onDone: (sale: SaleDetail) => void;
}

/** How many of this line can still come back, in the units it was sold in. */
function returnable(item: SaleDetailItem) {
  const left = item.quantity - item.returnedQuantity;
  if (item.packageQuantity) return Math.round((left / (item.quantity / item.packageQuantity)) * 1000) / 1000;
  return Math.round(left * 1000) / 1000;
}

export function ReturnModal({ sale, onClose, onDone }: ReturnModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const labels = useLabels();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [serials, setSerials] = useState<Record<string, string[]>>({});
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>("CASH");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sale) {
      setQuantities({});
      setSerials({});
      setReason("");
      setRefundMethod(sale.paymentMethod === "DEBT" ? "DEBT" : sale.paymentMethod);
    }
  }, [sale]);

  const paidRatio = sale && sale.subtotal > 0 ? sale.total / sale.subtotal : 1;

  const refund = useMemo(() => {
    if (!sale) return 0;
    return sale.items.reduce((sum, item) => {
      const qty = item.serialNumbers.length ? (serials[item.id]?.length ?? 0) : Number(quantities[item.id]) || 0;
      const soldUnits = item.packageQuantity ?? item.quantity;
      return sum + (soldUnits > 0 ? (item.total * qty) / soldUnits : 0) * paidRatio;
    }, 0);
  }, [sale, quantities, serials, paidRatio]);

  if (!sale) return null;

  async function submit() {
    if (!sale) return;
    const items = sale.items
      .map((item) => {
        if (item.serialNumbers.length) {
          const picked = serials[item.id] ?? [];
          return picked.length ? { saleItemId: item.id, quantity: picked.length, serialNumbers: picked } : null;
        }
        const qty = Number(quantities[item.id]) || 0;
        return qty > 0 ? { saleItemId: item.id, quantity: qty } : null;
      })
      .filter((i): i is NonNullable<typeof i> => i !== null);
    if (items.length === 0) return;

    setSaving(true);
    try {
      const result = await saleService.createReturn(sale.id, { items, refundMethod, reason: reason || null });
      showToast({ variant: "success", title: t("sales.return.done", { amount: formatMoney(result.total) }) });
      onDone(result.sale);
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  const methods: PaymentMethod[] = sale.paymentMethod === "DEBT" ? ["DEBT", "CASH", "CARD", "QR"] : ["CASH", "CARD", "QR"];

  return (
    <Modal open={!!sale} onClose={onClose} size="wide">
      <div className="stack gap-4">
        <h2 className="card-title">
          <Undo2 size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          {t("sales.return.title", { number: sale.number ?? "" })}
        </h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t("stock.table.product")}</th>
                <th className="table-cell-num">{t("sales.return.available")}</th>
                <th className="table-cell-num">{t("sales.return.quantity")}</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item) => {
                const max = returnable(item);
                const unit = item.packageName ?? unitLabel(item.unit);
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.productName}</div>
                      <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                        {formatMoney(item.price)} / {unit}
                      </div>
                      {item.serialNumbers.length > 0 && (
                        <div className="chip-list" style={{ marginTop: 6 }}>
                          {item.serialNumbers.map((s) => {
                            const already = item.returnedSerials.includes(s);
                            const checked = serials[item.id]?.includes(s) ?? false;
                            return (
                              <label key={s} className="chip mono-num" style={{ opacity: already ? 0.5 : 1, cursor: already ? "default" : "pointer" }}>
                                <input
                                  type="checkbox"
                                  disabled={already}
                                  checked={checked}
                                  onChange={(e) =>
                                    setSerials((prev) => ({
                                      ...prev,
                                      [item.id]: e.target.checked ? [...(prev[item.id] ?? []), s] : (prev[item.id] ?? []).filter((x) => x !== s),
                                    }))
                                  }
                                />
                                {s}
                                {already ? ` (${t("sales.return.returned")})` : ""}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </td>
                    <td className="table-cell-num">
                      {formatNumber(max)} {unit}
                    </td>
                    <td className="table-cell-num">
                      {item.serialNumbers.length > 0 ? (
                        <span className="mono-num">{serials[item.id]?.length ?? 0}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={max}
                          step="any"
                          disabled={max <= 0}
                          className={`input doc-input ${Number(quantities[item.id]) > max ? "has-error" : ""}`}
                          style={{ width: 90, textAlign: "right" }}
                          value={quantities[item.id] ?? ""}
                          placeholder="0"
                          onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("sales.return.refundMethod")}</label>
            <select className="select" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as PaymentMethod)}>
              {methods.map((m) => (
                <option key={m} value={m}>
                  {m === "DEBT" ? t("sales.return.fromDebt") : labels.paymentMethod[m]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">{t("sales.return.reason")}</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("sales.return.reasonPlaceholder")} />
          </div>
        </div>
        {paidRatio < 1 && <span className="field-hint">{t("sales.return.discountHint")}</span>}

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <span className="spacer" style={{ fontWeight: 700 }}>
            {t("sales.return.refund")}: {formatMoney(refund)}
          </span>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-danger" onClick={submit} disabled={saving || refund <= 0}>
            {saving ? t("common.saving") : t("sales.return.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
