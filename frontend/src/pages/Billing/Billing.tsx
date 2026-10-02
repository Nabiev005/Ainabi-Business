import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, CreditCard, MessageCircle, Minus } from "lucide-react";
import { Skeleton } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import * as billingService from "../../services/billing.service";
import type { BillingData, Feature, PlanId } from "../../services/billing.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney } from "../../utils/format";
import "./Billing.css";

const ALL_FEATURES: Feature[] = ["receiving", "inventory", "repairs", "tasks", "pipeline", "analytics"];

export default function Billing() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [data, setData] = useState<BillingData | null>(null);
  const [chosen, setChosen] = useState<PlanId>("PRO");
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    billingService
      .getBilling()
      .then((d) => {
        setData(d);
        setChosen(d.subscription.plan);
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [showToast, t]);

  if (!data) {
    return (
      <div className="stack gap-6">
        <Skeleton height={140} radius="16px" />
        <Skeleton height={360} radius="16px" />
      </div>
    );
  }

  const sub = data.subscription;
  const plan = data.plans.find((p) => p.id === chosen)!;
  const amount = yearly ? plan.priceYearly : plan.priceMonthly;
  const limit = (n: number | null) => (n === null ? t("billing.unlimited") : String(n));
  const whatsappText = encodeURIComponent(
    t("billing.pay.whatsappMessage", {
      business: data.businessName,
      id: data.businessId,
      plan: t(`billing.plans.${chosen}.name`),
      period: yearly ? t("billing.year") : t("billing.month"),
      amount: formatMoney(amount),
    }),
  );

  async function copyId() {
    try {
      await navigator.clipboard.writeText(data!.businessId);
      showToast({ variant: "success", title: t("billing.pay.idCopied") });
    } catch {
      /* clipboard blocked — the id is visible anyway */
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("billing.title")}</h1>
          <p className="page-subtitle">{t("billing.subtitle")}</p>
        </div>
      </div>

      {/* Current subscription */}
      <div className={`card card-pad billing-current ${sub.active ? "" : "billing-current-expired"}`}>
        <div className="stack gap-1">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
            {t("billing.current")}
          </span>
          <div className="row gap-2" style={{ flexWrap: "wrap" }}>
            <strong style={{ fontSize: "var(--font-size-xl, 20px)" }}>{t(`billing.plans.${sub.plan}.name`)}</strong>
            {sub.isTrial && <Badge variant="info">{t("billing.trial")}</Badge>}
            {sub.active ? <Badge variant={sub.endingSoon ? "warning" : "success"}>{t("billing.active")}</Badge> : <Badge variant="danger">{t("billing.expired")}</Badge>}
          </div>
        </div>
        <div className="billing-current-facts">
          <div>
            <span>{sub.active ? t("billing.until") : t("billing.endedOn")}</span>
            <strong>{sub.expiresAt ? formatDate(sub.expiresAt) : "—"}</strong>
          </div>
          {sub.active && (
            <div>
              <span>{t("billing.daysLeftLabel")}</span>
              <strong>{sub.daysLeft}</strong>
            </div>
          )}
          <div>
            <span>{t("billing.employeesUsed")}</span>
            <strong>
              {data.usage.employees} / {limit(sub.maxEmployees)}
            </strong>
          </div>
          <div>
            <span>{t("billing.locationsUsed")}</span>
            <strong>
              {data.usage.locations} / {limit(sub.maxLocations)}
            </strong>
          </div>
        </div>
        {!sub.active && <p className="billing-expired-note">{t("billing.expiredNote")}</p>}
      </div>

      {/* Plans */}
      <div className="row gap-3" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className="card-title">{t("billing.choose")}</h2>
        <div className="tabs">
          <button className={`tab ${!yearly ? "active" : ""}`} onClick={() => setYearly(false)}>
            {t("billing.monthly")}
          </button>
          <button className={`tab ${yearly ? "active" : ""}`} onClick={() => setYearly(true)}>
            {t("billing.yearly")}
          </button>
        </div>
      </div>
      <div className="billing-plans">
        {data.plans.map((p) => (
          <button key={p.id} type="button" className={`card billing-plan ${chosen === p.id ? "billing-plan-chosen" : ""}`} onClick={() => setChosen(p.id)}>
            <div className="row gap-2" style={{ justifyContent: "space-between" }}>
              <strong className="billing-plan-name">{t(`billing.plans.${p.id}.name`)}</strong>
              {p.id === "PRO" && <Badge variant="info">{t("billing.popular")}</Badge>}
              {p.id === sub.plan && sub.active && <Badge variant="success">{t("billing.yourPlan")}</Badge>}
            </div>
            <span className="text-muted billing-plan-for">{t(`billing.plans.${p.id}.for`)}</span>
            <div className="billing-plan-price">
              <strong>{formatMoney(yearly ? p.priceYearly : p.priceMonthly)}</strong>
              <span className="text-muted">/ {yearly ? t("billing.year") : t("billing.month")}</span>
            </div>
            {yearly && <span className="billing-plan-save">{t("billing.yearlySave", { amount: formatMoney(p.priceMonthly * 12 - p.priceYearly) })}</span>}
            <ul className="billing-plan-list">
              <li>
                <Check size={14} /> {t("billing.coreFeatures")}
              </li>
              <li>
                <Check size={14} /> {t("billing.employeesLimit", { limit: limit(p.maxEmployees) })}
              </li>
              <li>
                <Check size={14} /> {t("billing.locationsLimit", { limit: limit(p.maxLocations) })}
              </li>
              {ALL_FEATURES.map((f) => (
                <li key={f} className={p.features.includes(f) ? "" : "billing-plan-missing"}>
                  {p.features.includes(f) ? <Check size={14} /> : <Minus size={14} />} {t(`billing.features.${f}`)}
                </li>
              ))}
              {p.id === "MAX" && (
                <li>
                  <Check size={14} /> {t("billing.prioritySupport")}
                </li>
              )}
            </ul>
          </button>
        ))}
      </div>

      {/* How to pay */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <CreditCard size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("billing.pay.title")}
          </h2>
        </div>
        <div className="card-pad stack gap-4">
          <ol className="billing-steps">
            <li>
              {t("billing.pay.step1", { plan: t(`billing.plans.${chosen}.name`), period: yearly ? t("billing.year") : t("billing.month") })}{" "}
              <strong className="mono-num">{formatMoney(amount)}</strong>
              {data.paymentInfo ? (
                <div className="billing-payinfo">{data.paymentInfo}</div>
              ) : (
                <div className="text-muted">{t("billing.pay.askDetails")}</div>
              )}
              {data.paymentQr && (
                <div className="billing-qr">
                  <img src={data.paymentQr} alt={t("billing.pay.qrAlt")} />
                  <span className="text-muted">{t("billing.pay.qrHint")}</span>
                </div>
              )}
            </li>
            <li>
              {t("billing.pay.step2")}
              <div className="row gap-2" style={{ marginTop: 6 }}>
                <code className="billing-id">{data.businessId}</code>
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={copyId} title={t("billing.pay.copyId")}>
                  <Copy size={14} />
                </button>
              </div>
            </li>
            <li>{t("billing.pay.step3")}</li>
          </ol>
          <a className="btn btn-primary" style={{ alignSelf: "flex-start" }} href={`https://wa.me/${data.supportWhatsapp}?text=${whatsappText}`} target="_blank" rel="noreferrer">
            <MessageCircle size={16} /> {t("billing.pay.sendReceipt")}
          </a>
          <span className="field-hint">{t("billing.pay.note")}</span>
        </div>
      </div>

      {data.payments.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{t("billing.history")}</h2>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("billing.historyDate")}</th>
                  <th>{t("billing.historyPlan")}</th>
                  <th>{t("billing.historyPeriod")}</th>
                  <th className="table-cell-num">{t("billing.historyAmount")}</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.createdAt)}</td>
                    <td>
                      {t(`billing.plans.${p.plan}.name`)} · {t("billing.monthsCount", { count: p.months })}
                    </td>
                    <td className="text-muted">
                      {formatDate(p.periodStart)} — {formatDate(p.periodEnd)}
                    </td>
                    <td className="table-cell-num">{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
