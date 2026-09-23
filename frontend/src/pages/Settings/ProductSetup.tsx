import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  Car,
  Check,
  Hammer,
  Laptop,
  LayoutGrid,
  Pill,
  Plus,
  Save,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Sparkles,
  Store,
  Trash2,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import * as settingsService from "../../services/settings.service";
import { extractErrorMessage } from "../../services/api";
import type { Business, BusinessModules, BusinessTemplate, ProductFieldDef, ProductFieldType } from "../../types";
import "./Settings.css";

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  store: Store,
  smartphone: Smartphone,
  laptop: Laptop,
  tv: Tv,
  shirt: Shirt,
  "shopping-basket": ShoppingBasket,
  pill: Pill,
  sparkles: Sparkles,
  car: Car,
  hammer: Hammer,
};

const FIELD_TYPES: ProductFieldType[] = ["text", "number", "select", "boolean", "date"];

const MODULE_KEYS: (keyof BusinessModules)[] = [
  "trackSerials",
  "trackWarranty",
  "trackExpiry",
  "weightBarcodes",
  "checkPrescription",
  "enableRepairs",
  "requireShift",
];

function modulesOf(business: Business | null): BusinessModules {
  return {
    trackSerials: !!business?.trackSerials,
    trackWarranty: !!business?.trackWarranty,
    trackExpiry: !!business?.trackExpiry,
    enableRepairs: !!business?.enableRepairs,
    requireShift: !!business?.requireShift,
    weightBarcodes: !!business?.weightBarcodes,
    checkPrescription: !!business?.checkPrescription,
  };
}

/** Editable row — select options are edited as one comma-separated string
 * so typing "8GB, 16GB" doesn't get reformatted under the cursor. */
type FieldRow = ProductFieldDef & { optionsText: string };

function toRows(fields: ProductFieldDef[] | undefined): FieldRow[] {
  return (fields ?? []).map((f) => ({ ...f, optionsText: (f.options ?? []).join(", ") }));
}

function newFieldKey() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

interface ProductSetupProps {
  business: Business | null;
  onBusinessChange: (business: Business) => void;
}

