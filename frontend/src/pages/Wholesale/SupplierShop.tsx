import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Package, Phone, Search, Send, Trash2 } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as wholesaleService from "../../services/wholesale.service";
import type { WholesaleProduct, WholesaleSupplier } from "../../services/wholesale.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney } from "../../utils/format";

/** One wholesaler's price list with a cart, and sending the order. */
export function SupplierShop({ supplier, onBack, onOrdered }: { supplier: WholesaleSupplier; onBack: () => void; onOrdered: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [items, setItems] = useState<WholesaleProduct[] | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [cart, setCart] = useState<Map<string, { product: WholesaleProduct; qty: number }>>(new Map());
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const debounced = useDebouncedValue(search, 350);

  useEffect(() => setPage(1), [debounced]);

  useEffect(() => {
    wholesaleService
      .listSupplierProducts(supplier.id, { search: debounced || undefined, page })
      .then((d) => {
        setItems((prev) => (page === 1 ? d.items : [...(prev ?? []), ...d.items]));
        setTotalPages(d.totalPages);
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [supplier.id, debounced, page, showToast, t]);

  function setQty(product: WholesaleProduct, qty: number) {
    setCart((prev) => {
      const next = new Map(prev);
      if (!(qty > 0)) next.delete(product.id);
      else next.set(product.id, { product, qty });
      return next;
    });
  }

  const lines = [...cart.values()];
  const total = lines.reduce((s, l) => s + l.qty * l.product.price, 0);

  async function send() {
    setSending(true);
    try {
      await wholesaleService.createOrder({
        sellerBusinessId: supplier.id,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        comment: comment || undefined,
      });
      showToast({ variant: "success", title: t("wholesale.orderSent") });
      onOrdered();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wholesale-shop">
      <div className="card">
        <div className="card-header" style={{ flexWrap: "wrap", gap: "var(--space-3)" }}>
          <div className="row gap-3">
            <button className="btn btn-ghost btn-sm" onClick={onBack} aria-label={t("common.back", { defaultValue: "←" })}>
              <ArrowLeft size={16} />
            </button>
            <div className="stack">
              <h2 className="card-title">{supplier.name}</h2>
              <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                {[supplier.address, supplier.note].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          {supplier.phone && (
            <a className="btn btn-secondary btn-sm" href={`tel:${supplier.phone}`}>
              <Phone size={14} /> {supplier.phone}
            </a>
          )}
        </div>
        <div className="card-pad stack gap-3">
          <div className="input-with-icon">
            <Search size={16} />
            <input className="input" placeholder={t("wholesale.searchProducts")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {items === null ? (
            <span className="text-muted">{t("common.loading", { defaultValue: "…" })}</span>
          ) : items.length === 0 ? (
            <span className="text-muted">{t("wholesale.noProducts")}</span>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td style={{ width: 44 }}>
                        <div className="wholesale-thumb">{p.imageUrl ? <img src={p.imageUrl} alt="" /> : <Package size={16} />}</div>
                      </td>
                      <td>
                        <div className="stack">
                          <strong>{p.name}</strong>
                          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            {[p.category, p.barcode].filter(Boolean).join(" · ")}
                          </span>
                        </div>
                      </td>
                      <td className="table-cell-num mono-num">{formatMoney(p.price)}</td>
                      <td style={{ width: 110 }}>
                        <input
                          type="number"
                          min={0}
                          step="any"
                          className="input"
                          placeholder="0"
                          value={cart.get(p.id)?.qty ?? ""}
                          onChange={(e) => setQty(p, Number(e.target.value))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {page < totalPages && (
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: "center" }} onClick={() => setPage((n) => n + 1)}>
              {t("wholesale.more")}
            </button>
          )}
        </div>
      </div>

      <div className="card wholesale-cart">
        <div className="card-header">
          <h2 className="card-title">{t("wholesale.cart")}</h2>
        </div>
        <div className="card-pad stack gap-3">
          {lines.length === 0 ? (
            <span className="text-muted">{t("wholesale.cartEmpty")}</span>
          ) : (
            lines.map((l) => (
              <div key={l.product.id} className="row gap-2" style={{ justifyContent: "space-between", fontSize: "var(--font-size-sm)" }}>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {l.product.name} × {l.qty}
                </span>
                <span className="row gap-1">
                  <strong className="mono-num">{formatMoney(l.qty * l.product.price)}</strong>
                  <button className="btn btn-ghost btn-sm" onClick={() => setQty(l.product, 0)} aria-label="remove">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            ))
          )}
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>{t("wholesale.total")}</strong>
            <strong className="mono-num">{formatMoney(total)}</strong>
          </div>
          <textarea className="textarea" rows={2} placeholder={t("wholesale.commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn btn-primary" disabled={sending || lines.length === 0} onClick={send}>
            <Send size={16} /> {sending ? t("common.saving") : t("wholesale.sendOrder")}
          </button>
        </div>
      </div>
    </div>
  );
}
