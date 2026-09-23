import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Banknote, CreditCard, Minus, Package, Plus, QrCode, ScanBarcode, Search, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as productService from "../../services/product.service";
import * as categoryService from "../../services/category.service";
import * as customerService from "../../services/customer.service";
import * as saleService from "../../services/sale.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney } from "../../utils/format";
import { buildPaymentQrText, generateQrDataUrl } from "../../utils/qr";
import { attributeChips } from "../../utils/attributes";
import type { Category, Customer, PaymentMethod, Product } from "../../types";
import "./Pos.css";

interface CartLine {
  product: Product;
  quantity: number;
  /** IMEI / serial per unit — only used when product.requiresSerial. */
  serials: string[];
}

/** One input per unit sold. Enter jumps to the next box, so a handheld
 * scanner (which "types" the code and presses Enter) can fill them in a row. */
function SerialInputs({ line, onChange }: { line: CartLine; onChange: (index: number, value: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="pos-serials">
      {Array.from({ length: line.quantity }, (_, index) => (
        <input
          key={index}
          className={`input pos-serial-input ${line.serials[index]?.trim() ? "" : "is-empty"}`}
          data-serial={`${line.product.id}-${index}`}
          placeholder={t("pos.cart.serialPlaceholder", { n: index + 1 })}
          value={line.serials[index] ?? ""}
          onChange={(e) => onChange(index, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            document.querySelector<HTMLInputElement>(`[data-serial="${line.product.id}-${index + 1}"]`)?.focus();
          }}
        />
      ))}
    </div>
  );
}

const PAYMENT_ICONS: Record<PaymentMethod, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  QR: QrCode,
  DEBT: Wallet,
};
const PAYMENT_ORDER: PaymentMethod[] = ["CASH", "CARD", "QR", "DEBT"];

/** The number between −/+ in the cart — typing directly beats clicking +
 * fifty times for a bulk sale. Keeps its own draft text so a mid-edit empty
 * field or a lone "0" doesn't yank the line out from under the cashier;
 * the real quantity only commits on blur/Enter, clamped to what's in stock. */
