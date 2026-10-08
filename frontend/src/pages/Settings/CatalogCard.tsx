import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Download, ExternalLink, Save, Store } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import * as catalogService from "../../services/catalog.service";
import { extractErrorMessage } from "../../services/api";
import { generateQrDataUrl } from "../../utils/qr";

/** The public shop window: on/off, its link (for the Instagram bio), WhatsApp for orders, and a QR to print. */
export function CatalogCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [form, setForm] = useState({ enabled: false, slug: "", whatsapp: "", showStock: false, note: "" });
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    catalogService
      .getCatalogSettings()
      .then((c) => {
        setForm({ enabled: c.catalogEnabled, slug: c.catalogSlug ?? "", whatsapp: c.catalogWhatsapp ?? "", showStock: c.catalogShowStock, note: c.catalogNote ?? "" });
        setSavedSlug(c.catalogSlug);
        setSavedEnabled(c.catalogEnabled);
      })
      .catch(() => undefined);
  }, []);

  const link = savedSlug && savedEnabled ? catalogService.catalogUrl(savedSlug) : null;

  useEffect(() => {
    if (!link) return setQr(null);
    generateQrDataUrl(link).then(setQr).catch(() => setQr(null));
  }, [link]);

  async function save() {
    setSaving(true);
    try {
      const c = await catalogService.updateCatalogSettings(form);
      setSavedSlug(c.catalogSlug);
      setSavedEnabled(c.catalogEnabled);
      showToast({ variant: "success", title: t("settings.saved") });
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ variant: "success", title: t("settings.catalog.copied") });
    } catch {
      /* clipboard blocked — the link is on screen anyway */
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <Store size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          {t("settings.catalog.title")}
        </h2>
      </div>
      <div className="card-pad stack gap-4">
        <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
          {t("settings.catalog.intro")}
        </p>

        <label className="row gap-2" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} />
          <strong>{t("settings.catalog.enabled")}</strong>
        </label>

        <div className="form-grid">
          <div className="field">
            <label className="field-label">{t("settings.catalog.slug")}</label>
            <div className="row gap-1" style={{ alignItems: "center" }}>
              <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", whiteSpace: "nowrap" }}>
                {window.location.host}/c/
              </span>
              <input className="input" placeholder="my-shop" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">{t("settings.catalog.whatsapp")}</label>
            <input className="input" placeholder="0700 123 456" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} />
          </div>
        </div>

        <div className="field">
          <label className="field-label">{t("settings.catalog.note")}</label>
          <textarea className="textarea" rows={2} placeholder={t("settings.catalog.notePlaceholder")} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </div>

        <label className="row gap-2" style={{ cursor: "pointer", fontSize: "var(--font-size-sm)" }}>
          <input type="checkbox" checked={form.showStock} onChange={(e) => setForm((f) => ({ ...f, showStock: e.target.checked }))} />
          {t("settings.catalog.showStock")}
        </label>

        <div className="row">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>

        {link && (
          <div className="row gap-4" style={{ flexWrap: "wrap", alignItems: "center", padding: "var(--space-3)", borderRadius: 12, background: "var(--color-surface-muted)" }}>
            {qr && <img src={qr} alt="QR" width={110} height={110} style={{ borderRadius: 8 }} />}
            <div className="stack gap-2" style={{ minWidth: 0 }}>
              <a href={link} target="_blank" rel="noreferrer" style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                {link}
              </a>
              <div className="row gap-2" style={{ flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={copy}>
                  <Copy size={14} /> {t("settings.catalog.copy")}
                </button>
                <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {t("settings.catalog.open")}
                </a>
                {qr && (
                  <a className="btn btn-secondary btn-sm" href={qr} download={`catalog-${savedSlug}.png`}>
                    <Download size={14} /> {t("settings.catalog.downloadQr")}
                  </a>
                )}
              </div>
              <span className="field-hint">{t("settings.catalog.instagramHint")}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
