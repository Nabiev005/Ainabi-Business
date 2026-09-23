import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Plus, Printer, Search, Wrench } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Pagination } from "../../components/ui/Pagination";
import { Badge } from "../../components/ui/Badge";
import { Drawer } from "../../components/ui/Drawer";
import { Modal } from "../../components/ui/Modal";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as repairService from "../../services/repair.service";
import * as customerService from "../../services/customer.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney } from "../../utils/format";
import { printRepairTicket } from "../../utils/documents";
import type { Customer, RepairOrder, RepairStatus } from "../../types";

type Filter = "ACTIVE" | RepairStatus | "";
const FILTERS: Filter[] = ["ACTIVE", "RECEIVED", "IN_PROGRESS", "READY", "DELIVERED", "CANCELLED", ""];
const STATUS_VARIANT: Record<RepairStatus, "info" | "warning" | "success" | "neutral" | "danger"> = {
  RECEIVED: "info",
  IN_PROGRESS: "warning",
  READY: "success",
  DELIVERED: "neutral",
  CANCELLED: "danger",
};
const NEXT: Record<RepairStatus, RepairStatus[]> = {
  RECEIVED: ["IN_PROGRESS", "READY", "CANCELLED"],
  IN_PROGRESS: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "IN_PROGRESS", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const emptyForm = { customerId: "", customerName: "", customerPhone: "", device: "", serial: "", problem: "", notes: "", estimatedPrice: "", prepayment: "" };

export default function Repairs() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const labels = useLabels();
  const [filter, setFilter] = useState<Filter>("ACTIVE");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [repairs, setRepairs] = useState<RepairOrder[] | null>(null);
  const [counts, setCounts] = useState<Partial<Record<RepairStatus, number>>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<RepairOrder | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [finalPrice, setFinalPrice] = useState("");
  const [payMethod, setPayMethod] = useState<"CASH" | "CARD" | "QR">("CASH");

  const load = useCallback(() => {
    setRepairs(null);
    repairService
      .listRepairs({ status: filter || undefined, search: debouncedSearch.trim() || undefined, page, pageSize: 20 })
      .then((res) => {
        setRepairs(res.items);
        setCounts(res.counts);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [filter, debouncedSearch, page, showToast, t]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    customerService.listCustomers().then(setCustomers).catch(() => undefined);
  }, []);

  useEffect(() => {
    setNotesDraft(selected?.notes ?? "");
  }, [selected]);

  function countFor(f: Filter) {
    if (f === "ACTIVE") return (counts.RECEIVED ?? 0) + (counts.IN_PROGRESS ?? 0) + (counts.READY ?? 0);
    if (f === "") return Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
    return counts[f] ?? 0;
  }

  async function create() {
    if (!form.device.trim() || !form.problem.trim() || (!form.customerId && !form.customerName.trim())) return;
    setSaving(true);
    try {
      const repair = await repairService.createRepair({
        customerId: form.customerId || null,
        customerName: form.customerId ? null : form.customerName,
        customerPhone: form.customerPhone || null,
        device: form.device,
        serial: form.serial || null,
        problem: form.problem,
        notes: form.notes || null,
        estimatedPrice: form.estimatedPrice ? Number(form.estimatedPrice) : null,
        prepayment: Number(form.prepayment) || 0,
      });
      showToast({ variant: "success", title: t("repairs.created", { number: repair.number }) });
      setCreateOpen(false);
      setForm(emptyForm);
      setSelected(repair);
      if (session) printRepairTicket(repair, session.business);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(status: RepairStatus) {
    if (!selected) return;
    if (status === "DELIVERED") {
      setFinalPrice(String(selected.finalPrice ?? selected.estimatedPrice ?? ""));
      setDelivering(true);
      return;
    }
    try {
      const updated = await repairService.changeRepairStatus(selected.id, { status });
      setSelected(updated);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  async function deliver() {
    if (!selected) return;
    try {
      const updated = await repairService.changeRepairStatus(selected.id, { status: "DELIVERED", finalPrice: Number(finalPrice), paymentMethod: payMethod });
      setSelected(updated);
      setDelivering(false);
      showToast({ variant: "success", title: t("repairs.delivered") });
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  async function saveNotes() {
    if (!selected) return;
    try {
      setSelected(await repairService.updateRepair(selected.id, { notes: notesDraft }));
      showToast({ variant: "success", title: t("settings.saved") });
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  const closed = selected?.status === "DELIVERED" || selected?.status === "CANCELLED";

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("repairs.title")}</h1>
          <p className="page-subtitle">{t("repairs.subtitle")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Plus size={18} /> {t("repairs.add")}
        </button>
      </div>

      <div className="card">
        <div className="stock-toolbar row gap-3" style={{ flexWrap: "wrap", padding: "var(--space-4)" }}>
          <div className="tabs">
            {FILTERS.map((f) => (
              <button key={f || "ALL"} className={`tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
                {t(`repairs.filters.${f || "ALL"}`)} <span className="text-muted">({countFor(f)})</span>
              </button>
            ))}
          </div>
          <div className="input-with-icon" style={{ marginLeft: "auto", minWidth: 220 }}>
            <Search size={16} />
            <input className="input" placeholder={t("repairs.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        {repairs === null ? (
          <div className="card-pad">
            <SkeletonRows rows={6} height={48} />
          </div>
        ) : repairs.length === 0 ? (
          <EmptyState icon={<Wrench size={26} />} title={t("repairs.empty")} subtitle={t("repairs.emptySubtitle")} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>№</th>
                    <th>{t("repairs.customer")}</th>
                    <th>{t("repairs.device")}</th>
                    <th>{t("repairs.problem")}</th>
                    <th>{t("repairs.status")}</th>
                    <th className="table-cell-num">{t("repairs.due")}</th>
                    <th>{t("stock.table.date")}</th>
                  </tr>
                </thead>
                <tbody>
                  {repairs.map((r) => (
                    <tr key={r.id} className="table-row-clickable" onClick={() => setSelected(r)}>
                      <td className="mono-num">{r.number}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.customerName}</div>
                        {r.customerPhone && <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{r.customerPhone}</div>}
                      </td>
                      <td>
                        {r.device}
                        {r.serial && <div className="text-muted mono-num" style={{ fontSize: "var(--font-size-xs)" }}>{r.serial}</div>}
                      </td>
                      <td className="text-muted" style={{ maxWidth: 240 }}>
                        {r.problem}
                      </td>
                      <td>
                        <Badge variant={STATUS_VARIANT[r.status]}>{t(`repairs.statuses.${r.status}`)}</Badge>
                      </td>
                      <td className="table-cell-num">{r.dueAmount > 0 ? formatMoney(r.dueAmount) : "—"}</td>
                      <td className="text-muted">{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} totalPages={totalPages} total={total} pageSize={20} onPageChange={setPage} />
          </>
        )}
      </div>

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("repairs.add")}
        subtitle={t("repairs.addSubtitle")}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </button>
            <button className="btn btn-primary" onClick={create} disabled={saving}>
              {saving ? t("common.saving") : t("repairs.createAndPrint")}
            </button>
          </>
        }
      >
        <div className="stack gap-4">
          <div className="field">
            <label className="field-label">{t("repairs.customer")}</label>
            <select className="select" value={form.customerId} onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}>
              <option value="">{t("repairs.newCustomer")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `— ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </div>
          {!form.customerId && (
            <div className="form-grid">
              <div className="field">
                <label className="field-label">{t("repairs.customerName")} *</label>
                <input className="input" value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">{t("repairs.phone")}</label>
                <input className="input" value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))} placeholder="+996" />
              </div>
            </div>
          )}
          <div className="form-grid">
            <div className="field">
              <label className="field-label">{t("repairs.device")} *</label>
              <input className="input" value={form.device} onChange={(e) => setForm((f) => ({ ...f, device: e.target.value }))} placeholder="iPhone 12, 128GB" />
            </div>
            <div className="field">
              <label className="field-label">IMEI / S/N</label>
              <input className="input" value={form.serial} onChange={(e) => setForm((f) => ({ ...f, serial: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">{t("repairs.problem")} *</label>
            <textarea className="textarea" value={form.problem} onChange={(e) => setForm((f) => ({ ...f, problem: e.target.value }))} placeholder={t("repairs.problemPlaceholder")} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">{t("repairs.estimate")}</label>
              <input type="number" min={0} className="input" value={form.estimatedPrice} onChange={(e) => setForm((f) => ({ ...f, estimatedPrice: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">{t("repairs.prepayment")}</label>
              <input type="number" min={0} className="input" value={form.prepayment} onChange={(e) => setForm((f) => ({ ...f, prepayment: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">{t("repairs.notes")}</label>
            <input className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder={t("repairs.notesPlaceholder")} />
          </div>
        </div>
      </Drawer>

      <Drawer
        open={!!selected && !createOpen}
        onClose={() => setSelected(null)}
        title={selected ? t("repairs.detailTitle", { number: selected.number }) : ""}
        subtitle={selected ? `${selected.device} · ${formatDateTime(selected.createdAt)}` : ""}
        footer={
          selected && (
            <button className="btn btn-secondary" onClick={() => session && printRepairTicket(selected, session.business)}>
              <Printer size={16} /> {t("repairs.printTicket")}
            </button>
          )
        }
      >
        {selected && (
          <div className="stack gap-4">
            <div className="row gap-2">
              <Badge variant={STATUS_VARIANT[selected.status]}>{t(`repairs.statuses.${selected.status}`)}</Badge>
              <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                {selected.employeeName}
              </span>
            </div>
            <div className="stat-grid">
              <div className="stat-tile">
                <div className="stat-tile-label">{t("repairs.customer")}</div>
                <div style={{ fontWeight: 600 }}>{selected.customerName}</div>
                <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{selected.customerPhone ?? "—"}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("repairs.estimate")}</div>
                <div className="stat-tile-value">{selected.estimatedPrice !== null ? formatMoney(selected.estimatedPrice) : "—"}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile-label">{t("repairs.prepayment")}</div>
                <div className="stat-tile-value">{formatMoney(selected.prepayment)}</div>
              </div>
              {selected.finalPrice !== null && (
                <div className="stat-tile">
                  <div className="stat-tile-label">{t("repairs.finalPrice")}</div>
                  <div className="stat-tile-value">{formatMoney(selected.finalPrice)}</div>
                </div>
              )}
            </div>
            {selected.serial && (
              <div>
                <span className="text-muted">IMEI / S/N: </span>
                <span className="mono-num">{selected.serial}</span>
              </div>
            )}
            <div>
              <div className="field-label">{t("repairs.problem")}</div>
              <p style={{ margin: 0 }}>{selected.problem}</p>
            </div>
            <div className="field">
              <label className="field-label">{t("repairs.notes")}</label>
              <textarea className="textarea" disabled={closed} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} placeholder={t("repairs.notesPlaceholder")} />
              {!closed && notesDraft !== (selected.notes ?? "") && (
                <button className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start", marginTop: 6 }} onClick={saveNotes}>
                  {t("common.save")}
                </button>
              )}
            </div>
            {NEXT[selected.status].length > 0 && (
              <div className="stack gap-2">
                <div className="field-label">{t("repairs.changeStatus")}</div>
                <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                  {NEXT[selected.status].map((status) => (
                    <button
                      key={status}
                      className={`btn btn-sm ${status === "DELIVERED" ? "btn-primary" : status === "CANCELLED" ? "btn-ghost" : "btn-secondary"}`}
                      onClick={() => changeStatus(status)}
                    >
                      {status === "DELIVERED" && <CheckCircle2 size={14} />}
                      {t(`repairs.actions.${status}`)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selected.status === "DELIVERED" && selected.deliveredAt && (
              <p className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                {t("repairs.deliveredAt", {
                  date: formatDateTime(selected.deliveredAt),
                  method: selected.paymentMethod ? labels.paymentMethod[selected.paymentMethod] : "—",
                })}
              </p>
            )}
          </div>
        )}
      </Drawer>

      <Modal open={delivering} onClose={() => setDelivering(false)}>
        {selected && (
          <div className="stack gap-4">
            <h2 className="card-title">{t("repairs.deliverTitle", { number: selected.number })}</h2>
            <div className="field">
              <label className="field-label">{t("repairs.finalPrice")}</label>
              <input type="number" min={selected.prepayment} className="input" autoFocus value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">{t("receiving.paymentMethod")}</label>
              <select className="select" value={payMethod} onChange={(e) => setPayMethod(e.target.value as "CASH" | "CARD" | "QR")}>
                {(["CASH", "CARD", "QR"] as const).map((m) => (
                  <option key={m} value={m}>
                    {labels.paymentMethod[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="row" style={{ fontWeight: 700 }}>
              <span className="spacer">{t("repairs.toPay")}</span>
              <span className="mono-num">{formatMoney(Math.max(0, (Number(finalPrice) || 0) - selected.prepayment))}</span>
            </div>
            <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
              <button className="btn btn-secondary" onClick={() => setDelivering(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={deliver} disabled={finalPrice === "" || Number(finalPrice) < selected.prepayment}>
                {t("repairs.actions.DELIVERED")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