function CartQtyInput({
  quantity,
  max,
  onCommit,
  onExceedsStock,
}: {
  quantity: number;
  max: number;
  onCommit: (qty: number) => void;
  onExceedsStock: (max: number) => void;
}) {
  const [text, setText] = useState(String(quantity));

  useEffect(() => {
    setText(String(quantity));
  }, [quantity]);

  function commit() {
    const parsed = Math.floor(Number(text));
    if (!text.trim() || Number.isNaN(parsed) || parsed <= 0) {
      setText(String(quantity));
      onCommit(0);
      return;
    }
    if (parsed > max) onExceedsStock(max);
    const clamped = Math.min(parsed, max);
    setText(String(clamped));
    if (clamped !== quantity) onCommit(clamped);
  }

  return (
    <input
      type="number"
      className="pos-qty-input"
      value={text}
      min={1}
      max={max}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Shown once "QR" is picked as the payment method — a QR code the customer
 * scans with their own banking app, encoding the shop's payment details and
 * the sale total (see utils/qr.ts for why this is read text, not an
 * automated-payment QR). Regenerates whenever the amount or details change. */
function QrPaymentPanel({ businessName, qrPaymentInfo, amount }: { businessName: string; qrPaymentInfo: string | null | undefined; amount: number }) {
  const { t } = useTranslation();
  const [qrImage, setQrImage] = useState<string | null>(null);

  useEffect(() => {
    if (!qrPaymentInfo) {
      setQrImage(null);
      return;
    }
    let cancelled = false;
    generateQrDataUrl(buildPaymentQrText(businessName, qrPaymentInfo, formatMoney(amount))).then((dataUrl) => {
      if (!cancelled) setQrImage(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [businessName, qrPaymentInfo, amount]);

  if (!qrPaymentInfo) {
    return (
      <div className="pos-qr-panel pos-qr-panel-empty">
        <QrCode size={20} />
        <span>{t("pos.summary.qrNotConfigured")}</span>
        <Link to="/settings" className="pos-qr-settings-link">
          {t("pos.summary.qrGoToSettings")}
        </Link>
      </div>
    );
  }

  return (
    <div className="pos-qr-panel">
      {qrImage ? <img src={qrImage} alt="QR" width={140} height={140} /> : <div className="pos-qr-placeholder" />}
      <span className="pos-qr-info">{qrPaymentInfo}</span>
      <span className="pos-qr-hint">{t("pos.summary.qrScanHint")}</span>
    </div>
  );
}

export default function Pos() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const labels = useLabels();
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);
  const [barcode, setBarcode] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [customerId, setCustomerId] = useState("");
  const [completing, setCompleting] = useState(false);
  const [bumpedId, setBumpedId] = useState<string | null>(null);
  const productFields = session?.business.productFields;

  const loadProducts = useCallback(() => {
    productService
      .listProducts({ search: debouncedSearch || undefined, categoryId: activeCategory || undefined, status: "ACTIVE", pageSize: 100 })
      .then((res) => setProducts(res.items))
      .catch((error) => showToast({ variant: "error", title: t("pos.loadFailed"), message: extractErrorMessage(error) }));
  }, [debouncedSearch, activeCategory, showToast, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => undefined);
    customerService.listCustomers().then(setCustomers).catch(() => undefined);
  }, []);

  function addToCart(product: Product) {
    if (product.quantity <= 0) return;
    setCart((prev) => {
      const existing = prev.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          showToast({ variant: "error", title: t("pos.insufficientStockTitle"), message: t("pos.insufficientStockOnly", { name: product.name, qty: product.quantity }) });
          return prev;
        }
        return prev.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      }
      return [...prev, { product, quantity: 1, serials: [] }];
    });
    // Quick visual confirmation that the tap registered — the cart line pops once.
    setBumpedId(product.id);
    window.setTimeout(() => setBumpedId((current) => (current === product.id ? null : current)), 320);
  }

  function changeQuantity(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.product.id !== productId) return line;
          const next = line.quantity + delta;
          if (next > line.product.quantity) {
            showToast({ variant: "error", title: t("pos.insufficientStockTitle"), message: t("pos.insufficientStockRemaining", { qty: line.product.quantity }) });
            return line;
          }
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function setLineSerial(productId: string, index: number, value: string) {
    setCart((prev) =>
      prev.map((line) => {
        if (line.product.id !== productId) return line;
        const serials = [...line.serials];
        serials[index] = value;
        return { ...line, serials };
      }),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((line) => line.product.id !== productId));
  }

  function setLineQuantity(productId: string, quantity: number) {
    setCart((prev) => prev.map((line) => (line.product.id === productId ? { ...line, quantity } : line)).filter((line) => line.quantity > 0));
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!barcode.trim()) return;
    try {
      const product = await productService.findByBarcode(barcode.trim());
      addToCart(product);
      setBarcode("");
    } catch {
      showToast({ variant: "error", title: t("pos.productNotFoundTitle"), message: t("pos.productNotFoundMessage", { barcode }) });
    }
  }

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.product.salePrice * line.quantity, 0), [cart]);
  const total = Math.max(0, subtotal - discount);

  async function completeSale() {
    if (cart.length === 0) return;
    if (paymentMethod === "DEBT" && !customerId) {
      showToast({ variant: "error", title: t("pos.summary.selectCustomerTitle"), message: t("pos.summary.selectCustomerMessage") });
      return;
    }
    const seen = new Set<string>();
    for (const line of cart) {
      if (!line.product.requiresSerial) continue;
      const serials = line.serials.slice(0, line.quantity).map((s) => s.trim());
      if (serials.length < line.quantity || serials.some((s) => !s)) {
        showToast({ variant: "error", title: t("pos.serialMissingTitle"), message: t("pos.serialMissingMessage", { name: line.product.name }) });
        return;
      }
      for (const serial of serials) {
        const key = serial.toUpperCase();
        if (seen.has(key)) {
          showToast({ variant: "error", title: t("pos.serialMissingTitle"), message: t("pos.serialDuplicate", { serial }) });
          return;
        }
        seen.add(key);
      }
    }
    setCompleting(true);
    try {
      await saleService.createSale({
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          ...(line.product.requiresSerial ? { serialNumbers: line.serials.slice(0, line.quantity).map((s) => s.trim()) } : {}),
        })),
        discount,
        paymentMethod,
        customerId: paymentMethod === "DEBT" ? customerId : undefined,
      });
      showToast({ variant: "success", title: t("pos.summary.saleSuccessTitle"), message: t("pos.summary.saleSuccessMessage", { total: formatMoney(total) }) });
      setCart([]);
      setDiscount(0);
      setCustomerId("");
      setPaymentMethod("CASH");
      loadProducts();
    } catch (error) {
      showToast({ variant: "error", title: t("pos.summary.saleFailedTitle"), message: extractErrorMessage(error) });
    } finally {
      setCompleting(false);
    }
  }

  return (
    <div className="pos-shell">
      <div className="card pos-catalog">
        <div className="pos-catalog-toolbar">
          <div className="row gap-2">
            <div className="input-with-icon" style={{ flex: 1 }}>
              <Search size={16} />
              <input className="input" placeholder={t("pos.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <form onSubmit={handleBarcodeSubmit} className="input-with-icon" style={{ width: 200 }}>
              <ScanBarcode size={16} />
              <input className="input" placeholder={t("pos.barcodePlaceholder")} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </form>
          </div>
          <div className="pos-category-scroll">
            <button className={`pos-category-chip ${activeCategory === "" ? "active" : ""}`} onClick={() => setActiveCategory("")}>
              {t("pos.allCategories")}
            </button>
            {categories.map((c) => (
              <button key={c.id} className={`pos-category-chip ${activeCategory === c.id ? "active" : ""}`} onClick={() => setActiveCategory(c.id)}>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {products === null ? (
          <div className="card-pad">
            <SkeletonRows rows={6} height={60} />
          </div>
        ) : products.length === 0 ? (
          <EmptyState icon={<Package size={26} />} title={t("pos.emptyProducts")} subtitle={t("pos.emptyProductsSubtitle")} />
        ) : (
          <div className="pos-product-grid">
            {products.map((p) => (
              <button key={p.id} className="pos-product-card" onClick={() => addToCart(p)} disabled={p.quantity <= 0}>
                <div className="pos-product-thumb">{p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <Package size={22} />}</div>
                {p.categoryName && <span className="pos-product-category">{p.categoryName}</span>}
                <span className="pos-product-name">{p.name}</span>
                {attributeChips(p, productFields).length > 0 && (
                  <span className="pos-product-attrs">{attributeChips(p, productFields).slice(0, 3).join(" · ")}</span>
                )}
                <span className="pos-product-price">{formatMoney(p.salePrice)}</span>
                <span className="pos-product-stock">{p.quantity > 0 ? `${p.quantity} ${t("pos.left")}` : t("pos.out")}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="card pos-cart">
        <div className="pos-cart-header row gap-2">
          <ShoppingCart size={18} className={bumpedId ? "pop-once" : undefined} />
          <span className="card-title">{t("pos.cart.title")}</span>
          {cart.length > 0 && <span className="badge badge-info">{cart.reduce((sum, l) => sum + l.quantity, 0)}</span>}
          <span className="spacer" />
          {cart.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setCart([])}>
              {t("pos.cart.clear")}
            </button>
          )}
        </div>

        <div className="pos-cart-items">
          {cart.length === 0 ? (
            <EmptyState icon={<ShoppingCart size={22} />} title={t("pos.cart.empty")} subtitle={t("pos.cart.emptySubtitle")} />
          ) : (
            cart.map((line) => (
              <div className="pos-cart-line" key={line.product.id}>
                <div className="pos-cart-item">
                  <div className="pos-cart-item-info">
                    <div className="pos-cart-item-name">{line.product.name}</div>
                    <div className="pos-cart-item-price">
                      {line.quantity} × {formatMoney(line.product.salePrice)}
                    </div>
                  </div>
                  <div className="pos-qty-control">
                    <button onClick={() => changeQuantity(line.product.id, -1)} aria-label={t("pos.cart.decrease")}>
                      <Minus size={13} />
                    </button>
                    <CartQtyInput
                      quantity={line.quantity}
                      max={line.product.quantity}
                      onCommit={(qty) => setLineQuantity(line.product.id, qty)}
                      onExceedsStock={(maxQty) =>
                        showToast({ variant: "error", title: t("pos.insufficientStockTitle"), message: t("pos.insufficientStockRemaining", { qty: maxQty }) })
                      }
                    />
                    <button onClick={() => changeQuantity(line.product.id, 1)} aria-label={t("pos.cart.increase")}>
                      <Plus size={13} />
                    </button>
                  </div>
                  <span className="pos-cart-item-total mono-num">{formatMoney(line.product.salePrice * line.quantity)}</span>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeLine(line.product.id)} aria-label={t("pos.cart.removeAria")}>
                    <Trash2 size={15} color="var(--color-danger-text)" />
                  </button>
                </div>
                {line.product.requiresSerial && (
                  <SerialInputs line={line} onChange={(index, value) => setLineSerial(line.product.id, index, value)} />
                )}
                {line.product.warrantyMonths ? (
                  <div className="pos-cart-warranty">{t("pos.cart.warranty", { months: line.product.warrantyMonths })}</div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="pos-summary">
          <div className="pos-summary-row">
            <span>{t("pos.summary.subtotal")}</span>
            <span className="mono-num">{formatMoney(subtotal)}</span>
          </div>
          <div className="pos-summary-row" style={{ alignItems: "center" }}>
            <span>{t("pos.summary.discount")}</span>
            <input
              type="number"
              min={0}
              className="input"
              style={{ width: 120, height: 32, textAlign: "right" }}
              value={discount || ""}
              placeholder="0"
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
            />
          </div>
          <div className="pos-summary-total">
            <span>{t("pos.summary.total")}</span>
            <span className="mono-num">{formatMoney(total)}</span>
          </div>

          <div className="pos-payment-grid">
            {PAYMENT_ORDER.map((value) => {
              const Icon = PAYMENT_ICONS[value];
              return (
                <button key={value} className={`pos-payment-btn ${paymentMethod === value ? "active" : ""}`} onClick={() => setPaymentMethod(value)}>
                  <Icon size={18} />
                  {labels.paymentMethod[value]}
                </button>
              );
            })}
          </div>

          {paymentMethod === "QR" && (
            <QrPaymentPanel businessName={session?.business.name ?? ""} qrPaymentInfo={session?.business.qrPaymentInfo} amount={total} />
          )}

          {paymentMethod === "DEBT" && (
            <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("pos.summary.selectCustomer")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `— ${c.phone}` : ""}
                </option>
              ))}
            </select>
          )}

          <button className="btn btn-primary btn-lg btn-block" disabled={cart.length === 0 || completing} onClick={completeSale}>
            {completing ? t("pos.summary.completing") : t("pos.summary.completeButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
