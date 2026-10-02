import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { ForcePasswordChange } from "./ForcePasswordChange";

export function ProtectedRoute() {
  const { t } = useTranslation();
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--color-text-muted)" }}>
        {t("common.loading")}
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (session.user.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  return <Outlet />;
}
