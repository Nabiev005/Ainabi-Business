import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import { EmptyState } from "../../components/ui/EmptyState";
import { Skeleton } from "../../components/ui/Skeleton";
import { useToast } from "../../hooks/useToast";
import * as riskService from "../../services/risk.service";
import type { RiskLevel, RiskReport } from "../../services/risk.service";
import type { ReportPreset } from "../../services/report.service";
import { extractErrorMessage } from "../../services/api";
import { formatDateTime, formatMoney, formatNumber } from "../../utils/format";
import "./Risk.css";

const PRESETS: ReportPreset[] = ["7d", "30d", "month", "prevMonth"];
const LEVEL_BADGE: Record<RiskLevel, "success" | "info" | "warning" | "danger"> = { OK: "success", LOW: "info", MEDIUM: "warning", HIGH: "danger" };
/** Signals whose value is money (the rest are percents or counts). */
const MONEY_SIGNALS = new Set(["belowCost", "cashShort", "stockOut", "inventoryShortage"]);

export default function Risk() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [preset, setPreset] = useState<ReportPreset>("30d");
  const [data, setData] = useState<RiskReport | null>(null);

  useEffect(() => {
    setData(null);
    riskService
      .getRiskReport(preset)
      .then(setData)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [preset, showToast, t]);

  const flagged = data?.people.filter((p) => p.level !== "OK") ?? [];

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("risk.title")}</h1>
          <p className="page-subtitle">{t("risk.subtitle")}</p>
        </div>
      </div>

      <div className="card card-pad">
        <div className="tabs">
          {PRESETS.map((p) => (
            <button key={p} className={`tab ${preset === p ? "active" : ""}`} onClick={() => setPreset(p)}>
              {t(`reports.presets.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {!data ? (
        <div className="risk-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={160} radius="16px" />
          ))}
        </div>
      ) : data.people.length === 0 ? (
        <div className="card card-pad">
          <EmptyState title={t("reports.noData")} subtitle={t("reports.noDataSubtitle")} />
        </div>
      ) : (
        <>
          {flagged.length === 0 && (
            <div className="card card-pad risk-allclear">
              <ShieldCheck size={22} />
              <span>{t("risk.allClear")}</span>
            </div>
          )}

          <div className="risk-grid">
            {data.people.map((p) => (
              <div key={p.employeeId} className={`card card-pad risk-person risk-${p.level.toLowerCase()}`}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="stack">
                    <strong>{p.name}</strong>
                    <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                      {t("risk.sales", { count: p.salesCount })} · {formatMoney(p.revenue)}
                    </span>
                  </div>
                  <Badge variant={LEVEL_BADGE[p.level]}>
                    {p.level === "OK" ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />} {t(`risk.levels.${p.level}`)}
                  </Badge>
                </div>
                {p.signals.length === 0 ? (
                  <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                    {t("risk.noSignals")}
                  </span>
                ) : (
                  <ul className="risk-signals">
                    {p.signals.map((s) => (
                      <li key={s.key} className={s.weight === 2 ? "strong" : undefined}>
                        {t(`risk.signals.${s.key}`, {
                          value: MONEY_SIGNALS.has(s.key) ? formatMoney(s.value) : formatNumber(s.value),
                          cap: data.maxDiscountPercent,
                        })}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">{t("risk.eventsTitle")}</h2>
            </div>
            {data.events.length === 0 ? (
              <div className="card-pad">
                <EmptyState title={t("risk.noEvents")} subtitle={t("risk.noEventsSubtitle")} />
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("risk.table.when")}</th>
                      <th>{t("risk.table.who")}</th>
                      <th>{t("risk.table.what")}</th>
                      <th className="table-cell-num">{t("risk.table.amount")}</th>
                      <th>{t("risk.table.details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.events.map((e, i) => (
                      <tr key={i}>
                        <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                          {formatDateTime(e.at)}
                        </td>
                        <td>{e.employeeName}</td>
                        <td>{t(`risk.events.${e.type}`)}</td>
                        <td className="table-cell-num mono-num">{formatMoney(e.amount)}</td>
                        <td className="text-muted">
                          {e.saleNumber ? `№${e.saleNumber}` : ""}
                          {e.saleNumber && e.note ? " · " : ""}
                          {e.note ?? ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="field-hint">{t("risk.footnote")}</p>
        </>
      )}
    </div>
  );
}
