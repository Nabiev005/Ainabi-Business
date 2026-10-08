import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageCircle, Phone } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import * as wholesaleService from "../../services/wholesale.service";
import type { WholesaleOrder, WholesaleStatus } from "../../services/wholesale.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney, formatNumber } from "../../utils/format";
import { whatsappLink } from "../../utils/whatsapp";

export const STATUS_BADGE: Record<WholesaleStatus, "neutral" | "info" | "warning" | "success" | "danger"> = {
  NEW: "info",
  ACCEPTED: "warning",
  SHIPPED: "warning",
  RECEIVED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};

/** One order and the next steps each side can take. */
export function OrderModal({ order, onClose, onChanged }: { order: WholesaleOrder | null; onClose: () => void; onChanged: (o: WholesaleOrder) => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [note, setNote] = useState("");
  const [recordSale, setRecordSale] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "QR">("CASH");
  const [createReceipt, setCreateReceipt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<{ name: string; barcode: string | null; quantity: number }[]>([]);

  useEffect(() => {
    setNote(order?.sellerNote ?? "");
    setUnmatched([]);
  }, [order?.id, order?.sellerNote]);

  if (!order) return null;
  const isSeller = order.side === "SELLER";
  const other = isSeller ? order.buyer : order.seller;
  const wa = whatsappLink(other.phone, t("wholesale.waText", { shop: isSeller ? order.seller.name : order.buyer.name }));

  async function move(status: WholesaleStatus) {
    if (!order) return;
    setBusy(true);
    try {
      const result = await wholesaleService.changeStatus(order.id, {
        status,
        note: isSeller ? note : undefined,
        recordSale: status === "SHIPPED" ? recordSale : undefined,
        paymentMethod: status === "SHIPPED" && recordSale ? paymentMethod : undefined,
        createReceipt: status === "RECEIVED" ? createReceipt : undefined,
      });
      setUnmatched(result.unmatched);
      onChanged(result.order);
      showToast({ variant: "success", title: t(`wholesale.status.${status}`) });
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  const s = order.status;
  return (
    <Modal open onClose={onClose} size="wide">
      <div className="stack gap-4">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 className="card-title">
            {isSeller ? t("wholesale.fromBuyer", { name: order.buyer.name }) : t("wholesale.toSeller", { name: order.seller.name })}
          </h2>
          <Badge variant={STATUS_BADGE[s]}>{t(`wholesale.status.${s}`)}</Badge>
        </div>
        <div className="row gap-3" style={{ flexWrap: "wrap", fontSize: "var(--font-size-sm)" }}>
          <span className="text-muted">
            {formatDateTime(order.createdAt)} · {order.createdByName}
          </span>
          {other.phone && (
            <a href={`tel:${other.phone}`} className="row gap-1">
              <Phone size={13} /> {other.phone}
            </a>
          )}
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer" className="row gap-1" style={{ color: "#16a34a" }}>
              <MessageCircle size={13} /> WhatsApp
            </a>
          )}
        </div>

        <div className="table-wrap">
          <table className="table">
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    {i.barcode && <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{i.barcode}</div>}
                  </td>
                  <td className="table-cell-num mono-num">{formatNumber(i.quantity)}</td>
                  <td className="table-cell-num mono-num">{formatMoney(i.price)}</td>
                  <td className="table-cell-num mono-num">
                    <strong>{formatMoney(i.price * i.quantity)}</strong>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <strong>{t("wholesale.total")}</strong>
                </td>
                <td className="table-cell-num mono-num">
                  <strong>{formatMoney(order.total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {order.comment && (
          <p style={{ margin: 0 }}>
            <span className="text-muted">{t("wholesale.buyerComment")}:</span> {order.comment}
          </p>
        )}
        {order.sellerNote && !isSeller && (
          <p style={{ margin: 0 }}>
            <span className="text-muted">{t("wholesale.sellerNote")}:</span> {order.sellerNote}
          </p>
        )}

        {unmatched.length > 0 && (
          <div className="card card-pad" style={{ background: "var(--color-warning-bg)", borderColor: "var(--color-warning-border)" }}>
            <strong>{t("wholesale.unmatchedTitle")}</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {unmatched.map((u, i) => (
                <li key={i}>
                  {u.name} × {formatNumber(u.quantity)} {u.barcode ? `(${u.barcode})` : ""}
                </li>
              ))}
            </ul>
            <span className="field-hint">{t("wholesale.unmatchedHint")}</span>
          </div>
        )}

        {isSeller && (s === "NEW" || s === "ACCEPTED") && (
          <div className="stack gap-3">
            <textarea className="textarea" rows={2} placeholder={t("wholesale.sellerNotePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
            {s === "ACCEPTED" && (
              <div className="row gap-3" style={{ flexWrap: "wrap" }}>
                <label className="row gap-2">
                  <input type="checkbox" checked={recordSale} onChange={(e) => setRecordSale(e.target.checked)} />
                  {t("wholesale.recordSale")}
                </label>
                {recordSale && (
                  <select className="select" style={{ width: 160 }} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "CARD" | "QR")}>
                    <option value="CASH">{t("labels.paymentMethod.CASH")}</option>
                    <option value="CARD">{t("labels.paymentMethod.CARD")}</option>
                    <option value="QR">{t("labels.paymentMethod.QR")}</option>
                  </select>
                )}
              </div>
            )}
            <div className="row gap-2" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button className="btn btn-secondary" disabled={busy} onClick={() => move("REJECTED")}>
                {t("wholesale.reject")}
              </button>
              {s === "NEW" ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => move("ACCEPTED")}>
                  {t("wholesale.accept")}
                </button>
              ) : (
                <button className="btn btn-primary" disabled={busy} onClick={() => move("SHIPPED")}>
                  {t("wholesale.ship")}
                </button>
              )}
            </div>
          </div>
        )}

        {!isSeller && (s === "NEW" || s === "ACCEPTED") && (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btn-secondary" disabled={busy} onClick={() => move("CANCELLED")}>
              {t("wholesale.cancel")}
            </button>
          </div>
        )}

        {!isSeller && s === "SHIPPED" && (
          <div className="stack gap-3">
            <label className="row gap-2">
              <input type="checkbox" checked={createReceipt} onChange={(e) => setCreateReceipt(e.target.checked)} />
              {t("wholesale.createReceipt")}
            </label>
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => move("RECEIVED")}>
                {t("wholesale.received")}
              </button>
            </div>
          </div>
        )}

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
