import { useTranslation } from "react-i18next";
import { LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { ChangePasswordForm } from "./ChangePasswordForm";

/** Shown instead of the app until someone with an owner-chosen password sets their own. */
export function ForcePasswordChange() {
  const { t } = useTranslation();
  const { session, logout } = useAuth();

  return (
    <div className="force-password-shell">
      <div className="card force-password-card">
        <div className="card-pad stack gap-4">
          <div className="stack gap-2">
            <span className="force-password-icon">
              <ShieldCheck size={22} />
            </span>
            <h1 className="card-title" style={{ fontSize: "var(--font-size-xl, 20px)" }}>
              {t("password.forceTitle")}
            </h1>
            <p className="text-muted" style={{ margin: 0 }}>
              {t("password.forceSubtitle")}
            </p>
            <span className="text-muted" style={{ fontSize: "var(--font-size-sm)" }}>
              {session?.user.name} · {session?.user.email}
            </span>
          </div>
          <ChangePasswordForm />
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: "flex-start" }} onClick={logout}>
            <LogOut size={14} /> {t("password.logout")}
          </button>
        </div>
      </div>
    </div>
  );
}
