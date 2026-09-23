import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, FileText, PackagePlus, Printer, Repeat, Trash2, Truck } from "lucide-react";
import { ProductSearchBox } from "../../components/ProductSearchBox";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { ProductDrawer, ProductFormValues } from "../Products/ProductDrawer";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useLocations } from "../../hooks/useLocations";
import { useLabels } from "../../hooks/useLabels";
import * as stockService from "../../services/stock.service";
import * as supplierService from "../../services/supplier.service";
import * as customerService from "../../services/customer.service";
import * as categoryService from "../../services/category.service";
import * as productService from "../../services/product.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import type { Category, Customer, Product, PurchaseReceiptDetail, PurchaseReceiptListItem, Supplier } from "../../types";
import "./Receiving.css";

interface Line {
  product: Product;
  quantity: string;
  purchasePrice: string;
  salePrice: string;
  batchNumber: string;
  expiryDate: string;
  /** One IMEI / serial per line of the textarea. */
  serialsText: string;
}

function parseSerials(text: string) {
  return text
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function Receiving() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showToast } = useToast();
  const labels = useLabels();
  const { locations, multiple } = useLocations();
  const trackExpiry = !!session?.business.trackExpiry;

  const [tab, setTab] = useState<"NEW" | "HISTORY">("NEW");
  const [type, setType] = useState<"PURCHASE" | "TRADE_IN">("PURCHASE");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [locationId, setLocationId] = useState("");
  const [docNumber, setDocNumber] = useState("");
  const [comment, setComment] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "QR">("CASH");
  const [createDebt, setCreateDebt] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PurchaseReceiptDetail | null>(null);

  const [newProductBarcode, setNewProductBarcode] = useState<string | null>(null);
  const [creatingProduct, setCreatingProduct] = useState(false);

  const [history, setHistory] = useState<PurchaseReceiptListItem[] | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(1);
  const [detail, setDetail] = useState<PurchaseReceiptDetail | null>(null);

  useEffect(() => {
    supplierService.listSuppliers().then(setSuppliers).catch(() => undefined);
    customerService.listCustomers().then(setCustomers).catch(() => undefined);
    categoryService.listCategories().then(setCategories).catch(() => undefined);
  }, []);

  const loadHistory = useCallback(() => {
    setHistory(null);
    stockService
      .listReceipts({ page: historyPage, pageSize: 15 })
      .then((res) => {
        setHistory(res.items);
        setHistoryTotal(res.total);
        setHistoryPages(res.totalPages);
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [historyPage, showToast, t]);

  useEffect(() => {
    if (tab === "HISTORY") loadHistory();
  }, [tab, loadHistory]);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.purchasePrice) || 0), 0),
    [lines],
  );
  const paid = paidAmount === "" ? total : Math.min(Number(paidAmount) || 0, total);
  const unpaid = Math.max(0, total - paid);

  function addProduct(product: Product) {
    setLines((prev) => {
      const index = prev.findIndex((l) => l.product.id === product.id);
      if (index >= 0) {
        // Scanning the same item again counts one more unit.
        return prev.map((l, i) => (i === index ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      }
      return [
        ...prev,
        {
          product,
          quantity: "1",
          purchasePrice: String(product.purchasePrice),
          salePrice: "",
          batchNumber: "",
          expiryDate: "",
          serialsText: "",
        },
      ];
    });
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function reset() {
    setLines([]);
    setDocNumber("");
    setComment("");
    setPaidAmount("");
    setSellerName("");
    setCustomerId("");
    setSaved(null);
  }

  async function handleCreateProduct(values: ProductFormValues) {
    setCreatingProduct(true);
    try {
      const product = await productService.createProduct({ ...values, categoryId: values.categoryId || null, quantity: 0 });
      showToast({ variant: "success", title: t("products.created") });
      setNewProductBarcode(null);
      addProduct(product);
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setCreatingProduct(false);
    }
  }

  async function submit() {
    if (lines.length === 0) return;
    for (const line of lines) {
      const serials = parseSerials(line.serialsText);
      if (line.product.requiresSerial && serials.length > 0 && serials.length !== Number(line.quantity)) {
        showToast({ variant: "error", title: t("receiving.serialCountMismatch", { name: line.product.name, qty: line.quantity }) });
        return;
      }
    }
    if (type === "TRADE_IN" && !customerId && !sellerName.trim()) {
      showToast({ variant: "error", title: t("receiving.sellerRequired") });
      return;
    }
    setSaving(true);
    try {
      const receipt = await stockService.createReceipt({
        type,
        supplierId: type === "PURCHASE" ? supplierId || null : null,
        customerId: type === "TRADE_IN" ? customerId || null : null,
        sellerName: type === "TRADE_IN" ? sellerName || null : null,
        locationId: locationId || null,
        docNumber: docNumber || null,
        comment: comment || null,
        items: lines.map((l) => ({
          productId: l.product.id,
          quantity: Number(l.quantity),
          purchasePrice: Number(l.purchasePrice) || 0,
          salePrice: l.salePrice ? Number(l.salePrice) : null,
          batchNumber: l.batchNumber || null,
          expiryDate: l.expiryDate || null,
          serialNumbers: l.product.requiresSerial ? parseSerials(l.serialsText) : undefined,
        })),
        paidAmount: paid,
        paymentMethod,
        createSupplierDebt: createDebt,
      });
      setSaved(receipt);
      showToast({ variant: "success", title: t("receiving.saved", { number: receipt.number }) });
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    try {
      setDetail(await stockService.getReceipt(id));
    } catch (error) {
      showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) });
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("receiving.title")}</h1>
          <p className="page-subtitle">{t("receiving.subtitle")}</p>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === "NEW" ? "active" : ""}`} onClick={() => setTab("NEW")}>
            {t("receiving.tabs.new")}
          </button>
          <button className={`tab ${tab === "HISTORY" ? "active" : ""}`} onClick={() => setTab("HISTORY")}>
            {t("receiving.tabs.history")}
          </button>
        </div>
      </div>

      {tab === "NEW" && saved && (
        <div className="card card-pad stack gap-4 receiving-done">
          <div className="row gap-3">
            <CheckCircle2 size={28} color="var(--color-success-text)" />
            <div>
              <h2 className="card-title">{t("receiving.savedTitle", { number: saved.number })}</h2>
              <p className="text-muted" style={{ margin: 0 }}>
                {t("receiving.savedSummary", { count: saved.items.length, total: formatMoney(saved.total) })}
                {saved.supplierDebtId ? ` · ${t("receiving.debtCreated", { amount: formatMoney(saved.total - saved.paidAmount) })}` : ""}
              </p>
            </div>
          </div>
          <div className="row gap-3">
            <button className="btn btn-secondary" onClick={() => navigate(`/labels?receipt=${saved.id}`)}>
              <Printer size={16} /> {t("receiving.printLabels")}
            </button>
            <button className="btn btn-primary" onClick={reset}>
              <PackagePlus size={16} /> {t("receiving.newReceipt")}
            </button>
          </div>
        </div>
      )}

      {tab === "NEW" && !saved && (
        <>
          <div className="card card-pad stack gap-4">
            <div className="row gap-2" style={{ flexWrap: "wrap" }}>
              <button className={`btn ${type === "PURCHASE" ? "btn-primary" : "btn-secondary"} btn-sm`} onClick={() => setType("PURCHASE")}>
                <Truck size={15} /> {t("receiving.type.PURCHASE")}
              </button>
              <button className={`btn ${type === "TRADE_IN" ? "btn-primary" : "btn-secondary"} btn-sm`} onClick={() => setType("TRADE_IN")}>
                <Repeat size={15} /> {t("receiving.type.TRADE_IN")}
              </button>
              <span className="field-hint" style={{ marginLeft: "var(--space-2)" }}>
                {t(`receiving.typeHint.${type}`)}
              </span>
            </div>

            <div className="form-grid">
              {type === "PURCHASE" ? (
                <>
                  <div className="field">
                    <label className="field-label">{t("receiving.supplier")}</label>
                    <select className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      <option value="">{t("receiving.noSupplier")}</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label className="field-label">{t("receiving.docNumber")}</label>
                    <input className="input" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} placeholder="№ 125" />
                  </div>
                </>
              ) : (
                <>
                  <div className="field">
                    <label className="field-label">{t("receiving.customer")}</label>
                    <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">{t("receiving.notSaved")}</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `— ${c.phone}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!customerId && (
                    <div className="field">
                      <label className="field-label">{t("receiving.sellerName")}</label>
                      <input className="input" value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
                    </div>
                  )}
                </>
              )}
              {multiple && (
                <div className="field">
                  <label className="field-label">{t("receiving.location")}</label>
                  <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    <option value="">{t("stock.modal.myLocation")}</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="field">
              <label className="field-label">{t("receiving.addProducts")}</label>
              <ProductSearchBox autoFocus onPick={(p) => addProduct(p)} onNotFound={(code) => setNewProductBarcode(code)} />
              <span className="field-hint">{t("receiving.scanHint")}</span>
            </div>
          </div>

          <div className="card">
            {lines.length === 0 ? (
              <EmptyState icon={<PackagePlus size={26} />} title={t("receiving.empty")} subtitle={t("receiving.emptySubtitle")} />
            ) : (
              <div className="table-wrap">
                <table className="table receiving-table">
                  <thead>
                    <tr>
                      <th>{t("stock.table.product")}</th>
                      <th className="table-cell-num">{t("stock.table.quantity")}</th>
                      <th className="table-cell-num">{t("receiving.purchasePrice")}</th>
                      <th className="table-cell-num">{t("receiving.newSalePrice")}</th>
                      {trackExpiry && <th>{t("receiving.batchExpiry")}</th>}
                      <th className="table-cell-num">{t("receiving.lineTotal")}</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, index) => {
                      const serialCount = parseSerials(line.serialsText).length;
                      return (
                        <tr key={line.product.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{line.product.name}</div>
                            <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                              {line.product.barcode} · {t("receiving.inStock", { qty: formatNumber(line.product.quantity), unit: unitLabel(line.product.unit) })}
                            </div>
                            {line.product.requiresSerial && (
                              <div style={{ marginTop: 6 }}>
                                <textarea
                                  className="textarea receiving-serials"
                                  rows={Math.min(4, Math.max(2, Number(line.quantity) || 1))}
                                  placeholder={t("receiving.serialsPlaceholder")}
                                  value={line.serialsText}
                                  onChange={(e) => updateLine(index, { serialsText: e.target.value })}
                                />
                                <span className={`field-hint ${serialCount > 0 && serialCount !== Number(line.quantity) ? "text-danger" : ""}`}>
                                  {t("receiving.serialsCount", { count: serialCount, qty: line.quantity })}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="table-cell-num">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="input doc-input"
                              style={{ width: 90, textAlign: "right" }}
                              value={line.quantity}
                              onChange={(e) => updateLine(index, { quantity: e.target.value })}
                            />
                          </td>
                          <td className="table-cell-num">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="input doc-input"
                              style={{ width: 110, textAlign: "right" }}
                              value={line.purchasePrice}
                              onChange={(e) => updateLine(index, { purchasePrice: e.target.value })}
                            />
                          </td>
                          <td className="table-cell-num">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              className="input doc-input"
                              style={{ width: 110, textAlign: "right" }}
                              placeholder={String(line.product.salePrice)}
                              value={line.salePrice}
                              onChange={(e) => updateLine(index, { salePrice: e.target.value })}
                            />
                          </td>
                          {trackExpiry && (
                            <td>
                              <div className="stack gap-1">
                                <input
                                  className="input doc-input"
                                  placeholder={t("receiving.batchNumber")}
                                  value={line.batchNumber}
                                  onChange={(e) => updateLine(index, { batchNumber: e.target.value })}
                                />
                                <input type="date" className="input doc-input" value={line.expiryDate} onChange={(e) => updateLine(index, { expiryDate: e.target.value })} />
                              </div>
                            </td>
                          )}
                          <td className="table-cell-num mono-num" style={{ fontWeight: 600 }}>
                            {formatMoney((Number(line.quantity) || 0) * (Number(line.purchasePrice) || 0))}
                          </td>
                          <td className="table-cell-num">
                            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}>
                              <Trash2 size={15} color="var(--color-danger-text)" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="doc-total-row">
                      <td colSpan={trackExpiry ? 5 : 4}>{t("receiving.total")}</td>
                      <td className="table-cell-num mono-num">{formatMoney(total)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {lines.length > 0 && (
            <div className="card card-pad stack gap-4">
              <div className="form-grid">
                <div className="field">
                  <label className="field-label">{t("receiving.paidNow")}</label>
                  <input type="number" min={0} step="0.01" className="input" placeholder={String(total)} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
                  {unpaid > 0 && (
                    <span className="field-hint">
                      {type === "PURCHASE" && supplierId ? t("receiving.unpaidToDebt", { amount: formatMoney(unpaid) }) : t("receiving.unpaid", { amount: formatMoney(unpaid) })}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label className="field-label">{t("receiving.paymentMethod")}</label>
                  <select className="select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as "CASH" | "CARD" | "QR")}>
                    {(["CASH", "CARD", "QR"] as const).map((m) => (
                      <option key={m} value={m}>
                        {labels.paymentMethod[m]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {type === "PURCHASE" && supplierId && unpaid > 0 && (
                <label className="row gap-2" style={{ fontSize: "var(--font-size-sm)" }}>
                  <input type="checkbox" checked={createDebt} onChange={(e) => setCreateDebt(e.target.checked)} />
                  {t("receiving.createDebt")}
                </label>
              )}
              <input className="input" placeholder={t("receiving.commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />
              <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-secondary" onClick={() => setLines([])} disabled={saving}>
                  {t("pos.cart.clear")}
                </button>
                <button className="btn btn-primary btn-lg" onClick={submit} disabled={saving}>
                  <CheckCircle2 size={18} />
                  {saving ? t("common.saving") : t("receiving.submit", { total: formatMoney(total) })}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "HISTORY" && (
        <div className="card">
          {history === null ? (
            <div className="card-pad">
              <SkeletonRows rows={6} height={48} />
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon={<FileText size={26} />} title={t("receiving.historyEmpty")} />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>№</th>
                      <th>{t("receiving.type.label")}</th>
                      <th>{t("receiving.from")}</th>
                      <th className="table-cell-num">{t("receiving.items")}</th>
                      <th className="table-cell-num">{t("receiving.total")}</th>
                      <th className="table-cell-num">{t("receiving.paid")}</th>
                      <th>{t("stock.table.employee")}</th>
                      <th>{t("stock.table.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={r.id} className="table-row-clickable" onClick={() => openDetail(r.id)}>
                        <td className="mono-num">{r.number}</td>
                        <td>
                          <Badge variant={r.type === "TRADE_IN" ? "info" : "neutral"}>{t(`receiving.type.${r.type}`)}</Badge>
                        </td>
                        <td>
                          {r.supplierName ?? r.sellerName ?? "—"}
                          {r.docNumber && <span className="text-muted"> · {r.docNumber}</span>}
                        </td>
                        <td className="table-cell-num">{r.itemCount}</td>
                        <td className="table-cell-num">{formatMoney(r.total)}</td>
                        <td className="table-cell-num">{formatMoney(r.paidAmount)}</td>
                        <td className="text-muted">{r.employeeName}</td>
                        <td className="text-muted">{formatDateTime(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={historyPage} totalPages={historyPages} total={historyTotal} pageSize={15} onPageChange={setHistoryPage} />
            </>
          )}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} size="wide">
        {detail && (
          <div className="stack gap-4">
            <div className="row gap-3">
              <div style={{ flex: 1 }}>
                <h2 className="card-title">{t("receiving.detailTitle", { number: detail.number })}</h2>
                <p className="card-subtitle">
                  {formatDateTime(detail.createdAt)} · {detail.supplier?.name ?? detail.customer?.name ?? detail.sellerName ?? "—"}
                  {detail.locationName ? ` · ${detail.locationName}` : ""}
                </p>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/labels?receipt=${detail.id}`)}>
                <Printer size={15} /> {t("receiving.printLabels")}
              </button>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("stock.table.product")}</th>
                    <th className="table-cell-num">{t("stock.table.quantity")}</th>
                    <th className="table-cell-num">{t("receiving.purchasePrice")}</th>
                    <th className="table-cell-num">{t("receiving.lineTotal")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{i.productName}</div>
                        {(i.batchNumber || i.expiryDate) && (
                          <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                            {[i.batchNumber, i.expiryDate ? formatDate(i.expiryDate) : null].filter(Boolean).join(" · ")}
                          </div>
                        )}
                        {i.serialNumbers.length > 0 && (
                          <div className="text-muted mono-num" style={{ fontSize: "var(--font-size-xs)" }}>
                            {i.serialNumbers.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="table-cell-num">
                        {formatNumber(i.quantity)} {unitLabel(i.unit)}
                      </td>
                      <td className="table-cell-num">{formatMoney(i.purchasePrice)}</td>
                      <td className="table-cell-num">{formatMoney(i.total)}</td>
                    </tr>
                  ))}
                  <tr className="doc-total-row">
                    <td colSpan={3}>{t("receiving.total")}</td>
                    <td className="table-cell-num">{formatMoney(detail.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {detail.comment && <p className="text-muted">{detail.comment}</p>}
          </div>
        )}
      </Modal>

      <ProductDrawer
        open={newProductBarcode !== null}
        onClose={() => setNewProductBarcode(null)}
        onSubmit={handleCreateProduct}
        categories={categories}
        submitting={creatingProduct}
        initialBarcode={newProductBarcode ?? undefined}
        hideInitialStock
      />
    </div>
  );
}
