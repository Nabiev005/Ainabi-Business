import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Search } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { Modal } from "../../components/ui/Modal";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../hooks/useToast";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import * as billingService from "../../services/billing.service";
import type { PlanDefinition, PlanId, PlatformBusiness, PlatformPayments } from "../../services/billing.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney } from "../../utils/format";

/**
 * The platform owner's panel: every business on the platform, its
 * subscription, and recording a payment (which extends it right away).
 */
export default function Platform() {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [rows, setRows] = useState<PlatformBusiness[] | null>(null);
  const [plans, setPlans] = useState<PlanDefinition[]>([]);
  const [tab, setTab] = useState<"businesses" | "payments">("businesses");
  const [payments, setPayments] = useState<PlatformPayments | null>(null);
  const [target, setTarget] = useState<PlatformBusiness | null>(null);
  const [plan, setPlan] = useState<PlanId>("PRO");
  const [months, setMonths] = useState(1);
  const [days, setDays] = useState(0);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // One-click actions: renew the current plan for a month, or stop the business now.
  const [quick, setQuick] = useState<{ kind: "renew" | "block" | "free" | "unfree"; business: PlatformBusiness } | null>(null);

  const load = useCallback(() => {
    setRows(null);
    billingService
      .listPlatformBusinesses(debounced)
      .then((res) => {
        setPlans(res.plans);
        setRows(res.businesses);
      })
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [debounced, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadPayments = useCallback(() => {
    billingService
      .listPlatformPayments()
      .then(setPayments)
      .catch((error) => showToast({ variant: "error", title: t("common.loadFailed"), message: extractErrorMessage(error) }));
  }, [showToast, t]);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  async function runQuick() {
    if (!quick) return;
    const b = quick.business;
    setSaving(true);
    try {
      if (quick.kind === "renew") {
        const sub = await billingService.recordPayment(b.id, { plan: b.subscription.plan, months: 1, amount: priceOf(b.subscription.plan, 1), note: null });
        showToast({ variant: "success", title: t("platform.saved"), message: t("platform.savedMessage", { name: b.name, date: sub.expiresAt ? formatDate(sub.expiresAt) : "—" }) });
      } else if (quick.kind === "block") {
        await billingService.blockBusiness(b.id);
        showToast({ variant: "success", title: t("platform.blocked", { name: b.name }) });
      } else {
        await billingService.setComplimentary(b.id, quick.kind === "free");
        showToast({ variant: "success", title: t(quick.kind === "free" ? "platform.freeDone" : "platform.unfreeDone", { name: b.name }) });
      }
      setQuick(null);
      load();
      loadPayments();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  function open(b: PlatformBusiness) {
    setTarget(b);
    setPlan(b.subscription.plan);
    setMonths(1);
    setDays(0);
    setAmount(String(priceOf(b.subscription.plan, 1)));
    setNote("");
  }

  /** Expected price: 12 months = the yearly price, otherwise monthly × months. */
  function priceOf(planId: PlanId, m: number) {
    const p = plans.find((x) => x.id === planId);
    if (!p) return 0;
    return m === 12 ? p.priceYearly : p.priceMonthly * m;
  }

  function pick(nextPlan: PlanId, nextMonths: number) {
    setPlan(nextPlan);
    setMonths(nextMonths);
    setAmount(String(priceOf(nextPlan, nextMonths)));
  }

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      const sub = await billingService.recordPayment(target.id, { plan, months, days, amount: Number(amount) || 0, note: note || null });
      showToast({
        variant: "success",
        title: t("platform.saved"),
        message: t("platform.savedMessage", { name: target.name, date: sub.expiresAt ? formatDate(sub.expiresAt) : "—" }),
      });
      setTarget(null);
      load();
      loadPayments();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("platform.title")}</h1>
          <p className="page-subtitle">{t("platform.subtitle")}</p>
        </div>
        <div className="input-with-icon" style={{ minWidth: 260 }}>
          <Search size={16} />
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("platform.search")} />
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card card-pad stack gap-1">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>{t("platform.thisMonth")}</span>
          <strong className="mono-num" style={{ fontSize: "var(--font-size-2xl, 24px)" }}>{payments ? formatMoney(payments.thisMonth.amount) : "—"}</strong>
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{payments ? t("platform.paymentsCount", { count: payments.thisMonth.count }) : ""}</span>
        </div>
        <div className="card card-pad stack gap-1">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>{t("platform.allTime")}</span>
          <strong className="mono-num" style={{ fontSize: "var(--font-size-2xl, 24px)" }}>{payments ? formatMoney(payments.allTime) : "—"}</strong>
        </div>
        <div className="card card-pad stack gap-1">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>{t("platform.activePaid")}</span>
          <strong className="mono-num" style={{ fontSize: "var(--font-size-2xl, 24px)" }}>
            {rows ? rows.filter((b) => b.subscription.active && !b.subscription.isTrial).length : "—"}
          </strong>
          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
            {rows ? t("platform.trialsCount", { count: rows.filter((b) => b.subscription.active && b.subscription.isTrial).length }) : ""}
          </span>
        </div>
      </div>

      <div className="tabs" style={{ alignSelf: "flex-start" }}>
        <button className={`tab ${tab === "businesses" ? "active" : ""}`} onClick={() => setTab("businesses")}>
          {t("platform.tabBusinesses")}
        </button>
        <button className={`tab ${tab === "payments" ? "active" : ""}`} onClick={() => setTab("payments")}>
          {t("platform.tabPayments")}
        </button>
      </div>

      {tab === "payments" && (
        <div className="card">
          {payments === null ? (
            <div className="card-pad">
              <SkeletonRows rows={4} height={44} />
            </div>
          ) : payments.payments.length === 0 ? (
            <EmptyState icon={<Building2 size={26} />} title={t("platform.noPayments")} />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("billing.historyDate")}</th>
                    <th>{t("platform.business")}</th>
                    <th>{t("billing.historyPlan")}</th>
                    <th>{t("platform.until")}</th>
                    <th>{t("platform.note")}</th>
                    <th className="table-cell-num">{t("billing.historyAmount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="text-muted">{formatDateTime(p.createdAt)}</td>
                      <td>
                        <div className="stack gap-1">
                          <strong>{p.businessName}</strong>
                          <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>{p.ownerEmail}</span>
                        </div>
                      </td>
                      <td>
                        {t(`billing.plans.${p.plan}.name`)} · {t("billing.monthsCount", { count: p.months })}
                      </td>
                      <td className="text-muted">{formatDate(p.periodEnd)}</td>
                      <td className="text-muted">{p.note ?? "—"}</td>
                      <td className="table-cell-num" style={{ fontWeight: 700 }}>{formatMoney(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "businesses" && (
      <div className="card">
        {rows === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={52} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Building2 size={26} />} title={t("platform.empty")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("platform.business")}</th>
                  <th>{t("platform.owner")}</th>
                  <th>{t("platform.plan")}</th>
                  <th>{t("platform.until")}</th>
                  <th className="table-cell-num">{t("platform.activity")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <div className="stack gap-1">
                        <strong>{b.name}</strong>
                        <code className="text-muted" style={{ fontSize: 11 }}>
                          {b.id}
                        </code>
                      </div>
                    </td>
                    <td>
                      <div className="stack gap-1">
                        <span>{b.ownerName}</span>
                        <span className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                          {b.ownerEmail}
                          {b.ownerPhone ? ` · ${b.ownerPhone}` : ""}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="row gap-1" style={{ flexWrap: "wrap" }}>
                        <Badge variant="neutral">{t(`billing.plans.${b.subscription.plan}.name`)}</Badge>
                        {b.subscription.complimentary ? (
                          <Badge variant="success">{t("platform.free")}</Badge>
                        ) : (
                          b.subscription.isTrial && <Badge variant="info">{t("billing.trial")}</Badge>
                        )}
                      </div>
                    </td>
                    <td>
                      {b.subscription.complimentary ? (
                        <Badge variant="success">{t("platform.forever")}</Badge>
                      ) : b.subscription.active ? (
                        <Badge variant={b.subscription.endingSoon ? "warning" : "success"}>
                          {b.subscription.expiresAt ? formatDate(b.subscription.expiresAt) : "—"} · {t("platform.daysLeft", { count: b.subscription.daysLeft })}
                        </Badge>
                      ) : (
                        <Badge variant="danger">
                          {t("billing.expired")} {b.subscription.expiresAt ? formatDate(b.subscription.expiresAt) : ""}
                        </Badge>
                      )}
                    </td>
                    <td className="table-cell-num text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                      {t("platform.activityValue", { sales: b.sales, products: b.products, employees: b.employees })}
                      <br />
                      {b.lastSaleAt ? formatDateTime(b.lastSaleAt) : "—"}
                    </td>
                    <td>
                      {b.subscription.complimentary ? (
                        <button className="btn btn-secondary btn-sm" onClick={() => setQuick({ kind: "unfree", business: b })}>
                          {t("platform.unfree")}
                        </button>
                      ) : (
                      <div className="stack gap-1" style={{ alignItems: "stretch", minWidth: 150 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => setQuick({ kind: "renew", business: b })}>
                          {t("platform.renewMonth", { amount: formatMoney(priceOf(b.subscription.plan, 1)) })}
                        </button>
                        <div className="row gap-1">
                          <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => open(b)}>
                            {t("platform.otherPayment")}
                          </button>
                          {b.subscription.active && (
                            <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-danger-text)" }} onClick={() => setQuick({ kind: "block", business: b })}>
                              {t("platform.block")}
                            </button>
                          )}
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => setQuick({ kind: "free", business: b })}>
                          {t("platform.makeFree")}
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

      )}
      <ConfirmDialog
        open={!!quick}
        danger={quick?.kind === "block"}
        loading={saving}
        title={
          quick?.kind === "block"
            ? t("platform.blockTitle", { name: quick.business.name })
            : quick?.kind === "free"
              ? t("platform.freeTitle", { name: quick.business.name })
              : quick?.kind === "unfree"
                ? t("platform.unfreeTitle", { name: quick.business.name })
                : t("platform.renewTitle", { name: quick?.business.name ?? "" })
        }
        description={
          quick?.kind === "block"
            ? t("platform.blockText")
            : quick?.kind === "free"
              ? t("platform.freeText")
              : quick?.kind === "unfree"
                ? t("platform.unfreeText")
                : quick
              ? t("platform.renewText", {
                  plan: t(`billing.plans.${quick.business.subscription.plan}.name`),
                  amount: formatMoney(priceOf(quick.business.subscription.plan, 1)),
                })
              : ""
        }
        confirmLabel={
          quick?.kind === "block" ? t("platform.block") : quick?.kind === "free" ? t("platform.makeFree") : quick?.kind === "unfree" ? t("platform.unfree") : t("platform.renewConfirm")
        }
        onConfirm={runQuick}
        onCancel={() => setQuick(null)}
      />

      <Modal open={!!target} onClose={() => setTarget(null)}>
        {target && (
          <form
            className="stack gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <div className="stack gap-1">
              <h2 className="card-title">{t("platform.modalTitle")}</h2>
              <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
                {target.name} · {target.ownerEmail}
              </span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="field-label">{t("platform.plan")}</label>
                <select className="select" value={plan} onChange={(e) => pick(e.target.value as PlanId, months)}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {t(`billing.plans.${p.id}.name`)} — {formatMoney(p.priceMonthly)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field-label">{t("platform.months")}</label>
                <select className="select" value={months} onChange={(e) => pick(plan, Number(e.target.value))}>
                  {[0, 1, 2, 3, 6, 12].map((m) => (
                    <option key={m} value={m}>
                      {m === 0 ? t("platform.planOnly") : t("billing.monthsCount", { count: m })}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="field-label">{t("platform.amount")}</label>
                <input type="number" min={0} className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">{t("platform.freeDays")}</label>
                <input type="number" min={0} max={366} className="input" value={days || ""} placeholder="0" onChange={(e) => setDays(Math.max(0, Number(e.target.value) || 0))} />
              </div>
            </div>

            <div className="field">
              <label className="field-label">{t("platform.note")}</label>
              <input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder={t("platform.notePlaceholder")} />
            </div>

            <p className="field-hint" style={{ margin: 0 }}>
              {t("platform.hint")}
            </p>

            <div className="row gap-3" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setTarget(null)} disabled={saving}>
                {t("common.cancel")}
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving || (months === 0 && days === 0 && plan === target.subscription.plan)}>
                {saving ? t("common.saving") : t("platform.confirm")}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
