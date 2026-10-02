import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { sessionCan } from "../hooks/usePermissions";
import type { Feature } from "../services/billing.service";

/** Whether the business's plan includes a module (the platform admin sees everything). */
export function useFeature(feature: Feature) {
  const { session } = useAuth();
  return !!session?.isPlatformAdmin || !!session?.subscription?.features.includes(feature);
}

/** Shows the page if the plan includes it, otherwise what it is and how to get it. */
export function RequireFeature({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const allowed = useFeature(feature);
  if (allowed) return <>{children}</>;

  return (
    <div className="card card-pad upgrade-card">
      <span className="upgrade-card-icon">
        <Lock size={22} />
      </span>
      <h2 className="card-title">{t(`billing.features.${feature}`)}</h2>
      <p className="text-muted" style={{ margin: 0 }}>
        {t("billing.locked.text", { plan: t(`billing.plans.${session?.subscription?.plan ?? "BASIC"}.name`) })}
      </p>
      {sessionCan(session, "settings.business") ? (
        <Link to="/billing" className="btn btn-primary">
          {t("billing.locked.upgrade")}
        </Link>
      ) : (
        <span className="text-muted">{t("billing.banner.askOwner")}</span>
      )}
    </div>
  );
}
