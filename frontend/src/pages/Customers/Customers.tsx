import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, Phone, Plus, Search, SquarePen, Trash2, Users } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { CustomerDrawer } from "./CustomerDrawer";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as customerService from "../../services/customer.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney } from "../../utils/format";
import type { Customer } from "../../types";

const INACTIVE_DAYS = 30;

function isInactive(c: Customer): boolean {
  if (!c.lastPurchaseAt || c.purchaseCount === 0) return false;
  const daysSince = (Date.now() - new Date(c.lastPurchaseAt).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= INACTIVE_DAYS;
}

export default function Customers() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [showInactiveOnly, setShowInactiveOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    setCustomers(null);
    customerService
      .listCustomers(debouncedSearch || undefined)
      .then(setCustomers)
      .catch((error) => showToast({ variant: "error", title: t("customers.loadFailed"), message: extractErrorMessage(error) }));
  }, [debouncedSearch, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(values: { name: string; phone: string; notes: string; isWholesale: boolean }) {
    setSubmitting(true);
    try {
      const payload = { name: values.name, phone: values.phone || null, notes: values.notes || null, isWholesale: values.isWholesale };
      if (editing) {
        await customerService.updateCustomer(editing.id, payload);
        showToast({ variant: "success", title: t("customers.saved") });
      } else {
        await customerService.createCustomer(payload);
        showToast({ variant: "success", title: t("customers.created") });
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

  const inactiveCount = useMemo(() => (customers ?? []).filter(isInactive).length, [customers]);
  const visibleCustomers = useMemo(
    () => (showInactiveOnly ? (customers ?? []).filter(isInactive) : customers ?? []),
    [customers, showInactiveOnly],
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await customerService.deleteCustomer(deleteTarget.id);
      showToast({ variant: "success", title: t("customers.deleted") });
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
          <h1 className="page-title">{t("customers.title")}</h1>
          <p className="page-subtitle">{t("customers.subtitle")}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditing(null);
            setDrawerOpen(true);
          }}
        >
          <Plus size={18} />
          {t("customers.add")}
        </button>
      </div>

      {inactiveCount > 0 && (
        <button
          className="card card-pad row gap-4 card-hoverable"
          style={{ textAlign: "left", cursor: "pointer", border: showInactiveOnly ? "1px solid var(--color-primary-500)" : undefined }}
          onClick={() => setShowInactiveOnly((v) => !v)}
        >
          <div style={{ width: 44, height: 44, borderRadius: "var(--radius-md)", background: "var(--color-warning-bg)", color: "var(--color-warning-text)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Clock size={20} />
          </div>
          <div className="stack gap-1">
            <span style={{ fontWeight: 700 }}>{t("customers.inactiveBanner", { count: inactiveCount, days: INACTIVE_DAYS })}</span>
            <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
              {showInactiveOnly ? t("customers.inactiveBannerShowAll") : t("customers.inactiveBannerHint")}
            </span>
          </div>
        </button>
      )}

      <div className="card">
        <div className="filter-bar">
          <div className="input-with-icon">
            <Search size={16} />
            <input className="input" placeholder={t("customers.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {showInactiveOnly && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowInactiveOnly(false)}>
              {t("customers.clearFilter")}
            </button>
          )}
        </div>

        {customers === null ? (
          <div className="card-pad">
            <SkeletonRows rows={6} height={52} />
          </div>
        ) : visibleCustomers.length === 0 ? (
          <EmptyState
            icon={<Users size={26} />}
            title={showInactiveOnly ? t("customers.emptyInactive") : t("customers.emptyNone")}
            subtitle={showInactiveOnly ? t("customers.emptyInactiveSubtitle") : t("customers.emptyNoneSubtitle")}
            action={
              !showInactiveOnly && (
                <button className="btn btn-primary" style={{ marginTop: "var(--space-2)" }} onClick={() => setDrawerOpen(true)}>
                  <Plus size={16} /> {t("customers.add")}
                </button>
              )
            }
          />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("customers.table.name")}</th>
                  <th>{t("customers.table.phone")}</th>
                  <th className="table-cell-num">{t("customers.table.purchases")}</th>
                  <th className="table-cell-num">{t("customers.table.totalSpent")}</th>
                  <th className="table-cell-num">{t("customers.table.debt")}</th>
                  <th>{t("customers.table.lastPurchase")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((c) => (
                  <tr key={c.id} className="table-row-clickable" onClick={() => navigate(`/customers/${c.id}`)}>
                    <td style={{ fontWeight: 700 }}>
                      {c.name}
                      {c.isWholesale && (
                        <span className="badge badge-info" style={{ marginLeft: 6 }}>
                          {t("sales.wholesale")}
                        </span>
                      )}
                    </td>
                    <td className="text-muted">
                      {c.phone ? (
                        <span className="row gap-1">
                          <Phone size={13} /> {c.phone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="table-cell-num">{c.purchaseCount}</td>
                    <td className="table-cell-num">{formatMoney(c.totalSpent)}</td>
                    <td className="table-cell-num">{c.debt > 0 ? <Badge variant="danger">{formatMoney(c.debt)}</Badge> : "—"}</td>
                    <td className="text-muted">
                      <div className="stack gap-1">
                        <span>{c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : "—"}</span>
                        {isInactive(c) && <Badge variant="warning">{t("customers.inactiveBadge", { days: INACTIVE_DAYS })}</Badge>}
                      </div>
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="table-actions">
                        <button
                          className="btn btn-ghost btn-icon btn-sm"
                          onClick={() => {
                            setEditing(c);
                            setDrawerOpen(true);
                          }}
                        >
                          <SquarePen size={16} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteTarget(c)}>
                          <Trash2 size={16} color="var(--color-danger-text)" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CustomerDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} onSubmit={handleSubmit} customer={editing} submitting={submitting} />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("customers.deleteConfirmTitle")}
        description={t("customers.deleteConfirmDescription", { name: deleteTarget?.name })}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
