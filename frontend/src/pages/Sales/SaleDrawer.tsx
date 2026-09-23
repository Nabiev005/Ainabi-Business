import { useTranslation } from "react-i18next";
import { Printer, ShieldCheck, Undo2 } from "lucide-react";
import { Drawer } from "../../components/ui/Drawer";
import { Badge } from "../../components/ui/Badge";
import { useAuth } from "../../hooks/useAuth";
import { useLabels } from "../../hooks/useLabels";
import { formatDate, formatDateTime, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import { printSaleReceipt } from "../../utils/documents";
import type { SaleDetail } from "../../types";

interface SaleDrawerProps {
  sale: SaleDetail | null;
  onClose: () => void;
  onReturn: (sale: SaleDetail) => void;
}

export function SaleDrawer({ sale, onClose, onReturn }: SaleDrawerProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const labels = useLabels();
  if (!sale) return null;

  const canReturn = session?.role !== "CASHIER" && sale.items.some((i) => i.returnedQuantity < i.quantity);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Drawer
      open={!!sale}
      onClose={onClose}
      title={t("sales.detail.title", { number: sale.number ?? "—" })}
      subtitle={formatDateTime(sale.createdAt)}
      footer={
        <>
          <button className="btn btn-secondary" onClick={() => session && printSaleReceipt(sale, session.business)}>
            <Printer size={16} /> {t("sales.detail.print")}
          </button>
          {canReturn && (
            <button className="btn btn-danger" onClick={() => onReturn(sale)}>
              <Undo2 size={16} /> {t("sales.detail.return")}
            </button>
          )}
        </>
      }
    >
      <div className="stack gap-4">
        <div className="stat-grid">
          <div className="stat-tile">
            <div className="stat-tile-label">{t("sales.detail.total")}</div>
            <div className="stat-tile-value">{formatMoney(sale.total)}</div>
          </div>
          <div className="stat-tile">
            <div className="stat-tile-label">{t("sales.detail.payment")}</div>
            <div className="stat-tile-value" style={{ fontSize: "var(--font-size-md)" }}>
              {labels.paymentMethod[sale.paymentMethod]}
              {sale.priceLevel === "WHOLESALE" && <Badge variant="info">{t("sales.wholesale")}</Badge>}
            </div>
          </div>
          {sale.returnedTotal > 0 && (
            <div className="stat-tile">
              <div className="stat-tile-label">{t("sales.detail.returned")}</div>
              <div className="stat-tile-value text-danger">−{formatMoney(sale.returnedTotal)}</div>
            </div>
          )}
        </div>

        <div className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
          {t("sales.detail.cashier")}: {sale.cashierName}
          {sale.locationName ? ` · ${sale.locationName}` : ""}
          {sale.customer ? ` · ${t("sales.detail.customer")}: ${sale.customer.name}` : ""}
        </div>

        <div className="stack gap-3">
          {sale.items.map((item) => (
            <div key={item.id} className="sale-line">
              <div className="row gap-2">
                <strong style={{ flex: 1 }}>{item.productName}</strong>
                <span className="mono-num">{formatMoney(item.total)}</span>
              </div>
              <div className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                {item.packageName
                  ? `${formatNumber(item.packageQuantity ?? 0)} ${item.packageName} (${formatNumber(item.quantity)} ${unitLabel(item.unit)})`
                  : `${formatNumber(item.quantity)} ${unitLabel(item.unit)}`}{" "}
                × {formatMoney(item.price)}
                {item.returnedQuantity > 0 && (
                  <>
                    {" "}
                    <Badge variant="danger">{t("sales.detail.returnedQty", { qty: formatNumber(item.returnedQuantity) })}</Badge>
                  </>
                )}
              </div>
              {item.serialNumbers.length > 0 && (
                <div className="chip-list" style={{ marginTop: 4 }}>
                  {item.serialNumbers.map((s) => (
                    <span key={s} className="chip mono-num" style={item.returnedSerials.includes(s) ? { textDecoration: "line-through" } : undefined}>
                      {s}
                    </span>
                  ))}
                </div>
              )}
              {item.warrantyUntil && (
                <div style={{ fontSize: "var(--font-size-xs)", marginTop: 4 }} className={item.warrantyUntil.slice(0, 10) >= today ? "text-success" : "text-muted"}>
                  <ShieldCheck size={12} style={{ verticalAlign: -2, marginRight: 4 }} />
                  {t("print.warrantyUntil", { date: formatDate(item.warrantyUntil) })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="stack gap-1" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-3)" }}>
          <div className="row">
            <span className="spacer">{t("print.subtotal")}</span>
            <span className="mono-num">{formatMoney(sale.subtotal)}</span>
          </div>
          {sale.discount > 0 && (
            <div className="row">
              <span className="spacer">{t("print.discount")}</span>
              <span className="mono-num">−{formatMoney(sale.discount)}</span>
            </div>
          )}
          <div className="row" style={{ fontWeight: 700 }}>
            <span className="spacer">{t("print.total")}</span>
            <span className="mono-num">{formatMoney(sale.total)}</span>
          </div>
        </div>

        {sale.returns.length > 0 && (
          <div className="stack gap-2">
            <strong>{t("sales.detail.returns")}</strong>
            {sale.returns.map((r) => (
              <div key={r.id} className="sale-line">
                <div className="row gap-2">
                  <span style={{ flex: 1 }}>
                    {formatDateTime(r.createdAt)} · {r.employeeName}
                  </span>
                  <span className="mono-num text-danger">−{formatMoney(r.total)}</span>
                </div>
                <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                  {r.items.map((i) => `${i.productName} ×${formatNumber(i.quantity)}`).join(", ")}
                  {" · "}
                  {r.refundMethod === "DEBT" ? t("sales.return.fromDebt") : labels.paymentMethod[r.refundMethod]}
                  {r.reason ? ` · ${r.reason}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
