import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  CalendarClock,
  ClipboardCheck,
  Package,
  PackagePlus,
  PackageX,
  Plus,
  Trash2,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { KpiCard } from "../../components/ui/KpiCard";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { Pagination } from "../../components/ui/Pagination";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { StockMovementModal } from "./StockMovementModal";
import { TransferModal } from "./TransferModal";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../hooks/useAuth";
import { useLabels } from "../../hooks/useLabels";
import { useLocations } from "../../hooks/useLocations";
import * as productService from "../../services/product.service";
import * as stockService from "../../services/stock.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import type { ExpiringBatch, Product, StockMovement, StockMovementType } from "../../types";
import "./Stock.css";

type TabKey = "BALANCE" | "IN" | "OUT" | "WRITE_OFF" | "HISTORY" | "EXPIRY";

const MOVEMENT_VARIANT: Record<string, "success" | "info" | "danger" | "warning" | "neutral"> = {
  IN: "success",
  RETURN: "success",
  SALE: "info",
  TRANSFER: "neutral",
  WRITE_OFF: "danger",
  OUT: "warning",
  ADJUSTMENT: "warning",
};

export default function Stock() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { session } = useAuth();
  const labels = useLabels();
  const { locations, multiple } = useLocations();
  const trackExpiry = !!session?.business.trackExpiry;
  const canManage = session?.role !== "CASHIER";

  const [tab, setTab] = useState<TabKey>("BALANCE");
  const [locationFilter, setLocationFilter] = useState("");
  const [summary, setSummary] = useState<stockService.StockSummary | null>(null);
  const [reorderSuggestions, setReorderSuggestions] = useState<stockService.ReorderSuggestion[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [movements, setMovements] = useState<StockMovement[] | null>(null);
  const [batches, setBatches] = useState<ExpiringBatch[] | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [writeOff, setWriteOff] = useState<ExpiringBatch | null>(null);

  const TABS: { key: TabKey; label: string }[] = [
    { key: "BALANCE", label: t("stock.tabs.BALANCE") },
    ...(trackExpiry ? [{ key: "EXPIRY" as TabKey, label: t("stock.tabs.EXPIRY") }] : []),
    { key: "IN", label: t("stock.tabs.IN") },
    { key: "OUT", label: t("stock.tabs.OUT") },
    { key: "WRITE_OFF", label: t("stock.tabs.WRITE_OFF") },
    { key: "HISTORY", label: t("stock.tabs.HISTORY") },
  ];

  const loadSummary = useCallback(() => {
    stockService.getStockSummary().then(setSummary).catch(() => undefined);
    stockService.getReorderSuggestions().then(setReorderSuggestions).catch(() => undefined);
  }, []);

  const loadProducts = useCallback(() => {
    setProducts(null);
    productService
      .listProducts({ status: "ACTIVE", pageSize: 200, locationId: locationFilter || undefined })
      .then((res) => setProducts(res.items))
      .catch((error) => showToast({ variant: "error", title: t("stock.loadFailed"), message: extractErrorMessage(error) }));
  }, [showToast, t, locationFilter]);

  const loadMovements = useCallback(
    (type?: StockMovementType) => {
      setMovements(null);
      stockService
        .listMovements({ type, page, pageSize: 15, locationId: locationFilter || undefined })
        .then((res) => {
          setMovements(res.items);
          setTotal(res.total);
          setTotalPages(res.totalPages);
        })
        .catch((error) => showToast({ variant: "error", title: t("stock.loadFailed"), message: extractErrorMessage(error) }));
    },
    [page, showToast, t, locationFilter],
  );

  const loadBatches = useCallback(() => {
    setBatches(null);
    stockService
      .listExpiringBatches(60)
      .then(setBatches)
      .catch((error) => showToast({ variant: "error", title: t("stock.loadFailed"), message: extractErrorMessage(error) }));
  }, [showToast, t]);

  const reloadTab = useCallback(() => {
    if (tab === "BALANCE") loadProducts();
    else if (tab === "EXPIRY") loadBatches();
    else if (tab === "HISTORY") loadMovements(undefined);
    else loadMovements(tab as StockMovementType);
  }, [tab, loadProducts, loadBatches, loadMovements]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    setPage(1);
  }, [tab, locationFilter]);

  useEffect(() => {
    reloadTab();
  }, [reloadTab]);

  async function handleCreateMovement(values: stockService.CreateMovementPayload) {
    setSubmitting(true);
    try {
      await stockService.createMovement(values);
      showToast({ variant: "success", title: t("stock.movementAdded") });
      setModalOpen(false);
      loadSummary();
      reloadTab();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmWriteOff() {
    if (!writeOff) return;
    setSubmitting(true);
    try {
      await stockService.writeOffBatch(writeOff.id, locationFilter || null);
      showToast({ variant: "success", title: t("stock.expiry.writtenOff") });
      setWriteOff(null);
      loadSummary();
      loadBatches();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("stock.title")}</h1>
          <p className="page-subtitle">{t("stock.subtitle")}</p>
        </div>
        {canManage && (
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <Link to="/receiving" className="btn btn-secondary">
              <PackagePlus size={18} />
              {t("stock.actions.receiving")}
            </Link>
            <Link to="/inventory" className="btn btn-secondary">
              <ClipboardCheck size={18} />
              {t("stock.actions.inventory")}
            </Link>
            {multiple && (
              <button className="btn btn-secondary" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight size={18} />
                {t("stock.actions.transfer")}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
              <Plus size={18} />
              {t("stock.add")}
            </button>
          </div>
        )}
      </div>

      <div className="stock-summary-grid">
        {!summary ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="card card-pad" style={{ height: 132 }} />)
        ) : (
          <>
            <KpiCard index={0} label={t("stock.kpi.totalProducts")} value={formatNumber(summary.totalProducts)} icon={Package} accent="primary" />
            <KpiCard index={1} label={t("stock.kpi.totalValue")} value={formatMoney(summary.totalValue)} icon={Wallet} accent="primary" />
            <KpiCard index={2} label={t("stock.kpi.lowStock")} value={formatNumber(summary.lowStock)} icon={AlertTriangle} accent="warning" />
            <KpiCard index={3} label={t("stock.kpi.outOfStock")} value={formatNumber(summary.outOfStock)} icon={PackageX} accent="danger" />
          </>
        )}
      </div>

      {reorderSuggestions && reorderSuggestions.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <TrendingDown size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
                {t("stock.reorder.title")}
              </h2>
              <p className="card-subtitle">{t("stock.reorder.subtitle")}</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("stock.reorder.product")}</th>
                  <th className="table-cell-num">{t("stock.reorder.currentStock")}</th>
                  <th className="table-cell-num">{t("stock.reorder.dailySales")}</th>
                  <th>{t("stock.reorder.eta")}</th>
                </tr>
              </thead>
              <tbody>
                {reorderSuggestions.map((r) => (
                  <tr key={r.productId}>
                    <td style={{ fontWeight: 600 }}>{r.name}</td>
                    <td className="table-cell-num">
                      {formatNumber(r.quantity)} {unitLabel(r.unit)}
                    </td>
                    <td className="table-cell-num">
                      {formatNumber(r.dailyVelocity)} {unitLabel(r.unit)}
                    </td>
                    <td>
                      <Badge variant={r.daysUntilStockout !== null && r.daysUntilStockout <= 2 ? "danger" : "warning"}>
                        {r.daysUntilStockout === 0 ? t("stock.reorder.etaToday") : t("stock.reorder.etaDays", { days: r.daysUntilStockout })}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="stock-toolbar row gap-3" style={{ flexWrap: "wrap" }}>
          <div className="tabs">
            {TABS.map((tabItem) => (
              <button key={tabItem.key} className={`tab ${tab === tabItem.key ? "active" : ""}`} onClick={() => setTab(tabItem.key)}>
                {tabItem.key === "EXPIRY" && <CalendarClock size={14} style={{ marginRight: 4, verticalAlign: -2 }} />}
                {tabItem.label}
              </button>
            ))}
          </div>
          {multiple && tab !== "EXPIRY" && (
            <select className="select" style={{ width: 200, marginLeft: "auto" }} value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
              <option value="">{t("stock.allLocations")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {tab === "BALANCE" ? (
          products === null ? (
            <div className="card-pad">
              <SkeletonRows rows={6} height={48} />
            </div>
          ) : products.length === 0 ? (
            <EmptyState icon={<Boxes size={26} />} title={t("stock.emptyProducts")} subtitle={t("stock.emptyProductsSubtitle")} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("stock.table.product")}</th>
                    <th>{t("stock.table.category")}</th>
                    {locationFilter && <th className="table-cell-num">{t("stock.table.locationStock")}</th>}
                    <th className="table-cell-num">{locationFilter ? t("stock.table.totalStock") : t("stock.table.stock")}</th>
                    <th className="table-cell-num">{t("stock.table.minStock")}</th>
                    <th>{t("stock.table.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td className="text-muted">{p.categoryName ?? "—"}</td>
                      {locationFilter && (
                        <td className="table-cell-num" style={{ fontWeight: 600 }}>
                          {formatNumber(p.locationQuantity ?? 0)} {unitLabel(p.unit)}
                        </td>
                      )}
                      <td className="table-cell-num">
                        {formatNumber(p.quantity)} {unitLabel(p.unit)}
                      </td>
                      <td className="table-cell-num">
                        {formatNumber(p.minQuantity)} {unitLabel(p.unit)}
                      </td>
                      <td>
                        {p.stockStatus === "OUT" ? (
                          <Badge variant="danger">{t("stock.statusOut")}</Badge>
                        ) : p.stockStatus === "LOW" ? (
                          <Badge variant="warning">{t("stock.statusLow")}</Badge>
                        ) : (
                          <Badge variant="success">{t("stock.statusOk")}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === "EXPIRY" ? (
          batches === null ? (
            <div className="card-pad">
              <SkeletonRows rows={5} height={48} />
            </div>
          ) : batches.length === 0 ? (
            <EmptyState icon={<CalendarClock size={26} />} title={t("stock.expiry.empty")} subtitle={t("stock.expiry.emptySubtitle")} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("stock.table.product")}</th>
                    <th>{t("stock.expiry.batch")}</th>
                    <th>{t("stock.expiry.expiryDate")}</th>
                    <th className="table-cell-num">{t("stock.table.quantity")}</th>
                    <th className="table-cell-num">{t("stock.expiry.value")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 600 }}>{b.productName}</td>
                      <td className="text-muted">{b.batchNumber ?? "—"}</td>
                      <td>
                        {b.expiryDate ? formatDate(b.expiryDate) : "—"}{" "}
                        <Badge variant={b.expired ? "danger" : (b.daysLeft ?? 99) <= 7 ? "warning" : "neutral"}>
                          {b.expired ? t("stock.expiry.expired") : t("stock.expiry.daysLeft", { days: b.daysLeft })}
                        </Badge>
                      </td>
                      <td className="table-cell-num">
                        {formatNumber(b.quantity)} {unitLabel(b.unit)}
                      </td>
                      <td className="table-cell-num">{formatMoney(b.value)}</td>
                      <td className="table-cell-num">
                        {canManage && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setWriteOff(b)}>
                            <Trash2 size={14} color="var(--color-danger-text)" /> {t("stock.expiry.writeOff")}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : movements === null ? (
          <div className="card-pad">
            <SkeletonRows rows={6} height={48} />
          </div>
        ) : movements.length === 0 ? (
          <EmptyState icon={<Boxes size={26} />} title={t("stock.emptyMovements")} subtitle={t("stock.emptyMovementsSubtitle")} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("stock.table.product")}</th>
                    <th>{t("stock.table.type")}</th>
                    <th className="table-cell-num">{t("stock.table.quantity")}</th>
                    <th className="table-cell-num">{t("stock.table.price")}</th>
                    <th>{t("stock.table.supplierComment")}</th>
                    {multiple && <th>{t("stock.table.location")}</th>}
                    <th>{t("stock.table.employee")}</th>
                    <th>{t("stock.table.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}>{m.productName}</td>
                      <td>
                        <Badge variant={MOVEMENT_VARIANT[m.type] ?? "neutral"}>{labels.stockMovementType[m.type] ?? m.type}</Badge>
                      </td>
                      <td className="table-cell-num">{formatNumber(m.quantity)}</td>
                      <td className="table-cell-num">{m.purchasePrice ? formatMoney(m.purchasePrice) : "—"}</td>
                      <td className="text-muted">{m.supplierName ?? m.comment ?? "—"}</td>
                      {multiple && (
                        <td className="text-muted">
                          {m.toLocationName ? `${m.locationName ?? "—"} → ${m.toLocationName}` : (m.locationName ?? "—")}
                        </td>
                      )}
                      <td className="text-muted">{m.employeeName ?? "—"}</td>
                      <td className="text-muted">{formatDateTime(m.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={15} onPageChange={setPage} />
          </>
        )}
      </div>

      <StockMovementModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        products={products ?? []}
        defaultType={tab === "IN" || tab === "OUT" || tab === "WRITE_OFF" ? tab : "IN"}
        submitting={submitting}
        onSubmit={handleCreateMovement}
        locations={multiple ? locations : []}
        trackExpiry={trackExpiry}
      />

      {multiple && (
        <TransferModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          locations={locations}
          onDone={() => {
            setTransferOpen(false);
            loadSummary();
            reloadTab();
          }}
        />
      )}

      <ConfirmDialog
        open={!!writeOff}
        danger
        title={t("stock.expiry.writeOffConfirmTitle")}
        description={writeOff ? t("stock.expiry.writeOffConfirmDescription", { name: writeOff.productName, qty: writeOff.quantity }) : undefined}
        confirmLabel={t("stock.expiry.writeOff")}
        loading={submitting}
        onConfirm={confirmWriteOff}
        onCancel={() => setWriteOff(null)}
      />
    </div>
  );
}
