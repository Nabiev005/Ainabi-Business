import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleDollarSign, Phone, Plus, Wallet } from "lucide-react";
import { EmptyState } from "../../components/ui/EmptyState";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { Badge } from "../../components/ui/Badge";
import { AddDebtModal } from "./AddDebtModal";
import { DebtPaymentModal } from "./DebtPaymentModal";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as debtService from "../../services/debt.service";
import * as customerService from "../../services/customer.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatMoney } from "../../utils/format";
import type { Customer, Debt, PaymentMethod } from "../../types";
import "./Debts.css";
import { usePermissions } from "../../hooks/usePermissions";

export default function Debts() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const { showToast } = useToast();
  const labels = useLabels();
  const [debts, setDebts] = useState<Debt[] | null>(null);
  const [summary, setSummary] = useState<debtService.DebtSummary | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showOnlyOpen, setShowOnlyOpen] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [payTarget, setPayTarget] = useState<Debt | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const load = useCallback(() => {
    setDebts(null);
    debtService
      .listDebts(showOnlyOpen ? "OPEN" : "ALL")
      .then(setDebts)
      .catch((error) => showToast({ variant: "error", title: t("debts.loadFailed"), message: extractErrorMessage(error) }));
    debtService.getDebtSummary().then(setSummary).catch(() => undefined);
  }, [showOnlyOpen, showToast, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    customerService.listCustomers().then(setCustomers).catch(() => undefined);
  }, []);

  async function handleAddDebt(values: { customerId: string; totalAmount: number; comment?: string }) {
    setAddSubmitting(true);
    try {
      await debtService.createDebt(values);
      showToast({ variant: "success", title: t("debts.added") });
      setAddOpen(false);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("common.saveFailed"), message: extractErrorMessage(error) });
    } finally {
      setAddSubmitting(false);
    }
  }

  async function handlePayment(values: { amount: number; method: Exclude<PaymentMethod, "DEBT">; comment?: string }) {
    if (!payTarget) return;
    setPaySubmitting(true);
    try {
      await debtService.addDebtPayment(payTarget.id, values);
      showToast({ variant: "success", title: t("debts.paymentAcceptedTitle"), message: formatMoney(values.amount) });
      setPayTarget(null);
      load();
    } catch (error) {
      showToast({ variant: "error", title: t("debts.paymentNotAcceptedTitle"), message: extractErrorMessage(error) });
    } finally {
      setPaySubmitting(false);
    }
  }

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("debts.title")}</h1>
          <p className="page-subtitle">{t("debts.subtitle")}</p>
        </div>
        {can("debts.create") && (
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Plus size={18} />
            {t("debts.add")}
          </button>
        )}
      </div>

      <div
        className="card card-pad row gap-4 debts-summary-banner animate-in"
        style={{ background: "linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700))", color: "#fff" }}
      >
        <div style={{ width: 48, height: 48, borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Wallet size={24} />
        </div>
        <div className="stack gap-1">
          <span style={{ opacity: 0.85, fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("debts.summaryTotal")}</span>
          <span style={{ fontSize: "var(--font-size-3xl)", fontWeight: 800 }} className="mono-num">
            {summary ? formatMoney(summary.totalOutstanding) : "—"}
          </span>
        </div>
        <span className="spacer" />
        {summary && (
          <div className="stack gap-1" style={{ textAlign: "right" }}>
            <span style={{ opacity: 0.85, fontSize: "var(--font-size-sm)" }}>{t("debts.summaryOpenCount")}</span>
            <span style={{ fontSize: "var(--font-size-xl)", fontWeight: 700 }}>{summary.openDebts}</span>
          </div>
        )}
      </div>

      <div className="card">
        <div className="filter-bar">
          <div className="tabs">
            <button className={`tab ${showOnlyOpen ? "active" : ""}`} onClick={() => setShowOnlyOpen(true)}>
              {t("debts.tabOpen")}
            </button>
            <button className={`tab ${!showOnlyOpen ? "active" : ""}`} onClick={() => setShowOnlyOpen(false)}>
              {t("debts.tabAll")}
            </button>
          </div>
        </div>

        {debts === null ? (
          <div className="card-pad">
            <SkeletonRows rows={5} height={52} />
          </div>
        ) : debts.length === 0 ? (
          <EmptyState icon={<CircleDollarSign size={26} />} title={t("debts.empty")} subtitle={t("debts.emptySubtitle")} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("debts.table.customer")}</th>
                  <th>{t("debts.table.phone")}</th>
                  <th className="table-cell-num">{t("debts.table.total")}</th>
                  <th className="table-cell-num">{t("debts.table.paid")}</th>
                  <th className="table-cell-num">{t("debts.table.remaining")}</th>
                  <th>{t("debts.table.status")}</th>
                  <th>{t("debts.table.date")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {debts.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 700 }}>{d.customerName}</td>
                    <td className="text-muted">
                      {d.customerPhone ? (
                        <span className="row gap-1">
                          <Phone size={13} /> {d.customerPhone}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="table-cell-num">{formatMoney(d.totalAmount)}</td>
                    <td className="table-cell-num">{formatMoney(d.paidAmount)}</td>
                    <td className="table-cell-num" style={{ fontWeight: 700 }}>{formatMoney(d.remainingAmount)}</td>
                    <td>
                      <Badge variant={d.status === "PAID" ? "success" : d.status === "PARTIAL" ? "warning" : "danger"}>{labels.debtStatus[d.status]}</Badge>
                    </td>
                    <td className="text-muted">{formatDate(d.createdAt)}</td>
                    <td>
                      {d.status !== "PAID" && can("debts.collect") && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setPayTarget(d)}>
                          {t("debts.acceptPayment")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddDebtModal open={addOpen} onClose={() => setAddOpen(false)} customers={customers} submitting={addSubmitting} onSubmit={handleAddDebt} />
      <DebtPaymentModal open={!!payTarget} onClose={() => setPayTarget(null)} debt={payTarget} submitting={paySubmitting} onSubmit={handlePayment} />
    </div>
  );
}
