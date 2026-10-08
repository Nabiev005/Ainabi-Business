import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DollarSign, RefreshCw, Save } from "lucide-react";
import { useToast } from "../../hooks/useToast";
import * as currencyService from "../../services/currency.service";
import type { CurrencySettings } from "../../services/currency.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatNumber } from "../../utils/format";

const ROUNDING = [1, 5, 10, 50, 100];

/** Dollar rate for USD-priced goods: НБКР's rate refreshed daily, or typed in by hand. */
export function CurrencyCard() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [data, setData] = useState<CurrencySettings | null>(null);
  const [auto, setAuto] = useState(true);
  const [rate, setRate] = useState("");
  const [rounding, setRounding] = useState(10);
  const [saving, setSaving] = useState(false);

  function apply(d: CurrencySettings) {
    setData(d);
    setAuto(d.usdRateAuto);
    setRate(d.usdRate ? String(d.usdRate) : d.nbkrRate ? String(d.nbkrRate) : "");
    setRounding(d.priceRounding);
  }

  useEffect(() => {
    currencyService.getCurrency().then(apply).catch(() => undefined);
  }, []);

  async function save() {
    setSaving(true);
    try {
      apply(await currencyService.updateCurrency({ usdRateAuto: auto, usdRate: auto ? null : Number(rate), priceRounding: rounding }));
      showToast({ variant: "success", title: t("settings.currency.saved") });
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
          <DollarSign size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          {t("settings.currency.title")}
        </h2>
      </div>
      <div className="card-pad stack gap-4">
        <p className="text-muted" style={{ margin: 0, fontSize: "var(--font-size-sm)" }}>
          {t("settings.currency.intro")}
        </p>
        {data && (
          <div className="row gap-4" style={{ flexWrap: "wrap", fontSize: "var(--font-size-sm)" }}>
            <span>
              {t("settings.currency.nbkr")}: <strong className="mono-num">{data.nbkrRate ? formatNumber(data.nbkrRate) : "—"}</strong>
            </span>
            <span>
              {t("settings.currency.current")}: <strong className="mono-num">{data.usdRate ? formatNumber(data.usdRate) : "—"}</strong>
              {data.usdRateDate && <span className="text-muted"> ({formatDate(data.usdRateDate)})</span>}
            </span>
            <span>{t("settings.currency.products", { count: data.usdProducts })}</span>
          </div>
        )}

        <div className="tabs">
          <button type="button" className={`tab ${auto ? "active" : ""}`} onClick={() => setAuto(true)}>
            <RefreshCw size={14} /> {t("settings.currency.auto")}
          </button>
          <button type="button" className={`tab ${!auto ? "active" : ""}`} onClick={() => setAuto(false)}>
            {t("settings.currency.manual")}
          </button>
        </div>

        <div className="form-grid">
          {!auto && (
            <div className="field">
              <label className="field-label">{t("settings.currency.rate")}</label>
              <input type="number" step="0.0001" min={0} className="input" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label className="field-label">{t("settings.currency.rounding")}</label>
            <select className="select" value={rounding} onChange={(e) => setRounding(Number(e.target.value))}>
              {ROUNDING.map((r) => (
                <option key={r} value={r}>
                  {t("settings.currency.roundTo", { step: r })}
                </option>
              ))}
            </select>
            <span className="field-hint">{t("settings.currency.roundingHint")}</span>
          </div>
        </div>

        <div className="row">
          <button className="btn btn-primary" onClick={save} disabled={saving || (!auto && !(Number(rate) > 0))}>
            <Save size={16} /> {saving ? t("common.saving") : t("settings.currency.apply")}
          </button>
        </div>
      </div>
    </div>
  );
}
