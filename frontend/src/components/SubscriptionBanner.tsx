import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Clock, Lock } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { sessionCan } from "../hooks/usePermissions";

/**
 * A strip above every page when the subscription is about to run out, is
 * still a trial, or has run out (read-only). The owner gets a link to pay;
 * employees are told to ask the owner.
 */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const sub = session?.subscription;
  if (!sub || session?.isPlatformAdmin) return null;

  const canPay = sessionCan(session, "settings.business");
  const plan = t(`billing.plans.${sub.plan}.name`);

  let variant: "danger" | "warning" | "info";
  let text: string;
  if (!sub.active) {
    variant = "danger";
    text = t("billing.banner.expired");
  } else if (sub.endingSoon) {
    variant = "warning";
    text = sub.isTrial ? t("billing.banner.trialEnding", { count: sub.daysLeft, plan }) : t("billing.banner.ending", { count: sub.daysLeft, plan });
  } else if (sub.isTrial) {
    variant = "info";
    text = t("billing.banner.trial", { count: sub.daysLeft, plan });
  } else {
    return null;
  }

  return (
    <div className={`subscription-banner subscription-banner-${variant}`} role="status">
      {variant === "danger" ? <Lock size={16} /> : <Clock size={16} />}
      <span>{text}</span>
      {canPay ? (
        <Link to="/billing" className="subscription-banner-action">
          {sub.active ? t("billing.banner.choosePlan") : t("billing.banner.pay")}
        </Link>
      ) : (
        <span className="subscription-banner-note">{t("billing.banner.askOwner")}</span>
      )}
    </div>
  );
}
