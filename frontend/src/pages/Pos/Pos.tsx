import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Layers,
  Minus,
  Package,
  Plus,
  Printer,
  QrCode,
  ScanBarcode,
  Search,
  ShoppingCart,
  Trash2,
  Wallet,
} from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Modal } from "../../components/ui/Modal";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import { useLocations } from "../../hooks/useLocations";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as productService from "../../services/product.service";
import * as categoryService from "../../services/category.service";
import * as customerService from "../../services/customer.service";
import * as saleService from "../../services/sale.service";
import * as shiftService from "../../services/shift.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney, formatNumber, unitLabel } from "../../utils/format";
import { buildPaymentQrText, generateQrDataUrl } from "../../utils/qr";
import { attributeChips } from "../../utils/attributes";
import { printSaleReceipt } from "../../utils/documents";
import type { Category, Customer, PaymentMethod, Product, SaleDetail } from "../../types";
import "./Pos.css";

interface CartLine {
  /** productId, or productId:packageId when sold by package. */
  key: string;
  product: Product;
  packageId: string | null;
  quantity: number;
  /** IMEI / serial per unit — only used when product.requiresSerial. */
  serials: string[];
}

type PriceLevel = "RETAIL" | "WHOLESALE";

const PAYMENT_ICONS: Record<PaymentMethod, typeof Banknote> = {
  CASH: Banknote,
  CARD: CreditCard,
  QR: QrCode,
  DEBT: Wallet,
};
const PAYMENT_ORDER: PaymentMethod[] = ["CASH", "CARD", "QR", "DEBT"];
const DECIMAL_UNITS = new Set(["KG", "LITER", "METER"]);

/** What's available to sell here: this branch's stock when known, else the total. */
function available(product: Product) {
  return product.locationQuantity ?? product.quantity;
}

function packageOf(line: Pick<CartLine, "product" | "packageId">) {
  return line.packageId ? (line.product.packages.find((p) => p.id === line.packageId) ?? null) : null;
}

/** Base units a line takes out of stock. */
function baseQuantity(line: CartLine) {
  const pkg = packageOf(line);
  return pkg ? line.quantity * pkg.factor : line.quantity;
}

/** Price of one sold unit of the line (a package, or one base unit) — mirrors the server. */
function linePrice(line: Pick<CartLine, "product" | "packageId">, level: PriceLevel) {
  const { product } = line;
  const pkg = packageOf(line);
  const wholesale = level === "WHOLESALE" && product.wholesalePrice !== null;
  const unitPrice = wholesale ? product.wholesalePrice! : product.salePrice;
  if (!pkg) return unitPrice;
  if (!wholesale && pkg.salePrice !== null) return pkg.salePrice;
  return Math.round(unitPrice * pkg.factor * 100) / 100;
}

/** The number between −/+ in the cart. Keeps its own draft text so a
 * mid-edit empty field doesn't yank the line out from under the cashier;
 * the real quantity only commits on blur/Enter, clamped to what's in stock. */
