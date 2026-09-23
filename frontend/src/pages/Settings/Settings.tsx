import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Globe, QrCode, Save, User } from "lucide-react";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import * as settingsService from "../../services/settings.service";
import { extractErrorMessage } from "../../services/api";
import type { Business } from "../../types";
import { ProductSetup } from "./ProductSetup";

export default function Settings() {
  const { t } = useTranslation();
  const { session, updateSessionBusiness } = useAuth();
  const { showToast } = useToast();
  const [business, setBusiness] = useState<Business | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", currency: "KGS", qrPaymentInfo: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService
      .getBusiness()
      .then((b) => {
        setBusiness(b);
        setForm({ name: b.name, phone: b.phone ?? "", address: b.address ?? "", currency: b.currency, qrPaymentInfo: b.qrPaymentInfo ?? "" });
      })
      .catch(() => undefined);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await settingsService.updateBusiness(form);
      setBusiness(updated);
      updateSessionBusiness(updated);
      showToast({ variant: "success", title: t("settings.saved") });
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("settings.title")}</h1>
          <p className="page-subtitle">{t("settings.subtitle")}</p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{t("settings.businessInfo")}</h2>
        </div>
        <form className="card-pad stack gap-4" onSubmit={handleSave}>
          <div className="field">
            <label className="field-label">{t("settings.businessName")}</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="field-label">{t("settings.phone")}</label>
              <input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">{t("settings.address")}</label>
              <input className="input" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
            </div>
          </div>
          <div className="field" style={{ maxWidth: 200 }}>
            <label className="field-label">{t("settings.currency")}</label>
            <select className="select" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
              <option value="KGS">{t("settings.currencyKGS")}</option>
              <option value="USD">{t("settings.currencyUSD")}</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">
              <QrCode size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              {t("settings.qrPaymentInfo")}
            </label>
            <input
              className="input"
              placeholder={t("settings.qrPaymentInfoPlaceholder")}
              value={form.qrPaymentInfo}
              onChange={(e) => setForm((f) => ({ ...f, qrPaymentInfo: e.target.value }))}
            />
            <span className="field-hint">{t("settings.qrPaymentInfoHint")}</span>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving || !business}>
              <Save size={16} />
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      </div>

      {session?.role !== "CASHIER" && (
        <ProductSetup
          business={business}
          onBusinessChange={(updated) => {
            setBusiness(updated);
            updateSessionBusiness(updated);
          }}
        />
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <User size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("settings.profile")}
          </h2>
        </div>
        <div className="card-pad stack gap-2">
          <span>
            <strong>{session?.user.name}</strong>
          </span>
          <span className="text-muted">{session?.user.email}</span>
          {session?.user.phone && <span className="text-muted">{session.user.phone}</span>}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Globe size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("settings.language")}
          </h2>
        </div>
        <div className="card-pad row gap-3">
          <LanguageSwitcher />
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
            {t("settings.languageHint")}
          </span>
        </div>
      </div>
    </div>
  );
}
