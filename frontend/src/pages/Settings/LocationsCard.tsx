import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, MapPin, Plus, Save, SquarePen, X } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import { useAuth } from "../../hooks/useAuth";
import { useLocations } from "../../hooks/useLocations";
import * as settingsService from "../../services/settings.service";
import { extractErrorMessage } from "../../services/api";
import { formatNumber } from "../../utils/format";

/** Branches / warehouses: each has its own stock; sales, receipts and counts happen at one. */
export function LocationsCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { session } = useAuth();
  const { allLocations, reload } = useLocations();
  const isOwner = session?.role === "OWNER";
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState({ name: "", address: "" });
  const [saving, setSaving] = useState(false);

  function startEdit(id: string | "new") {
    const location = allLocations.find((l) => l.id === id);
    setForm({ name: location?.name ?? "", address: location?.address ?? "" });
    setEditing(id);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing === "new") await settingsService.createLocation(form);
      else if (editing) await settingsService.updateLocation(editing, form);
      setEditing(null);
      reload();
      showToast({ variant: "success", title: t("settings.saved") });
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(id: string, archived: boolean) {
    const location = allLocations.find((l) => l.id === id);
    if (!location) return;
    try {
      await settingsService.updateLocation(id, { name: location.name, address: location.address, archived });
      reload();
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    }
  }

  const editor = (
    <div className="stack gap-2" style={{ padding: "var(--space-3) 0" }}>
      <div className="form-grid">
        <input
          className="input"
          autoFocus
          placeholder={t("settings.locations.namePlaceholder")}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <input
          className="input"
          placeholder={t("settings.locations.addressPlaceholder")}
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
        />
      </div>
      <div className="row gap-2">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || !form.name.trim()}>
          <Save size={14} /> {saving ? t("common.saving") : t("common.save")}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
          <X size={14} /> {t("common.cancel")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <MapPin size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("settings.locations.title")}
          </h2>
          <p className="card-subtitle">{t("settings.locations.subtitle")}</p>
        </div>
        {isOwner && editing === null && (
          <button className="btn btn-secondary btn-sm" onClick={() => startEdit("new")}>
            <Plus size={14} /> {t("settings.locations.add")}
          </button>
        )}
      </div>
      <div className="card-pad" style={{ paddingTop: 0 }}>
        {editing === "new" && editor}
        {allLocations.map((location) =>
          editing === location.id ? (
            <div key={location.id}>{editor}</div>
          ) : (
            <div key={location.id} className="location-row">
              <div className="location-row-main">
                <div className="row gap-2">
                  <strong>{location.name}</strong>
                  {location.isDefault && <Badge variant="info">{t("settings.locations.default")}</Badge>}
                  {location.archived && <Badge variant="neutral">{t("settings.locations.archived")}</Badge>}
                </div>
                <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                  {[location.address, t("settings.locations.stats", { employees: location.employeeCount, stock: formatNumber(location.stockQuantity) })]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {isOwner && (
                <div className="row gap-1">
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => startEdit(location.id)} aria-label={t("common.edit")}>
                    <SquarePen size={15} />
                  </button>
                  {!location.isDefault && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => toggleArchive(location.id, !location.archived)}
                      title={location.archived ? t("settings.locations.restore") : t("settings.locations.archive")}
                    >
                      <Archive size={15} /> {location.archived ? t("settings.locations.restore") : t("settings.locations.archive")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
