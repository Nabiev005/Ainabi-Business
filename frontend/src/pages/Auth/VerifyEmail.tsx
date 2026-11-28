import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, LayoutDashboard, MailWarning } from "lucide-react";
import { BrandPanel } from "./BrandPanel";
import { useAuth } from "../../hooks/useAuth";
import * as authService from "../../services/auth.service";
import { extractErrorMessage } from "../../services/api";
import "./Auth.css";

/** Opened from the emailed link: /verify-email?token=… */
export default function VerifyEmail() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const { session, reloadSession } = useAuth();
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [error, setError] = useState<string | null>(token ? null : t("verifyEmail.noToken"));
  const started = useRef(false);

  useEffect(() => {
    // A link is single-use: StrictMode's double effect must not spend it twice.
    if (!token || started.current) return;
    started.current = true;
    authService
      .verifyEmail(token)
      .then(async () => {
        setState("done");
        await reloadSession().catch(() => undefined);
      })
      .catch((err) => {
        setError(extractErrorMessage(err));
        setState("failed");
      });
  }, [token, reloadSession]);

  return (
    <div className="auth-shell">
      <BrandPanel />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">{t("verifyEmail.title")}</h1>
          </div>
          {state === "working" ? (
            <p className="text-muted">{t("verifyEmail.working")}</p>
          ) : state === "done" ? (
            <div className="stack gap-4">
              <div className="forgot-option">
                <CheckCircle2 size={20} />
                <div className="stack gap-1">
                  <strong>{t("verifyEmail.doneTitle")}</strong>
                  <span className="text-muted">{t("verifyEmail.doneText")}</span>
                </div>
              </div>
              <Link to={session ? "/dashboard" : "/login"} className="btn btn-primary btn-block">
                <LayoutDashboard size={16} /> {session ? t("verifyEmail.toApp") : t("auth.login.submit")}
              </Link>
            </div>
          ) : (
            <div className="stack gap-4">
              <div className="forgot-option">
                <MailWarning size={20} />
                <span className="text-muted">{error}</span>
              </div>
              <span className="field-hint">{t("verifyEmail.askAgain")}</span>
              <Link to={session ? "/dashboard" : "/login"} className="btn btn-secondary btn-block">
                {session ? t("verifyEmail.toApp") : t("auth.login.submit")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