function CartQtyInput({
  quantity,
  max,
  decimals,
  onCommit,
  onExceedsStock,
}: {
  quantity: number;
  max: number;
  decimals: boolean;
  onCommit: (qty: number) => void;
  onExceedsStock: (max: number) => void;
}) {
  const [text, setText] = useState(String(quantity));

  useEffect(() => {
    setText(String(quantity));
  }, [quantity]);

  function commit() {
    const raw = Number(text.replace(",", "."));
    const parsed = decimals ? Math.round(raw * 1000) / 1000 : Math.floor(raw);
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
      min={decimals ? 0.001 : 1}
      step={decimals ? "0.001" : "1"}
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

/** One IMEI box per unit; Enter jumps to the next box (handheld scanners
 * "type" the code and press Enter). In-stock serials are suggested. */
function SerialInputs({ line, suggestions, onChange }: { line: CartLine; suggestions: string[]; onChange: (index: number, value: string) => void }) {
  const { t } = useTranslation();
  const listId = `serials-${line.product.id}`;
  return (
    <div className="pos-serials">
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {Array.from({ length: line.quantity }, (_, index) => (
        <input
          key={index}
          className={`input pos-serial-input ${line.serials[index]?.trim() ? "" : "is-empty"}`}
          data-serial={`${line.key}-${index}`}
          list={suggestions.length > 0 ? listId : undefined}
          placeholder={t("pos.cart.serialPlaceholder", { n: index + 1 })}
          value={line.serials[index] ?? ""}
          onChange={(e) => onChange(index, e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            document.querySelector<HTMLInputElement>(`[data-serial="${line.key}-${index + 1}"]`)?.focus();
          }}
        />
      ))}
    </div>
  );
}

/** A catalog card: a single product, or a whole variant group (sizes/colours). */
type CatalogCard =
  | { kind: "product"; product: Product }
  | { kind: "group"; groupId: string; name: string; variants: Product[] };

export default function Pos() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const labels = useLabels();
  const business = session?.business;
  const { locations, current: myLocation, multiple } = useLocations();
  const canPickLocation = multiple && session?.role !== "CASHIER";

  const [locationId, setLocationId] = useState("");
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
  const [priceLevel, setPriceLevel] = useState<PriceLevel>("RETAIL");
  const [cashGiven, setCashGiven] = useState("");
  const [completing, setCompleting] = useState(false);
  const [bumpedKey, setBumpedKey] = useState<string | null>(null);
  const [serialSuggestions, setSerialSuggestions] = useState<Record<string, string[]>>({});

  const [variantGroup, setVariantGroup] = useState<{ name: string; variants: Product[] } | null>(null);
  const [analogsFor, setAnalogsFor] = useState<{ product: Product; analogs: Product[] } | null>(null);
  const [prescriptionAsk, setPrescriptionAsk] = useState(false);
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!locationId && myLocation) setLocationId(myLocation.id);
  }, [myLocation, locationId]);

  const loadProducts = useCallback(() => {
    if (!locationId) return;
    productService
      .listProducts({ search: debouncedSearch || undefined, categoryId: activeCategory || undefined, status: "ACTIVE", pageSize: 200, locationId })
      .then((res) => setProducts(res.items))
      .catch((error) => showToast({ variant: "error", title: t("pos.loadFailed"), message: extractErrorMessage(error) }));
  }, [debouncedSearch, activeCategory, locationId, showToast, t]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => undefined);
    customerService.listCustomers().then(setCustomers).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!business?.requireShift) {
      setShiftOpen(true);
      return;
    }
    shiftService
      .getCurrentShift()
      .then((s) => setShiftOpen(!!s))
      .catch(() => setShiftOpen(false));
  }, [business?.requireShift]);

  // Changing branch empties the cart — its stock numbers belong to the old one.
  useEffect(() => {
    setCart([]);
  }, [locationId]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;
  useEffect(() => {
    setPriceLevel(selectedCustomer?.isWholesale ? "WHOLESALE" : "RETAIL");
  }, [selectedCustomer]);

  const cards = useMemo<CatalogCard[]>(() => {
    if (!products) return [];
    const result: CatalogCard[] = [];
    const groups = new Map<string, Extract<CatalogCard, { kind: "group" }>>();
    for (const p of products) {
      if (p.variantGroupId) {
        let group = groups.get(p.variantGroupId);
        if (!group) {
          group = { kind: "group", groupId: p.variantGroupId, name: p.variantGroupName ?? p.name, variants: [] };
          groups.set(p.variantGroupId, group);
          result.push(group);
        }
        group.variants.push(p);
      } else {
        result.push({ kind: "product", product: p });
      }
    }
    return result;
  }, [products]);

  function usedBase(productId: string, exceptKey?: string) {
    return cart.filter((l) => l.product.id === productId && l.key !== exceptKey).reduce((s, l) => s + baseQuantity(l), 0);
  }

  function loadSerialSuggestions(product: Product) {
    if (!product.requiresSerial || serialSuggestions[product.id]) return;
    productService
      .listSerials(product.id, "IN_STOCK")
      .then((list) => setSerialSuggestions((prev) => ({ ...prev, [product.id]: list.map((s) => s.serial) })))
      .catch(() => undefined);
  }

  function addToCart(product: Product, options: { packageId?: string | null; quantity?: number } = {}) {
    const packageId = options.packageId ?? null;
    const pkg = packageId ? product.packages.find((p) => p.id === packageId) : null;
    const step = options.quantity ?? 1;
    const key = packageId ? `${product.id}:${packageId}` : product.id;
    const need = step * (pkg?.factor ?? 1);
    if (usedBase(product.id) + need > available(product) + 1e-9) {
      showToast({
        variant: "error",
        title: t("pos.insufficientStockTitle"),
        message: t("pos.insufficientStockOnly", { name: product.name, qty: formatNumber(available(product)) }),
      });
      return;
    }
    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      if (existing) {
        return prev.map((line) => (line.key === key ? { ...line, quantity: Math.round((line.quantity + step) * 1000) / 1000 } : line));
      }
      return [...prev, { key, product, packageId, quantity: step, serials: [] }];
    });
    loadSerialSuggestions(product);
    // Quick visual confirmation that the tap registered — the cart line pops once.
    setBumpedKey(key);
    window.setTimeout(() => setBumpedKey((current) => (current === key ? null : current)), 320);
  }

  async function onCardClick(card: CatalogCard) {
    if (card.kind === "group") {
      setVariantGroup({ name: card.name, variants: card.variants });
      return;
    }
    const product = card.product;
    if (available(product) > 0) {
      addToCart(product);
      return;
    }
    // Out of stock here — offer interchangeable products instead.
    try {
      const analogs = await productService.getAnalogs(product.id, locationId);
      const inStock = analogs.filter((a) => available(a) > 0);
      if (inStock.length > 0) setAnalogsFor({ product, analogs: inStock });
      else showToast({ variant: "error", title: t("pos.insufficientStockTitle"), message: t("pos.noAnalogs", { name: product.name }) });
    } catch {
      /* ignore */
    }
  }

  function changeQuantity(key: string, delta: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.key !== key) return line;
          const next = Math.round((line.quantity + delta) * 1000) / 1000;
          const pkg = packageOf(line);
          if (usedBase(line.product.id, key) + next * (pkg?.factor ?? 1) > available(line.product) + 1e-9) {
            showToast({ variant: "error", title: t("pos.insufficientStockTitle"), message: t("pos.insufficientStockRemaining", { qty: formatNumber(available(line.product)) }) });
            return line;
          }
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0),
    );
  }

  function setLineQuantity(key: string, quantity: number) {
    setCart((prev) => prev.map((line) => (line.key === key ? { ...line, quantity } : line)).filter((line) => line.quantity > 0));
  }

  function setLinePackage(key: string, packageId: string | null) {
    setCart((prev) => {
      const line = prev.find((l) => l.key === key);
      if (!line) return prev;
      const newKey = packageId ? `${line.product.id}:${packageId}` : line.product.id;
      if (prev.some((l) => l.key === newKey)) return prev;
      return prev.map((l) => (l.key === key ? { ...l, key: newKey, packageId, quantity: 1 } : l));
    });
  }

  function setLineSerial(key: string, index: number, value: string) {
    setCart((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const serials = [...line.serials];
        serials[index] = value;
        return { ...line, serials };
      }),
    );
  }

  async function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcode.trim();
    if (!code) return;
    try {
      const { scan, ...product } = await productService.findByBarcode(code, locationId);
      addToCart(product, { packageId: scan?.packageId ?? null, quantity: scan?.quantity ?? undefined });
      setBarcode("");
    } catch {
      showToast({ variant: "error", title: t("pos.productNotFoundTitle"), message: t("pos.productNotFoundMessage", { barcode: code }) });
    }
  }

  const subtotal = useMemo(
    () => Math.round(cart.reduce((sum, line) => sum + linePrice(line, priceLevel) * line.quantity, 0) * 100) / 100,
    [cart, priceLevel],
  );
  const total = Math.max(0, subtotal - discount);
  const change = paymentMethod === "CASH" && cashGiven !== "" ? Number(cashGiven) - total : null;
  const needsPrescription = !!business?.checkPrescription && cart.some((l) => l.product.prescriptionRequired);
  const hasWholesale = cart.some((l) => l.product.wholesalePrice !== null) || selectedCustomer?.isWholesale;

  async function completeSale(prescriptionConfirmed = false) {
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
    if (needsPrescription && !prescriptionConfirmed) {
      setPrescriptionAsk(true);
      return;
    }
    setPrescriptionAsk(false);
    setCompleting(true);
    try {
      const sale = await saleService.createSale({
        items: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
          packageId: line.packageId,
          ...(line.product.requiresSerial ? { serialNumbers: line.serials.slice(0, line.quantity).map((s) => s.trim()) } : {}),
        })),
        discount,
        paymentMethod,
        customerId: customerId || undefined,
        locationId: locationId || undefined,
        priceLevel,
        prescriptionConfirmed: needsPrescription,
      });
      setLastSale(sale);
      setCart([]);
      setDiscount(0);
      setCustomerId("");
      setPaymentMethod("CASH");
      setCashGiven("");
      setSerialSuggestions({});
      loadProducts();
    } catch (error) {
      showToast({ variant: "error", title: t("pos.summary.saleFailedTitle"), message: extractErrorMessage(error) });
    } finally {
      setCompleting(false);
    }
  }

  const productFields = business?.productFields;

  return (
    <div className="pos-shell">
      <div className="card pos-catalog">
        <div className="pos-catalog-toolbar">
          {shiftOpen === false && (
            <div className="pos-banner">
              <AlertTriangle size={16} />
              <span className="spacer">{t("pos.shiftRequired")}</span>
              <Link to="/shifts" className="btn btn-primary btn-sm">
                {t("pos.openShift")}
              </Link>
            </div>
          )}
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <div className="input-with-icon" style={{ flex: 1, minWidth: 180 }}>
              <Search size={16} />
              <input className="input" placeholder={t("pos.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <form onSubmit={handleBarcodeSubmit} className="input-with-icon" style={{ width: 200 }}>
              <ScanBarcode size={16} />
              <input className="input" placeholder={t("pos.barcodePlaceholder")} value={barcode} onChange={(e) => setBarcode(e.target.value)} />
            </form>
            {canPickLocation && (
              <select className="select" style={{ width: 170 }} value={locationId} onChange={(e) => setLocationId(e.target.value)} title={t("receiving.location")}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
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
        ) : cards.length === 0 ? (
          <EmptyState icon={<Package size={26} />} title={t("pos.emptyProducts")} subtitle={t("pos.emptyProductsSubtitle")} />
        ) : (
          <div className="pos-product-grid">
            {cards.map((card) => {
              if (card.kind === "group") {
                const stock = card.variants.reduce((s, v) => s + available(v), 0);
                const prices = card.variants.map((v) => v.salePrice);
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                const sample = card.variants[0];
                return (
                  <button key={card.groupId} className={`pos-product-card ${stock <= 0 ? "is-out" : ""}`} onClick={() => onCardClick(card)}>
                    <div className="pos-product-thumb">{sample.imageUrl ? <img src={sample.imageUrl} alt={card.name} /> : <Layers size={22} />}</div>
                    {sample.categoryName && <span className="pos-product-category">{sample.categoryName}</span>}
                    <span className="pos-product-name">{card.name}</span>
                    <span className="pos-product-attrs">{t("pos.variantsCount", { count: card.variants.length })}</span>
                    <span className="pos-product-price">{min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`}</span>
                    <span className="pos-product-stock">{stock > 0 ? `${formatNumber(stock)} ${t("pos.left")}` : t("pos.out")}</span>
                  </button>
                );
              }
              const p = card.product;
              const stock = available(p);
              const chips = attributeChips(p, productFields);
              return (
                <button key={p.id} className={`pos-product-card ${stock <= 0 ? "is-out" : ""}`} onClick={() => onCardClick(card)}>
                  <div className="pos-product-thumb">{p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <Package size={22} />}</div>
                  {p.categoryName && <span className="pos-product-category">{p.categoryName}</span>}
                  <span className="pos-product-name">{p.name}</span>
                  {chips.length > 0 && <span className="pos-product-attrs">{chips.slice(0, 3).join(" · ")}</span>}
                  <span className="pos-product-price">
                    {formatMoney(priceLevel === "WHOLESALE" && p.wholesalePrice !== null ? p.wholesalePrice : p.salePrice)}
                    {p.unit !== "PIECE" && <span className="pos-product-unit"> / {unitLabel(p.unit)}</span>}
                  </span>
                  <span className="pos-product-stock">{stock > 0 ? `${formatNumber(stock)} ${t("pos.left")}` : t("pos.out")}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="card pos-cart">
        <div className="pos-cart-header row gap-2">
          <ShoppingCart size={18} className={bumpedKey ? "pop-once" : undefined} />
          <span className="card-title">{t("pos.cart.title")}</span>
          {cart.length > 0 && <span className="badge badge-info">{cart.length}</span>}
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
            cart.map((line) => {
              const pkg = packageOf(line);
              const price = linePrice(line, priceLevel);
              const decimals = !pkg && DECIMAL_UNITS.has(line.product.unit);
              const maxQty = (available(line.product) - usedBase(line.product.id, line.key)) / (pkg?.factor ?? 1);
              return (
                <div className="pos-cart-line" key={line.key}>
                  <div className="pos-cart-item">
                    <div className="pos-cart-item-info">
                      <div className="pos-cart-item-name">
                        {line.product.name}
                        {line.product.prescriptionRequired && business?.checkPrescription && <span className="pos-rx">Rx</span>}
                      </div>
                      <div className="pos-cart-item-price">
                        {formatNumber(line.quantity)} {pkg ? pkg.name : unitLabel(line.product.unit)} × {formatMoney(price)}
                      </div>
                      {line.product.packages.length > 0 && !line.product.requiresSerial && (
                        <select
                          className="pos-unit-select"
                          value={line.packageId ?? ""}
                          onChange={(e) => setLinePackage(line.key, e.target.value || null)}
                          aria-label={t("pos.cart.unit")}
                        >
                          <option value="">{unitLabel(line.product.unit)}</option>
                          {line.product.packages.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatNumber(p.factor)} {unitLabel(line.product.unit)})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="pos-qty-control">
                      <button onClick={() => changeQuantity(line.key, -1)} aria-label={t("pos.cart.decrease")}>
                        <Minus size={13} />
                      </button>
                      <CartQtyInput
                        quantity={line.quantity}
                        max={Math.max(0, Math.floor(maxQty * 1000) / 1000)}
                        decimals={decimals}
                        onCommit={(qty) => setLineQuantity(line.key, qty)}
                        onExceedsStock={(maxValue) =>
                          showToast({ variant: "error", title: t("pos.insufficientStockTitle"), message: t("pos.insufficientStockRemaining", { qty: formatNumber(maxValue) }) })
                        }
                      />
                      <button onClick={() => changeQuantity(line.key, 1)} aria-label={t("pos.cart.increase")}>
                        <Plus size={13} />
                      </button>
                    </div>
                    <span className="pos-cart-item-total mono-num">{formatMoney(price * line.quantity)}</span>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCart((prev) => prev.filter((l) => l.key !== line.key))} aria-label={t("pos.cart.removeAria")}>
                      <Trash2 size={15} color="var(--color-danger-text)" />
                    </button>
                  </div>
                  {line.product.requiresSerial && (
                    <SerialInputs
                      line={line}
                      suggestions={serialSuggestions[line.product.id] ?? []}
                      onChange={(index, value) => setLineSerial(line.key, index, value)}
                    />
                  )}
                  {line.product.warrantyMonths ? (
                    <div className="pos-cart-warranty">{t("pos.cart.warranty", { months: line.product.warrantyMonths })}</div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="pos-summary">
          <div className="row gap-2">
            <select className="select" style={{ flex: 1 }} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{paymentMethod === "DEBT" ? t("pos.summary.selectCustomer") : t("pos.summary.customerOptional")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `— ${c.phone}` : ""} {c.isWholesale ? `(${t("sales.wholesale")})` : ""}
                </option>
              ))}
            </select>
            {hasWholesale && (
              <div className="pos-price-level">
                {(["RETAIL", "WHOLESALE"] as const).map((level) => (
                  <button key={level} className={priceLevel === level ? "active" : ""} onClick={() => setPriceLevel(level)}>
                    {t(`pos.priceLevel.${level}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
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

          {paymentMethod === "CASH" && cart.length > 0 && (
            <div className="pos-summary-row" style={{ alignItems: "center" }}>
              <span>{t("pos.summary.cashGiven")}</span>
              <div className="row gap-2">
                {change !== null && change >= 0 && (
                  <span className="text-success" style={{ fontWeight: 600 }}>
                    {t("pos.summary.change", { amount: formatMoney(change) })}
                  </span>
                )}
                <input
                  type="number"
                  min={0}
                  className="input"
                  style={{ width: 120, height: 32, textAlign: "right" }}
                  value={cashGiven}
                  placeholder={String(Math.round(total))}
                  onChange={(e) => setCashGiven(e.target.value)}
                />
              </div>
            </div>
          )}

          {paymentMethod === "QR" && <QrPaymentPanel businessName={business?.name ?? ""} qrPaymentInfo={business?.qrPaymentInfo} amount={total} />}

          <button
            className="btn btn-primary btn-lg btn-block"
            disabled={cart.length === 0 || completing || shiftOpen === false}
            onClick={() => completeSale()}
          >
            {completing ? t("pos.summary.completing") : t("pos.summary.completeButton")}
          </button>
        </div>
      </div>

      <Modal open={!!variantGroup} onClose={() => setVariantGroup(null)}>
        {variantGroup && (
          <div className="stack gap-4">
            <h2 className="card-title">{variantGroup.name}</h2>
            <div className="pos-variant-grid">
              {variantGroup.variants.map((v) => (
                <button
                  key={v.id}
                  className="pos-variant-btn"
                  disabled={available(v) <= 0}
                  onClick={() => {
                    addToCart(v);
                    setVariantGroup(null);
                  }}
                >
                  <strong>{v.variantLabel ?? v.name}</strong>
                  <span className="mono-num">{formatMoney(v.salePrice)}</span>
                  <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                    {available(v) > 0 ? `${formatNumber(available(v))} ${t("pos.left")}` : t("pos.out")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!analogsFor} onClose={() => setAnalogsFor(null)}>
        {analogsFor && (
          <div className="stack gap-4">
            <div>
              <h2 className="card-title">{t("pos.analogsTitle")}</h2>
              <p className="card-subtitle">{t("pos.analogsSubtitle", { name: analogsFor.product.name })}</p>
            </div>
            <div className="stack gap-2">
              {analogsFor.analogs.map((a) => (
                <button
                  key={a.id}
                  className="pos-variant-btn"
                  style={{ flexDirection: "row", justifyContent: "space-between" }}
                  onClick={() => {
                    addToCart(a);
                    setAnalogsFor(null);
                  }}
                >
                  <strong style={{ textAlign: "left" }}>{a.name}</strong>
                  <span className="mono-num">
                    {formatMoney(a.salePrice)} · {formatNumber(available(a))} {t("pos.left")}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={prescriptionAsk}
        title={t("pos.prescriptionTitle")}
        description={t("pos.prescriptionDescription", {
          names: cart
            .filter((l) => l.product.prescriptionRequired)
            .map((l) => l.product.name)
            .join(", "),
        })}
        confirmLabel={t("pos.prescriptionConfirm")}
        loading={completing}
        onConfirm={() => completeSale(true)}
        onCancel={() => setPrescriptionAsk(false)}
      />

      <Modal open={!!lastSale} onClose={() => setLastSale(null)}>
        {lastSale && (
          <div className="stack gap-4" style={{ textAlign: "center", alignItems: "center" }}>
            <CheckCircle2 size={44} color="var(--color-success-text)" />
            <div>
              <h2 className="card-title">{t("pos.summary.saleSuccessTitle")}</h2>
              <p className="card-subtitle">{t("pos.saleNumber", { number: lastSale.number ?? "—" })}</p>
            </div>
            <div className="mono-num" style={{ fontSize: "var(--font-size-3xl)", fontWeight: 800 }}>
              {formatMoney(lastSale.total)}
            </div>
            <div className="row gap-3">
              <button className="btn btn-secondary" onClick={() => business && printSaleReceipt(lastSale, business)}>
                <Printer size={16} /> {t("pos.printReceipt")}
              </button>
              <button className="btn btn-primary" autoFocus onClick={() => setLastSale(null)}>
                {t("pos.nextSale")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
