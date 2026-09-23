import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Barcode, FileSpreadsheet, Layers, Package, Plus, Search, SquarePen, Tag, Trash2 } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ProductDrawer, ProductFormValues } from "./ProductDrawer";
import { ImportModal } from "./ImportModal";
import { VariantGroupDrawer } from "./VariantGroupDrawer";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as productService from "../../services/product.service";
import * as categoryService from "../../services/category.service";
import { extractErrorMessage } from "../../services/api";
import { formatMoney, formatNumber, unitLabel } from "../../utils/format";
import type { Category, Product } from "../../types";
import { useAuth } from "../../hooks/useAuth";
import { attributeChips } from "../../utils/attributes";
import "./Products.css";

export default function Products() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { session } = useAuth();
  const navigate = useNavigate();
  const productFields = session?.business.productFields;
  const canManage = session?.role !== "CASHIER";
  const [importOpen, setImportOpen] = useState(false);
  const [variantsOpen, setVariantsOpen] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const debouncedSearch = useDebouncedValue(search);
  const [categoryId, setCategoryId] = useState("");
  const [stockFilter, setStockFilter] = useState<"" | "low" | "out">(() => {
    const fromUrl = searchParams.get("stock");
    return fromUrl === "low" || fromUrl === "out" ? fromUrl : "";
  });
  const [statusFilter, setStatusFilter] = useState<"" | "ACTIVE" | "ARCHIVED">("ACTIVE");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadProducts = useCallback(async () => {
    setProducts(null);
    try {
      const result = await productService.listProducts({
        search: debouncedSearch || undefined,
        categoryId: categoryId || undefined,
        status: statusFilter || undefined,
        stock: stockFilter || undefined,
        page,
        pageSize: 10,
      });
      setProducts(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (error) {
      showToast({ variant: "error", title: t("products.loadFailed"), message: extractErrorMessage(error) });
      setProducts([]);
    }
  }, [debouncedSearch, categoryId, statusFilter, stockFilter, page, showToast, t]);

  // Picks up ?q= even when navigating here while already on this page
  // (e.g. a second global-search hit) since React Router won't remount it.
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, categoryId, statusFilter, stockFilter]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    categoryService.listCategories().then(setCategories).catch(() => undefined);
  }, []);

  async function handleSubmit(values: ProductFormValues) {
    setSubmitting(true);
    try {
      if (editing) {
        await productService.updateProduct(editing.id, { ...values, categoryId: values.categoryId || null });
        showToast({ variant: "success", title: t("products.saved") });
      } else {
        await productService.createProduct({ ...values, categoryId: values.categoryId || null });
        showToast({ variant: "success", title: t("products.created") });
      }
      setDrawerOpen(false);
      setEditing(null);
      loadProducts();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await productService.deleteProduct(deleteTarget.id);
      showToast({ variant: "success", title: t("products.deleted") });
      setDeleteTarget(null);
      loadProducts();
    } catch (error) {
      showToast({ variant: "error", title: t("common.deleteFailed"), message: extractErrorMessage(error) });
    } finally {
      setDeleting(false);
    }
  }

  const hasFilters = !!debouncedSearch || !!categoryId || !!stockFilter || statusFilter !== "ACTIVE";

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("products.title")}</h1>
          <p className="page-subtitle">{t("products.subtitle")}</p>
        </div>
        <div className="row gap-2" style={{ flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => navigate("/labels")}>
            <Tag size={18} />
            {t("products.labels")}
          </button>
          {canManage && (
            <>
              <button className="btn btn-secondary" onClick={() => setImportOpen(true)}>
                <FileSpreadsheet size={18} />
                {t("products.importButton")}
              </button>
              <button className="btn btn-secondary" onClick={() => setVariantsOpen(true)}>
                <Layers size={18} />
                {t("products.addVariants")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEditing(null);
                  setDrawerOpen(true);
                }}
              >
                <Plus size={18} />
                {t("products.add")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="input-with-icon">
            <Search size={16} />
            <input className="input" placeholder={t("products.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">{t("products.allCategories")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "" | "ACTIVE" | "ARCHIVED")}>
            <option value="ACTIVE">{t("products.activeOnly")}</option>
            <option value="ARCHIVED">{t("products.archivedOnly")}</option>
            <option value="">{t("products.allStatus")}</option>
          </select>
          <select className="select" value={stockFilter} onChange={(e) => setStockFilter(e.target.value as "" | "low" | "out")}>
            <option value="">{t("products.allStock")}</option>
            <option value="low">{t("products.lowStock")}</option>
            <option value="out">{t("products.outOfStock")}</option>
          </select>
        </div>

        {products === null ? (
          <div className="card-pad">
            <SkeletonRows rows={6} height={52} />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package size={26} />}
            title={hasFilters ? t("products.emptyFiltered") : t("products.emptyNone")}
            subtitle={hasFilters ? t("products.emptyFilteredSubtitle") : t("products.emptyNoneSubtitle")}
            action={
              !hasFilters && (
                <button
                  className="btn btn-primary"
                  style={{ marginTop: "var(--space-2)" }}
                  onClick={() => {
                    setEditing(null);
                    setDrawerOpen(true);
                  }}
                >
                  <Plus size={16} /> {t("products.add")}
                </button>
              )
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("products.table.product")}</th>
                    <th>{t("products.table.barcode")}</th>
                    <th>{t("products.table.category")}</th>
                    <th className="table-cell-num">{t("products.table.purchasePrice")}</th>
                    <th className="table-cell-num">{t("products.table.salePrice")}</th>
                    <th className="table-cell-num">{t("products.table.profit")}</th>
                    <th className="table-cell-num">{t("products.table.stock")}</th>
                    <th>{t("products.table.status")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="product-cell">
                          <div className="product-thumb">
                            {p.imageUrl ? <img src={p.imageUrl} alt={p.name} /> : <Package size={18} />}
                          </div>
                          <div className="product-name-cell">
                            <div className="product-name">{p.name}</div>
                            {p.sku && <div className="product-sku">{p.sku}</div>}
                            {attributeChips(p, productFields).length > 0 && (
                              <div className="product-attr-chips">
                                {attributeChips(p, productFields).map((chip) => (
                                  <span key={chip} className="product-attr-chip">
                                    {chip}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-muted">
                        {p.barcode ? (
                          <span className="row gap-1">
                            <Barcode size={14} /> {p.barcode}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{p.categoryName ?? "—"}</td>
                      <td className="table-cell-num">{formatMoney(p.purchasePrice)}</td>
                      <td className="table-cell-num">{formatMoney(p.salePrice)}</td>
                      <td className="table-cell-num">{formatMoney(p.profit)}</td>
                      <td className="table-cell-num">
                        {formatNumber(p.quantity)} {unitLabel(p.unit)}
                      </td>
                      <td>
                        {p.status === "ARCHIVED" ? (
                          <Badge variant="neutral">{t("products.statusArchived")}</Badge>
                        ) : p.stockStatus === "OUT" ? (
                          <Badge variant="danger">{t("products.statusOut")}</Badge>
                        ) : p.stockStatus === "LOW" ? (
                          <Badge variant="warning">{t("products.statusLow")}</Badge>
                        ) : (
                          <Badge variant="success">{t("products.statusOk")}</Badge>
                        )}
                      </td>
                      <td>
                        <div className="table-actions">
                          <button className="btn btn-ghost btn-icon btn-sm" title={t("products.labelTooltip")} onClick={() => navigate(`/labels?product=${p.id}`)}>
                            <Tag size={16} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title={t("products.editTooltip")}
                            onClick={() => {
                              setEditing(p);
                              setDrawerOpen(true);
                            }}
                          >
                            <SquarePen size={16} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" title={t("products.deleteTooltip")} onClick={() => setDeleteTarget(p)}>
                            <Trash2 size={16} color="var(--color-danger-text)" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={10} onPageChange={setPage} />
          </>
        )}
      </div>

      <ProductDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        categories={categories}
        product={editing}
        submitting={submitting}
      />

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} onDone={loadProducts} />
      <VariantGroupDrawer
        open={variantsOpen}
        onClose={() => setVariantsOpen(false)}
        categories={categories}
        onDone={() => {
          setVariantsOpen(false);
          loadProducts();
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("products.deleteConfirmTitle")}
        description={t("products.deleteConfirmDescription", { name: deleteTarget?.name })}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
