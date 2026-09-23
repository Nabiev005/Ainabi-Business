import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Phone, Receipt, Wallet } from "lucide-react";
import { SkeletonRows } from "../../components/ui/Skeleton";
import { EmptyState } from "../../components/ui/EmptyState";
import { Badge } from "../../components/ui/Badge";
import { useToast } from "../../hooks/useToast";
import { useLabels } from "../../hooks/useLabels";
import * as customerService from "../../services/customer.service";
import { extractErrorMessage } from "../../services/api";
import { formatDate, formatDateTime, formatMoney } from "../../utils/format";
import type { CustomerDetail } from "../../types";

export default function CustomerProfile() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const labels = useLabels();
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    if (!id) return;
    customerService
      .getCustomer(id)
      .then(setCustomer)
      .catch((error) => showToast({ variant: "error", title: t("customers.profile.notFound"), message: extractErrorMessage(error) }));
  }, [id, showToast, t]);

  if (!customer) {
    return (
      <div className="stack gap-6">
        <SkeletonRows rows={6} height={48} />
      </div>
    );
  }

  const totalDebt = customer.debts.filter((d) => d.status !== "PAID").reduce((sum, d) => sum + d.remainingAmount, 0);
  const totalSpent = customer.sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <div className="stack gap-6">
      <div className="page-header">
        <div className="row gap-3">
          <button className="btn btn-secondary btn-icon" onClick={() => navigate("/customers")}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{customer.name}</h1>
            <p className="page-subtitle">
              {customer.phone ? (
                <span className="row gap-1">
                  <Phone size={13} /> {customer.phone}
                </span>
              ) : (
                t("customers.profile.noPhone")
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card card-pad stack gap-2">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("customers.profile.totalSpent")}</span>
          <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>{formatMoney(totalSpent)}</span>
        </div>
        <div className="card card-pad stack gap-2">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("customers.profile.purchaseCount")}</span>
          <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700 }}>{customer.sales.length}</span>
        </div>
        <div className="card card-pad stack gap-2">
          <span className="text-muted" style={{ fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{t("customers.profile.currentDebt")}</span>
          <span className="mono-num" style={{ fontSize: "var(--font-size-2xl)", fontWeight: 700, color: totalDebt > 0 ? "var(--color-danger-text)" : undefined }}>
            {formatMoney(totalDebt)}
          </span>
        </div>
      </div>

      {customer.notes && (
        <div className="card card-pad">
          <span className="field-label">{t("customers.profile.comment")}</span>
          <p style={{ marginTop: 6 }}>{customer.notes}</p>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Receipt size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("customers.profile.purchaseHistory")}
          </h2>
        </div>
        {customer.sales.length === 0 ? (
          <div className="card-pad">
            <EmptyState title={t("customers.profile.noPurchases")} subtitle={t("customers.profile.noPurchasesSubtitle")} />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("customers.profile.date")}</th>
                  <th>{t("customers.profile.items")}</th>
                  <th>{t("customers.profile.payment")}</th>
                  <th className="table-cell-num">{t("customers.profile.amount")}</th>
                </tr>
              </thead>
              <tbody>
                {customer.sales.map((s) => (
                  <tr key={s.id}>
                    <td className="text-muted">{formatDateTime(s.createdAt)}</td>
                    <td>
                      {s.items.map((i, idx) => (
                        <div key={idx}>
                          {i.productName} ×{i.quantity}
                          {i.serialNumbers?.length > 0 && (
                            <span className="text-muted mono-num" style={{ display: "block", fontSize: "var(--font-size-xs)" }}>
                              IMEI/S/N: {i.serialNumbers.join(", ")}
                            </span>
                          )}
                          {i.warrantyUntil && (
                            <span className="text-muted" style={{ display: "block", fontSize: "var(--font-size-xs)" }}>
                              {t("customers.profile.warrantyUntil", { date: formatDate(i.warrantyUntil) })}
                            </span>
                          )}
                        </div>
                      ))}
                    </td>
                    <td>
                      <Badge variant="neutral">{labels.paymentMethod[s.paymentMethod]}</Badge>
                    </td>
                    <td className="table-cell-num">{formatMoney(s.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Wallet size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
            {t("customers.profile.debtHistory")}
          </h2>
        </div>
        {customer.debts.length === 0 ? (
          <div className="card-pad">
            <EmptyState title={t("customers.profile.noDebts")} subtitle={t("customers.profile.noDebtsSubtitle")} />
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("customers.profile.date")}</th>
                  <th className="table-cell-num">{t("customers.profile.total")}</th>
                  <th className="table-cell-num">{t("customers.profile.paid")}</th>
                  <th className="table-cell-num">{t("customers.profile.remaining")}</th>
                  <th>{t("customers.profile.status")}</th>
                  <th>{t("customers.profile.comment2")}</th>
                </tr>
              </thead>
              <tbody>
                {customer.debts.map((d) => (
                  <tr key={d.id}>
                    <td className="text-muted">{formatDateTime(d.createdAt)}</td>
                    <td className="table-cell-num">{formatMoney(d.totalAmount)}</td>
                    <td className="table-cell-num">{formatMoney(d.paidAmount)}</td>
                    <td className="table-cell-num">{formatMoney(d.remainingAmount)}</td>
                    <td>
                      <Badge variant={d.status === "PAID" ? "success" : d.status === "PARTIAL" ? "warning" : "danger"}>
                        {labels.debtStatus[d.status]}
                      </Badge>
                    </td>
                    <td className="text-muted">{d.comment ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
