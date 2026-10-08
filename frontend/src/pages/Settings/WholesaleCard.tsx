import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Handshake, Save } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import * as wholesaleService from "../../services/wholesale.service";
import { extractErrorMessage } from "../../services/api";

/** "We sell wholesale": puts this shop's wholesale price list on the Ainabi network. */
export function WholesaleCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    wholesaleService
      .getSettings()
      .then((s) => {
        setEnabled(s.wholesaleEnabled);
        setNote(s.wholesaleNote ?? "");
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    try {
      await wholesaleService.updateSettings({ enabled, note });
      showToast({ variant: "success", title: t("settings.saved") });
    } catch (error) {
      showToast({ variant: "error", title: t("settings.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <Handshake size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          {t("settings.wholesale.title")}
        </h2>
      </div>
      <div className="card-pad stack gap-4">
        <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
          {t("settings.wholesale.intro")}
        </p>
        <label className="row gap-2" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <strong>{t("settings.wholesale.enabled")}</strong>
        </label>
        <div className="field">
          <label className="field-label">{t("settings.wholesale.note")}</label>
          <textarea className="textarea" rows={2} placeholder={t("settings.wholesale.notePlaceholder")} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="row">
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={16} /> {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
