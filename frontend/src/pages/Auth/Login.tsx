import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Lock, LogIn, Mail } from "lucide-react";
import { BrandPanel } from "./BrandPanel";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import { isNativeApp } from "../../utils/native";
import "./Auth.css";

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    email: z.string().email(t("auth.login.emailInvalid")),
    password: z.string().min(1, t("auth.login.passwordRequired")),
  });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      await login(values.email, values.password);
      showToast({ variant: "success", title: t("auth.login.welcomeTitle"), message: t("auth.login.welcomeMessage") });
      navigate("/dashboard");
    } catch (error) {
      showToast({ variant: "error", title: t("auth.login.errorTitle"), message: extractErrorMessage(error, t("auth.login.errorFallback")) });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <BrandPanel />
      <div className="auth-form-panel">
        <div className="auth-card">
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <LanguageSwitcher />
          </div>
          <div className="auth-card-header">
            <h1 className="auth-title">{t("auth.login.title")}</h1>
            <p className="auth-subtitle">{t("auth.login.subtitle")}</p>
          </div>

          {/* Google refuses to sign in inside an app WebView ("disallowed_useragent"). */}
          {!isNativeApp() && (
            <>
              <GoogleSignInButton onSuccess={() => { showToast({ variant: "success", title: t("auth.login.welcomeTitle") }); navigate("/dashboard"); }} />
              <div className="auth-divider">{t("auth.login.orEmail")}</div>
            </>
          )}

          <form className="stack gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="email">{t("auth.login.email")}</label>
              <div className="input-with-icon">
                <Mail size={16} />
                <input id="email" type="email" className={`input ${errors.email ? "has-error" : ""}`} placeholder="you@example.com" {...register("email")} />
              </div>
              {errors.email && <span className="field-error">{errors.email.message}</span>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">{t("auth.login.password")}</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input id="password" type="password" className={`input ${errors.password ? "has-error" : ""}`} placeholder="••••••••" {...register("password")} />
              </div>
              {errors.password && <span className="field-error">{errors.password.message}</span>}
              <Link to="/forgot-password" style={{ alignSelf: "flex-end", fontSize: "var(--font-size-xs)", color: "var(--color-primary-600)", fontWeight: 600 }}>
                {t("auth.login.forgotPassword")}
              </Link>
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
              <LogIn size={18} />
              {submitting ? t("auth.login.submitting") : t("auth.login.submit")}
            </button>
          </form>

          <p className="auth-footer-note">
            {t("auth.login.noAccount")} <Link to="/register">{t("auth.login.register")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