export function ProductSetup({ business, onBusinessChange }: ProductSetupProps) {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const { showToast } = useToast();
  const isOwner = session?.role === "OWNER";

  const [templates, setTemplates] = useState<BusinessTemplate[]>([]);
  const [selectedType, setSelectedType] = useState<string>("");
  const [addCategories, setAddCategories] = useState(true);
  const [addFields, setAddFields] = useState(true);
  const [applying, setApplying] = useState(false);

  const [rows, setRows] = useState<FieldRow[]>([]);
  const [modules, setModules] = useState<BusinessModules>(modulesOf(null));
  const [saving, setSaving] = useState(false);

  // Template labels come back in the request language — refetch on switch.
  useEffect(() => {
    settingsService.listTemplates().then(setTemplates).catch(() => undefined);
  }, [i18n.language]);

  useEffect(() => {
    if (!business) return;
    setSelectedType(business.businessType ?? "GENERAL");
    setRows(toRows(business.productFields));
    setModules(modulesOf(business));
  }, [business]);

  const selectedTemplate = templates.find((tpl) => tpl.id === selectedType);
  const isCurrentType = selectedType === (business?.businessType ?? "GENERAL");

  async function handleApplyTemplate() {
    if (!selectedTemplate) return;
    setApplying(true);
    try {
      const updated = await settingsService.applyTemplate({ businessType: selectedTemplate.id, addCategories, addFields });
      onBusinessChange(updated);
      showToast({ variant: "success", title: t("settings.productSetup.templateApplied", { name: selectedTemplate.name }) });
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setApplying(false);
    }
  }

  function updateRow(index: number, patch: Partial<FieldRow>) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function moveRow(index: number, delta: number) {
    setRows((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: newFieldKey(), label: "", type: "text", required: false, showInList: false, optionsText: "" },
    ]);
  }

  async function handleSaveFields() {
    const productFields: ProductFieldDef[] = [];
    for (const row of rows) {
      const label = row.label.trim();
      if (!label) {
        showToast({ variant: "error", title: t("settings.productSetup.fieldLabelRequired") });
        return;
      }
      const options = row.optionsText
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
      if (row.type === "select" && options.length === 0) {
        showToast({ variant: "error", title: t("settings.productSetup.fieldOptionsRequired", { label }) });
        return;
      }
      productFields.push({
        key: row.key,
        label,
        type: row.type,
        ...(row.type === "select" ? { options: [...new Set(options)] } : {}),
        required: row.required,
        showInList: row.showInList,
      });
    }

    setSaving(true);
    try {
      const updated = await settingsService.updateProductConfig({ productFields, ...modules });
      onBusinessChange(updated);
      showToast({ variant: "success", title: t("settings.saved") });
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <LayoutGrid size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("settings.productSetup.typeTitle")}
          </h2>
        </div>
        <div className="card-pad stack gap-4">
          <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            {t("settings.productSetup.typeHint")}
          </p>
          <div className="business-type-grid">
            {templates.map((tpl) => {
              const Icon = TEMPLATE_ICONS[tpl.icon] ?? Store;
              const isActive = tpl.id === (business?.businessType ?? "GENERAL");
              return (
                <button
                  key={tpl.id}
                  type="button"
                  className={`business-type-card ${selectedType === tpl.id ? "selected" : ""}`}
                  onClick={() => setSelectedType(tpl.id)}
                  disabled={!isOwner}
                >
                  <span className="business-type-icon">
                    <Icon size={20} />
                  </span>
                  <span className="business-type-name">
                    {tpl.name}
                    {isActive && <Check size={14} className="business-type-current" />}
                  </span>
                  <span className="business-type-desc">{tpl.description}</span>
                </button>
              );
            })}
          </div>

          {isOwner && selectedTemplate && (
            <div className="business-type-apply">
              <div className="stack gap-2">
                <strong>{selectedTemplate.name}</strong>
                {selectedTemplate.categories.length > 0 && (
                  <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                    {t("settings.productSetup.templateCategories")}: {selectedTemplate.categories.join(", ")}
                  </span>
                )}
                {selectedTemplate.fields.length > 0 && (
                  <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                    {t("settings.productSetup.templateFields")}: {selectedTemplate.fields.map((f) => f.label).join(", ")}
                  </span>
                )}
                <label className="setup-check">
                  <input type="checkbox" checked={addCategories} onChange={(e) => setAddCategories(e.target.checked)} />
                  {t("settings.productSetup.addCategories")}
                </label>
                <label className="setup-check">
                  <input type="checkbox" checked={addFields} onChange={(e) => setAddFields(e.target.checked)} />
                  {t("settings.productSetup.addFields")}
                </label>
                <span className="field-hint">{t("settings.productSetup.applyHint")}</span>
              </div>
              <div>
                <button type="button" className="btn btn-primary" onClick={handleApplyTemplate} disabled={applying}>
                  <Check size={16} />
                  {applying
                    ? t("common.saving")
                    : isCurrentType
                      ? t("settings.productSetup.reapply")
                      : t("settings.productSetup.apply")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t("settings.productSetup.modulesTitle")}</h2>
        </div>
        <div className="card-pad stack gap-4">
          <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
            {t("settings.productSetup.modulesHint")}
          </p>

          <div className="modules-grid">
            {MODULE_KEYS.map((key) => (
              <label key={key} className={`module-toggle ${modules[key] ? "on" : ""}`}>
                <input type="checkbox" checked={modules[key]} onChange={(e) => setModules((m) => ({ ...m, [key]: e.target.checked }))} />
                <span>
                  <strong>{t(`settings.productSetup.modules.${key}.title`)}</strong>
                  <span className="field-hint" style={{ display: "block" }}>
                    {t(`settings.productSetup.modules.${key}.hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="stack gap-1" style={{ marginTop: "var(--space-2)" }}>
            <h3 className="card-title" style={{ fontSize: "var(--font-size-md)" }}>{t("settings.productSetup.fieldsTitle")}</h3>
            <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
              {t("settings.productSetup.fieldsHint")}
            </p>
          </div>

          {rows.length === 0 ? (
            <div className="setup-empty">{t("settings.productSetup.noFields")}</div>
          ) : (
            <div className="stack gap-3">
              {rows.map((row, index) => (
                <div className="field-row" key={row.key}>
                  <div className="field-row-main">
                    <input
                      className="input"
                      placeholder={t("settings.productSetup.fieldLabelPlaceholder")}
                      value={row.label}
                      onChange={(e) => updateRow(index, { label: e.target.value })}
                    />
                    <select
                      className="select"
                      value={row.type}
                      onChange={(e) => updateRow(index, { type: e.target.value as ProductFieldType })}
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`settings.productSetup.types.${type}`)}
                        </option>
                      ))}
                    </select>
                    <div className="field-row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => moveRow(index, -1)}
                        disabled={index === 0}
                        aria-label={t("settings.productSetup.moveUp")}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => moveRow(index, 1)}
                        disabled={index === rows.length - 1}
                        aria-label={t("settings.productSetup.moveDown")}
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        aria-label={t("settings.productSetup.removeField")}
                      >
                        <Trash2 size={14} color="var(--color-danger-text)" />
                      </button>
                    </div>
                  </div>
                  {row.type === "select" && (
                    <input
                      className="input"
                      placeholder={t("settings.productSetup.optionsPlaceholder")}
                      value={row.optionsText}
                      onChange={(e) => updateRow(index, { optionsText: e.target.value })}
                    />
                  )}
                  <div className="row gap-4">
                    <label className="setup-check">
                      <input type="checkbox" checked={row.required} onChange={(e) => updateRow(index, { required: e.target.checked })} />
                      {t("settings.productSetup.required")}
                    </label>
                    <label className="setup-check">
                      <input type="checkbox" checked={row.showInList} onChange={(e) => updateRow(index, { showInList: e.target.checked })} />
                      {t("settings.productSetup.showInList")}
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="row gap-3">
            <button type="button" className="btn btn-secondary" onClick={addRow} disabled={rows.length >= 30}>
              <Plus size={16} />
              {t("settings.productSetup.addField")}
            </button>
            <button type="button" className="btn btn-primary" onClick={handleSaveFields} disabled={saving || !business}>
              <Save size={16} />
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
