import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, UserCog } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { InviteEmployeeModal } from "./InviteEmployeeModal";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as employeeService from "../../services/employee.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime } from "../../utils/format";
import { useLocations } from "../../hooks/useLocations";
import type { Employee, Role } from "../../types";

export default function Employees() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const labels = useLabels();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canManage = session?.role === "OWNER" || session?.role === "ADMIN";
  const { locations, multiple } = useLocations();

  async function handleLocationChange(employee: Employee, locationId: string) {
    try {
      await employeeService.updateEmployee(employee.id, { locationId: locationId || null });
      showToast({ variant: "success", title: t("employees.locationChanged") });
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  const load = useCallback(() => {
    setEmployees(null);
    employeeService
      .listEmployees()
      .then(setEmployees)
      .catch((error) => showToast({ variant: "error", title: t("employees.loadFailed"), message: extractErrorMessage(error) }));
  }, [showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(values: { name: string; email: string; phone: string; password: string; role: Exclude<Role, "OWNER"> }) {
    setSubmitting(true);
    try {
      await employeeService.inviteEmployee({ ...values, phone: values.phone || undefined });
      showToast({ variant: "success", title: t("employees.invited") });
      setInviteOpen(false);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusToggle(employee: Employee) {
    try {
      await employeeService.updateEmployee(employee.id, { status: employee.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" });
      showToast({ variant: "success", title: t("employees.statusChanged") });
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.changeFailed"), message: extractErrorMessage(error) });
    }
  }

  async function handleRoleChange(employee: Employee, role: Exclude<Role, "OWNER">) {
    try {
      await employeeService.updateEmployee(employee.id, { role });
      showToast({ variant: "success", title: t("employees.roleChanged") });
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.changeFailed"), message: extractErrorMessage(error) });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await employeeService.deleteEmployee(deleteTarget.id);
      showToast({ variant: "success", title: t("employees.deleted") });
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
          <h1 className="page-title">{t("employees.title")}</h1>
          <p className="page-subtitle">{t("employees.subtitle")}</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => setInviteOpen(true)}>
            <Plus size={18} />
            {t("employees.add")}
          </button>
        )}
      </div>

      <div className="card">
        {employees === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={52} />
          </div>
        ) : employees.length === 0 ? (
          <EmptyState icon={<UserCog size={26} />} title={t("employees.empty")} subtitle={t("employees.emptySubtitle")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("employees.table.name")}</th>
                  <th>{t("employees.table.contact")}</th>
                  <th>{t("employees.table.role")}</th>
                  <th>{t("employees.table.status")}</th>
                  {multiple && <th>{t("employees.table.location")}</th>}
                  <th>{t("employees.table.lastLogin")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 700 }}>{e.name}</td>
                    <td className="text-muted stack gap-1">
                      <span>{e.email}</span>
                      {e.phone && <span style={{ fontSize: "var(--font-size-xs)" }}>{e.phone}</span>}
                    </td>
                    <td>
                      {canManage && e.role !== "OWNER" ? (
                        <select
                          className="select"
                          style={{ height: 34, fontSize: "var(--font-size-sm)" }}
                          value={e.role}
                          onChange={(ev) => handleRoleChange(e, ev.target.value as Exclude<Role, "OWNER">)}
                        >
                          <option value="ADMIN">{labels.role.ADMIN}</option>
                          <option value="CASHIER">{labels.role.CASHIER}</option>
                        </select>
                      ) : (
                        <Badge variant={e.role === "OWNER" ? "info" : "neutral"}>{labels.role[e.role]}</Badge>
                      )}
                    </td>
                    <td>
                      {canManage && e.role !== "OWNER" ? (
                        <button className={`badge ${e.status === "ACTIVE" ? "badge-success" : "badge-neutral"}`} style={{ cursor: "pointer", border: "none" }} onClick={() => handleStatusToggle(e)}>
                          {labels.employeeStatus[e.status]}
                        </button>
                      ) : (
                        <Badge variant={e.status === "ACTIVE" ? "success" : "neutral"}>{labels.employeeStatus[e.status]}</Badge>
                      )}
                    </td>
                    {multiple && (
                      <td>
                        {canManage ? (
                          <select className="select" style={{ height: 32, minWidth: 140 }} value={e.locationId ?? ""} onChange={(ev) => handleLocationChange(e, ev.target.value)}>
                            <option value="">{t("employees.defaultLocation")}</option>
                            {locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          (e.locationName ?? t("employees.defaultLocation"))
                        )}
                      </td>
                    )}
                    <td className="text-muted">{e.lastLoginAt ? formatDateTime(e.lastLoginAt) : t("employees.neverLoggedIn")}</td>
                    <td>
                      {canManage && e.role !== "OWNER" && (
                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteTarget(e)}>
                          <Trash2 size={16} color="var(--color-danger-text)" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteEmployeeModal open={inviteOpen} onClose={() => setInviteOpen(false)} submitting={submitting} onSubmit={handleInvite} />

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("employees.deleteConfirmTitle")}
        description={t("employees.deleteConfirmDescription", { name: deleteTarget?.name })}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
