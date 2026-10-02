import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Phone, Plus, Search, SquarePen, Trash2, Truck, Wallet } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { SupplierDrawer } from "./SupplierDrawer";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as supplierService from "../../services/supplier.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney } from "../../utils/format";
import type { Supplier } from "../../types";
import { usePermissions } from "../../hooks/usePermissions";

export default function Suppliers() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [summary, setSummary] = useState<supplierService.SupplierSummary | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setSuppliers(null);
    supplierService
      .listSuppliers(debouncedSearch || undefined)
      .then(setSuppliers)
      .catch((error) => showToast({ variant: "error", title: t("suppliers.loadFailed"), message: extractErrorMessage(error) }));
    supplierService.getSupplierSummary().then(setSummary).catch(() => undefined);
  }, [debouncedSearch, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: { name: string; phone: string; address: string }) {
    setSubmitting(true);
    try {
      const payload = { name: values.name, phone: values.phone || null, address: values.address || null };
      if (editing) {
        await supplierService.updateSupplier(editing.id, payload);
        showToast({ variant: "success", title: t("suppliers.saved") });
      } else {
        await supplierService.createSupplier(payload);
        showToast({ variant: "success", title: t("suppliers.created") });
      }
      setDrawerOpen(false);
      setEditing(null);
      load();
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
      await supplierService.deleteSupplier(deleteTarget.id);
      showToast({ variant: "success", title: t("suppliers.deleted") });
      setDeleteTarget(null);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.deleteFailed"), message: extractErrorMessage(error) });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("suppliers.title")}</h1>
          <p className="page-subtitle">{t("suppliers.subtitle")}</p>
        </div>
        {can("suppliers.manage") && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditing(null);
              setDrawerOpen(true);
            }}
          >
            <Plus size={18} />
            {t("suppliers.add")}
          </button>
        )}
      </div>

      <div className="card card-pad row gap-4" style={{ background: "linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600))", color: "#fff" }}>
        <div style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Wallet size={24} />
        </div>
        <div className="stack gap-1">
          <span style={{ opacity: 0.85, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("suppliers.summaryTotal")}</span>
          <span style={{ fontSize: "var(--font-size-3xl)", fontWeight: 800 }} className="mono-num">
            {summary ? formatMoney(summary.totalOutstanding) : "—"}
          </span>
        </div>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="input-with-icon">
            <Search size={16} />
            <input className="input" placeholder={t("suppliers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {suppliers === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={52} />
          </div>
        ) : suppliers.length === 0 ? (
          <EmptyState
            icon={<Truck size={26} />}
            title={t("suppliers.emptyNone")}
            subtitle={t("suppliers.emptyNoneSubtitle")}
            action={
              can("suppliers.manage") && (
                <button className="btn btn-primary" style={{ marginTop: "var(--space-2)" }} onClick={() => setDrawerOpen(true)}>
                  <Plus size={16} /> {t("suppliers.add")}
                </button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("suppliers.table.name")}</th>
                  <th>{t("suppliers.table.phone")}</th>
                  <th className="table-cell-num">{t("suppliers.table.totalPurchased")}</th>
                  <th className="table-cell-num">{t("suppliers.table.debt")}</th>
                  <th>{t("suppliers.table.lastDelivery")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.id} className="table-row-clickable" onClick={() => navigate(`/suppliers/${s.id}`)}>
                    <td style={{ fontWeight: 700 }}>{s.name}</td>
                    <td className="text-muted">
                      {s.phone ? (
                        <span className="row gap-1">
                          <Phone size={13} /> {s.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="table-cell-num">{formatMoney(s.totalPurchased)}</td>
                    <td className="table-cell-num">{s.debt > 0 ? <Badge variant="danger">{formatMoney(s.debt)}</Badge> : "—"}</td>
                    <td className="text-muted">{s.lastDeliveryAt ? formatDate(s.lastDeliveryAt) : "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions">
                        {can("suppliers.manage") && (
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            onClick={() => {
                              setEditing(s);
                              setDrawerOpen(true);
                            }}
                          >
                            <SquarePen size={16} />
                          </button>
                        )}
                        {can("suppliers.delete") && (
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteTarget(s)}>
                            <Trash2 size={16} color="var(--color-danger-text)" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SupplierDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSubmit={handleSubmit} supplier={editing} submitting={submitting} />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("suppliers.deleteConfirmTitle")}
        description={t("suppliers.deleteConfirmDescription", { name: deleteTarget?.name })}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
