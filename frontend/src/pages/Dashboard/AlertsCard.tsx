import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BellRing, CalendarClock, Coins, PackageX, Wrench } from "lucide-react";
import { Badge } from "../../components/ui/Badge";
import * as dashboardService from "../../services/dashboard.service";
import { formatDate, formatNumber, unitLabel } from "../../utils/format";
import type { DashboardAlerts } from "../../types";

/**
 * "Needs attention" — only what the business actually uses: expiring
 * batches (expiry tracking), repairs waiting for pickup (repairs module),
 * the viewer's cash shift (shift module), plus low stock for everyone.
 * Renders nothing when there's nothing to act on.
 */
export function AlertsCard() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<DashboardAlerts | null>(null);

  useEffect(() => {
    dashboardService.getAlerts().then(setAlerts).catch(() => undefined);
  }, []);

  if (!alerts) return null;
  const { modules } = alerts;
  const items: JSX.Element[] = [];

  if (modules.requireShift && !alerts.openShift) {
    items.push(
      <Link key="shift" to="/shifts" className="alert-row">
        <Coins size={18} className="alert-icon warn" />
        <span className="spacer">{t("dashboard.alerts.noShift")}</span>
        <Badge variant="warning">{t("dashboard.alerts.openShift")}</Badge>
      </Link>,
    );
  }
  if (modules.trackExpiry && (alerts.expiredCount > 0 || alerts.expiringBatches.length > 0)) {
    items.push(
      <Link key="expiry" to="/stock" className="alert-row alert-row-block">
        <div className="row gap-2">
          <CalendarClock size={18} className="alert-icon danger" />
          <span className="spacer">
            {alerts.expiredCount > 0 ? t("dashboard.alerts.expired", { count: alerts.expiredCount }) : t("dashboard.alerts.expiring")}
          </span>
        </div>
        <div className="alert-sublist">
          {alerts.expiringBatches.slice(0, 5).map((b) => (
            <div key={b.id} className="row gap-2">
              <span className="spacer">{b.productName}</span>
              <span className="text-muted mono-num">
                {formatNumber(b.quantity)} {unitLabel(b.unit)}
              </span>
              <Badge variant={(b.daysLeft ?? 0) < 0 ? "danger" : (b.daysLeft ?? 99) <= 7 ? "warning" : "neutral"}>
                {b.expiryDate ? formatDate(b.expiryDate) : "—"}
              </Badge>
            </div>
          ))}
        </div>
      </Link>,
    );
  }
  if (modules.enableRepairs && (alerts.readyRepairs > 0 || alerts.activeRepairs > 0)) {
    items.push(
      <Link key="repairs" to="/repairs" className="alert-row">
        <Wrench size={18} className="alert-icon info" />
        <span className="spacer">{t("dashboard.alerts.repairs", { active: alerts.activeRepairs })}</span>
        {alerts.readyRepairs > 0 && <Badge variant="success">{t("dashboard.alerts.readyRepairs", { count: alerts.readyRepairs })}</Badge>}
      </Link>,
    );
  }
  if (alerts.lowStockCount > 0) {
    items.push(
      <Link key="low" to="/products?stock=low" className="alert-row">
        <PackageX size={18} className="alert-icon warn" />
        <span className="spacer">{t("dashboard.alerts.lowStock", { count: alerts.lowStockCount })}</span>
      </Link>,
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">
          <BellRing size={16} style={{ marginRight: 6, verticalAlign: -2 }} />
          {t("dashboard.alerts.title")}
        </h2>
      </div>
      <div className="card-pad stack gap-2" style={{ paddingTop: 0 }}>
        {items}
      </div>
    </div>
  );
}
