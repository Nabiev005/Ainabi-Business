import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ClipboardCheck, ClipboardList } from "lucide-react";
import { ProductSearchBox } from "../../components/ProductSearchBox";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Modal } from "../../components/ui/Modal";
import { useToast } from "../../hooks/useToast";
import { useLocations } from "../../hooks/useLocations";
import * as productService from "../../services/product.service";
import * as categoryService from "../../services/category.service";
import * as stockService from "../../services/stock.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import type { Category, InventoryCountDetail, InventoryCountListItem, Product } from "../../types";

const DRAFT_KEY = "ainabi:inventory-draft:";

function loadDraft(locationId: string): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY + locationId) ?? "{}");
  } catch {
    return {};
  }
}

function saveDraft(locationId: string, counted: Record<string, string>) {
  try {
    if (Object.keys(counted).length === 0) localStorage.removeItem(DRAFT_KEY + locationId);
    else localStorage.setItem(DRAFT_KEY + locationId, JSON.stringify(counted));
  } catch {
    /* storage unavailable — the count just isn't kept across reloads */
  }
}

async function loadAllProducts(locationId: string, categoryId?: string) {
  const all: Product[] = [];
  for (let page = 1; page <= 25; page++) {
    const res = await productService.listProducts({ status: "ACTIVE", pageSize: 200, page, locationId, categoryId });
    all.push(...res.items);
    if (page >= res.totalPages) break;
  }
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export default function Inventory() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { locations, current, multiple } = useLocations();

  const [tab, setTab] = useState<"NEW" | "HISTORY">("NEW");
  const [locationId, setLocationId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [onlyCounted, setOnlyCounted] = useState(false);
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState<InventoryCountListItem[] | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPages, setHistoryPages] = useState(1);
  const [detail, setDetail] = useState<InventoryCountDetail | null>(null);

  useEffect(() => {
    if (!locationId && current) setLocationId(current.id);
  }, [current, locationId]);

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!locationId) return;
    setCounted(loadDraft(locationId));
    setProducts(null);
    loadAllProducts(locationId, categoryId || undefined)
      .then(setProducts)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [locationId, categoryId, showToast, t]);

  useEffect(() => {
    if (locationId) saveDraft(locationId, counted);
  }, [locationId, counted]);

  const loadHistory = useCallback(() => {
    setHistory(null);
    stockService
      .listInventoryCounts({ page: historyPage, pageSize: 15 })
      .then((res) => {
        setHistory(res.items);
        setHistoryTotal(res.total);
        setHistoryPages(res.totalPages);
      })
      .catch(() => setHistory([]));
  }, [historyPage]);

  useEffect(() => {
    if (tab === "HISTORY") loadHistory();
  }, [tab, loadHistory]);

  function bump(product: Product) {
    // A scanned product outside the current filter still gets counted.
    setProducts((prev) => (prev && !prev.some((p) => p.id === product.id) ? [product, ...prev] : prev));
    setCounted((prev) => ({ ...prev, [product.id]: String((Number(prev[product.id]) || 0) + 1) }));
  }

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products ?? []).filter(
      (p) => (!onlyCounted || counted[p.id] !== undefined) && (!q || p.name.toLowerCase().includes(q) || p.barcode?.includes(q)),
    );
  }, [products, counted, onlyCounted, search]);

  const stats = useMemo(() => {
    let items = 0;
    let shortage = 0;
    let surplus = 0;
    for (const p of products ?? []) {
      const value = counted[p.id];
      if (value === undefined || value === "") continue;
      items++;
      const diff = Number(value) - (p.locationQuantity ?? 0);
      if (diff < 0) shortage += -diff * p.purchasePrice;
      else surplus += diff * p.purchasePrice;
    }
    return { items, shortage, surplus };
  }, [products, counted]);

  async function complete() {
    const items = Object.entries(counted)
      .filter(([, v]) => v !== "" && !Number.isNaN(Number(v)))
      .map(([productId, v]) => ({ productId, countedQty: Number(v) }));
    if (items.length === 0) return;
    setSaving(true);
    try {
      const result = await stockService.createInventoryCount({ locationId, comment: comment || null, items });
      showToast({ variant: "success", title: t("inventory.done", { number: result.number }) });
      setCounted({});
      saveDraft(locationId, {});
      setComment("");
      setConfirmOpen(false);
      setDetail(result);
      setProducts(await loadAllProducts(locationId, categoryId || undefined));
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("inventory.title")}</h1>
          <p className="page-subtitle">{t("inventory.subtitle")}</p>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === "NEW" ? "active" : ""}`} onClick={() => setTab("NEW")}>
            {t("inventory.tabs.new")}
          </button>
          <button className={`tab ${tab === "HISTORY" ? "active" : ""}`} onClick={() => setTab("HISTORY")}>
            {t("inventory.tabs.history")}
          </button>
        </div>
      </div>

      {tab === "NEW" && (
        <>
          <div className="card card-pad stack gap-4">
            <div className="form-grid">
              {multiple && (
                <div className="field">
                  <label className="field-label">{t("receiving.location")}</label>
                  <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="field">
                <label className="field-label">{t("products.drawer.category")}</label>
                <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">{t("products.allCategories")}</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field-label">{t("inventory.scan")}</label>
              <ProductSearchBox autoFocus locationId={locationId} onPick={(p) => bump(p)} />
              <span className="field-hint">{t("inventory.scanHint")}</span>
            </div>
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-tile-label">{t("inventory.countedItems")}</div>
                <div className="stat-tile-value">{stats.items}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("inventory.shortage")}</div>
                <div className="stat-tile-value text-danger">{formatMoney(stats.shortage)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("inventory.surplus")}</div>
                <div className="stat-tile-value text-success">{formatMoney(stats.surplus)}</div>
              </div>
            </div>
            {stats.items > 0 && (
              <input className="input" placeholder={t("receiving.commentPlaceholder")} value={comment} onChange={(e) => setComment(e.target.value)} />
            )}
          </div>

          <div className="card">
            <div className="filter-bar row gap-3" style={{ padding: "var(--space-4)", flexWrap: "wrap" }}>
              <input className="input" style={{ maxWidth: 260 }} placeholder={t("inventory.filterPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
              <label className="row gap-2" style={{ fontSize: "var(--font-size-sm)" }}>
                <input type="checkbox" checked={onlyCounted} onChange={(e) => setOnlyCounted(e.target.checked)} />
                {t("inventory.onlyCounted")}
              </label>
              <span className="spacer" />
              <button className="btn btn-primary" disabled={stats.items === 0} onClick={() => setConfirmOpen(true)}>
                <ClipboardCheck size={16} /> {t("inventory.complete")}
              </button>
            </div>
            {products === null ? (
              <div className="card-pad">
                <SkeletonRows rows={8} height={44} />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState icon={<ClipboardList size={26} />} title={t("inventory.empty")} />
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("stock.table.product")}</th>
                      <th className="table-cell-num">{t("inventory.expected")}</th>
                      <th className="table-cell-num">{t("inventory.counted")}</th>
                      <th className="table-cell-num">{t("inventory.difference")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => {
                      const value = counted[p.id];
                      const expected = p.locationQuantity ?? 0;
                      const diff = value === undefined || value === "" ? null : Math.round((Number(value) - expected) * 1000) / 1000;
                      return (
                        <tr key={p.id}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{p.name}</div>
                            <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                              {p.barcode}
                            </div>
                          </td>
                          <td className="table-cell-num">
                            {formatNumber(expected)} {unitLabel(p.unit)}
                          </td>
                          <td className="table-cell-num">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              className="input doc-input"
                              style={{ width: 100, textAlign: "right" }}
                              value={value ?? ""}
                              placeholder="—"
                              onChange={(e) =>
                                setCounted((prev) => {
                                  const next = { ...prev };
                                  if (e.target.value === "") delete next[p.id];
                                  else next[p.id] = e.target.value;
                                  return next;
                                })
                              }
                            />
                          </td>
                          <td className={`table-cell-num mono-num ${diff !== null && diff < 0 ? "text-danger" : diff !== null && diff > 0 ? "text-success" : ""}`}>
                            {diff === null ? "—" : `${diff > 0 ? "+" : ""}${formatNumber(diff)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "HISTORY" && (
        <div className="card">
          {history === null ? (
            <div className="card-pad">
              <SkeletonRows rows={6} height={48} />
            </div>
          ) : history.length === 0 ? (
            <EmptyState icon={<ClipboardList size={26} />} title={t("inventory.historyEmpty")} />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>№</th>
                      {multiple && <th>{t("receiving.location")}</th>}
                      <th className="table-cell-num">{t("inventory.countedItems")}</th>
                      <th className="table-cell-num">{t("inventory.shortage")}</th>
                      <th className="table-cell-num">{t("inventory.surplus")}</th>
                      <th>{t("stock.table.employee")}</th>
                      <th>{t("stock.table.date")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c) => (
                      <tr key={c.id} className="table-row-clickable" onClick={() => stockService.getInventoryCount(c.id).then(setDetail).catch(() => undefined)}>
                        <td className="mono-num">{c.number}</td>
                        {multiple && <td>{c.locationName}</td>}
                        <td className="table-cell-num">{c.itemsCount}</td>
                        <td className="table-cell-num text-danger">{formatMoney(c.shortageValue)}</td>
                        <td className="table-cell-num text-success">{formatMoney(c.surplusValue)}</td>
                        <td className="text-muted">{c.employeeName}</td>
                        <td className="text-muted">{formatDateTime(c.createdAt)}</td>
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

      <ConfirmDialog
        open={confirmOpen}
        title={t("inventory.confirmTitle")}
        description={t("inventory.confirmDescription", { count: stats.items, shortage: formatMoney(stats.shortage), surplus: formatMoney(stats.surplus) })}
        confirmLabel={t("inventory.complete")}
        loading={saving}
        onConfirm={complete}
        onCancel={() => setConfirmOpen(false)}
      />

      <Modal open={!!detail} onClose={() => setDetail(null)} size="wide">
        {detail && (
          <div className="stack gap-4">
            <div>
              <h2 className="card-title">{t("inventory.detailTitle", { number: detail.number })}</h2>
              <p className="card-subtitle">
                {formatDateTime(detail.createdAt)} · {detail.employeeName}
                {detail.locationName ? ` · ${detail.locationName}` : ""}
              </p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("stock.table.product")}</th>
                    <th className="table-cell-num">{t("inventory.expected")}</th>
                    <th className="table-cell-num">{t("inventory.counted")}</th>
                    <th className="table-cell-num">{t("inventory.difference")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.items.map((i) => (
                    <tr key={i.productId}>
                      <td style={{ fontWeight: 600 }}>{i.productName}</td>
                      <td className="table-cell-num">{formatNumber(i.expectedQty)}</td>
                      <td className="table-cell-num">{formatNumber(i.countedQty)}</td>
                      <td className={`table-cell-num ${i.difference < 0 ? "text-danger" : i.difference > 0 ? "text-success" : ""}`}>
                        {i.difference > 0 ? "+" : ""}
                        {formatNumber(i.difference)} {unitLabel(i.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row gap-4">
              <span className="text-danger">
                {t("inventory.shortage")}: {formatMoney(detail.shortageValue)}
              </span>
              <span className="text-success">
                {t("inventory.surplus")}: {formatMoney(detail.surplusValue)}
              </span>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
}
