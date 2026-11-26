import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookmarkCheck, MessageCircle, Plus, ShoppingCart, Trash2, X } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { ProductSearchBox } from "../../components/ProductSearchBox";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { useLocations } from "../../hooks/useLocations";
import * as reservationService from "../../services/reservation.service";
import * as customerService from "../../services/customer.service";
import type { Reservation, ReservationStatus } from "../../services/reservation.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney, formatNumber, unitLabel } from "../../utils/format";
import { reservationMessage, whatsappShareLink } from "../../utils/messages";
import type { Customer, Product } from "../../types";

const STATUS_BADGE: Record<ReservationStatus, "success" | "neutral" | "warning" | "info"> = {
  ACTIVE: "info",
  COMPLETED: "success",
  CANCELLED: "neutral",
  EXPIRED: "warning",
};
const DAY_OPTIONS = [1, 3, 7, 14, 30, 0];

/** Goods held for customers who pay and take them later. */
export default function Reservations() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<"ACTIVE" | "ALL">("ACTIVE");
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Reservation | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    setRows(null);
    reservationService
      .listReservations(tab)
      .then(setRows)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [tab, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await reservationService.cancelReservation(cancelTarget.id);
      showToast({ variant: "success", title: t("reservations.cancelled") });
      setCancelTarget(null);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("reservations.title")}</h1>
          <p className="page-subtitle">{t("reservations.subtitle")}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Plus size={18} /> {t("reservations.add")}
        </button>
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="tabs">
            {(["ACTIVE", "ALL"] as const).map((key) => (
              <button key={key} className={`tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
                {t(`reservations.tabs.${key}`)}
              </button>
            ))}
          </div>
        </div>

        {rows === null ? (
          <div className="card-pad">
            <SkeletonRows rows={4} height={52} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<BookmarkCheck size={26} />} title={t("reservations.empty")} subtitle={t("reservations.emptySubtitle")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>№</th>
                  <th>{t("reservations.customer")}</th>
                  <th>{t("reservations.items")}</th>
                  <th className="table-cell-num">{t("reservations.total")}</th>
                  <th>{t("reservations.until")}</th>
                  <th>{t("reservations.status")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono-num">{r.number}</td>
                    <td>
                      <strong>{r.customerName}</strong>
                      {r.phone && <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{r.phone}</div>}
                      {r.note && <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{r.note}</div>}
                    </td>
                    <td>
                      {r.items.map((i) => (
                        <div key={i.productId} style={{ fontSize: "var(--font-size-sm)" }}>
                          {i.name} × {formatNumber(i.quantity)} {unitLabel(i.unit)}
                        </div>
                      ))}
                      <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                        {formatDateTime(r.createdAt)} · {r.employeeName}
                        {r.locationName ? ` · ${r.locationName}` : ""}
                      </div>
                    </td>
                    <td className="table-cell-num">{formatMoney(r.total)}</td>
                    <td className="text-muted">{r.expiresAt ? formatDate(r.expiresAt) : t("reservations.noExpiry")}</td>
                    <td>
                      <Badge variant={STATUS_BADGE[r.status]}>{t(`reservations.statuses.${r.status}`)}</Badge>
                    </td>
                    <td>
                      {r.status === "ACTIVE" && (
                        <div className="table-actions">
                          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/pos?reservation=${r.id}`)}>
                            <ShoppingCart size={14} /> {t("reservations.sell")}
                          </button>
                          <a
                            className="btn btn-ghost btn-icon btn-sm"
                            href={whatsappShareLink(r.phone, reservationMessage(r, session?.business.name ?? ""))}
                            target="_blank"
                            rel="noreferrer"
                            title={t("reservations.whatsapp")}
                          >
                            <MessageCircle size={16} color="var(--color-success-text)" />
                          </a>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setCancelTarget(r)} title={t("reservations.cancel")}>
                            <Trash2 size={16} color="var(--color-danger-text)" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateReservationModal
        open={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          setTab("ACTIVE");
          load();
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        danger
        loading={cancelling}
        title={t("reservations.cancelTitle", { number: cancelTarget?.number })}
        description={t("reservations.cancelHint")}
        confirmLabel={t("reservations.cancel")}
        onConfirm={cancel}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}

function CreateReservationModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { locations, current, multiple } = useLocations();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(3);
  const [locationId, setLocationId] = useState("");
  const [lines, setLines] = useState<{ product: Product; quantity: number }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomerId("");
    setName("");
    setPhone("");
    setNote("");
    setDays(3);
    setLines([]);
    customerService.listCustomers().then(setCustomers).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (open && !locationId && current) setLocationId(current.id);
  }, [open, current, locationId]);

  function add(product: Product) {
    setLines((prev) => (prev.some((l) => l.product.id === product.id) ? prev.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l)) : [...prev, { product, quantity: 1 }]));
  }

  async function save() {
    if (lines.length === 0) {
      showToast({ variant: "error", title: t("reservations.noItems") });
      return;
    }
    setSaving(true);
    try {
      await reservationService.createReservation({
        customerId: customerId || null,
        customerName: name.trim() || null,
        phone: phone.trim() || null,
        note: note.trim() || null,
        expiresInDays: days,
        locationId: locationId || null,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      });
      showToast({ variant: "success", title: t("reservations.created") });
      onDone();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="wide">
      <div className="stack gap-4">
        <h2 className="card-title">{t("reservations.add")}</h2>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("reservations.pickCustomer")}</label>
            <select className="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">{t("reservations.newCustomer")}</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone ? `— ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </div>
          {!customerId && (
            <div className="field">
              <label className="field-label">{t("reservations.customerName")}</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label className="field-label">{t("reservations.phone")}</label>
            <input className="input" placeholder="0700 123 456" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{t("reservations.keepFor")}</label>
            <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d === 0 ? t("reservations.noExpiry") : t("reservations.days", { count: d })}
                </option>
              ))}
            </select>
          </div>
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
        </div>

        <ProductSearchBox locationId={locationId || undefined} placeholder={t("reservations.searchProduct")} onPick={(p) => add(p)} />

        {lines.length > 0 && (
          <div className="stack gap-2">
            {lines.map((l) => (
              <div key={l.product.id} className="row gap-2">
                <span style={{ flex: 1 }}>
                  <strong>{l.product.name}</strong>
                  <span className="text-muted"> · {formatMoney(l.product.salePrice)}</span>
                </span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="input"
                  style={{ width: 90 }}
                  value={l.quantity}
                  onChange={(e) => setLines((prev) => prev.map((x) => (x.product.id === l.product.id ? { ...x, quantity: Number(e.target.value) } : x)))}
                />
                <span className="text-muted" style={{ width: 40 }}>{unitLabel(l.product.unit)}</span>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))} aria-label={t("common.delete")}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <div className="row" style={{ fontWeight: 700 }}>
              <span className="spacer">{t("reservations.total")}</span>
              <span className="mono-num">{formatMoney(lines.reduce((s, l) => s + l.quantity * l.product.salePrice, 0))}</span>
            </div>
          </div>
        )}

        <div className="field">
          <label className="field-label">{t("reservations.note")}</label>
          <input className="input" placeholder={t("reservations.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? t("common.saving") : t("reservations.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
