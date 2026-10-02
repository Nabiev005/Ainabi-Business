import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MessageCircle, MoveLeft, UserCog } from "lucide-react";
import { BrandPanel } from "./BrandPanel";
import "./Auth.css";

const SUPPORT_WHATSAPP = "996702952200";

/**
 * There's no email service behind the app, so instead of pretending to send
 * a reset link this page says what actually works: an employee asks the
 * owner for a new temporary password; an owner signs in with Google or
 * writes to support.
 */
export default function ForgotPassword() {
  const { t } = useTranslation();
  const whatsappText = encodeURIComponent(t("auth.forgotPassword.whatsappMessage"));

  return (
    <div className="auth-shell">
      <BrandPanel />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div className="auth-card-header">
            <h1 className="auth-title">{t("auth.forgotPassword.title")}</h1>
            <p className="auth-subtitle">{t("auth.forgotPassword.subtitle")}</p>
          </div>

          <div className="stack gap-4">
            <div className="forgot-option">
              <UserCog size={20} />
              <div className="stack gap-1">
                <strong>{t("auth.forgotPassword.employeeTitle")}</strong>
                <span className="text-muted">{t("auth.forgotPassword.employeeText")}</span>
              </div>
            </div>
            <div className="forgot-option">
              <MessageCircle size={20} />
              <div className="stack gap-2">
                <strong>{t("auth.forgotPassword.ownerTitle")}</strong>
                <span className="text-muted">{t("auth.forgotPassword.ownerText")}</span>
                <a className="btn btn-secondary btn-sm" style={{ alignSelf: "flex-start" }} href={`https://wa.me/${SUPPORT_WHATSAPP}?text=${whatsappText}`} target="_blank" rel="noreferrer">
                  <MessageCircle size={14} /> {t("auth.forgotPassword.whatsapp")}
                </a>
              </div>
            </div>
          </div>

          <Link to="/login" className="auth-footer-note" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
            <MoveLeft size={14} /> {t("auth.forgotPassword.backToLogin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
