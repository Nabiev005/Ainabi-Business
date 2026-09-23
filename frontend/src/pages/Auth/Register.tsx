import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Briefcase, LayoutGrid, Lock, Mail, Phone, User as UserIcon, UserPlus } from "lucide-react";
import { BrandPanel } from "./BrandPanel";
import { GoogleSignInButton } from "../../components/GoogleSignInButton";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useAuth } from "../../hooks/useAuth";
import { useToast } from "../../hooks/useToast";
import { extractErrorMessage } from "../../services/api";
import "./Auth.css";

// Must match the template ids in backend/src/config/businessTemplates.ts.
// Labels live in the frontend's own i18n files because this page is
// public — the authenticated /settings/templates endpoint isn't reachable yet.
const BUSINESS_TYPES = ["GENERAL", "PHONES", "LAPTOPS", "APPLIANCES", "CLOTHING", "GROCERY", "PHARMACY", "COSMETICS", "AUTO_PARTS", "BUILDING"];

export default function Register() {
  const { t } = useTranslation();
  const { register: registerAccount } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const schema = z.object({
    name: z.string().min(2, t("auth.register.nameMin")),
    businessName: z.string().min(2, t("auth.register.businessNameMin")),
    phone: z.string().min(6, t("auth.register.phoneMin")),
    email: z.string().email(t("auth.register.emailInvalid")),
    password: z.string().min(6, t("auth.register.passwordMin")),
    businessType: z.string(),
  });
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { businessType: "GENERAL" } });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    try {
      await registerAccount(values);
      showToast({ variant: "success", title: t("auth.register.successTitle"), message: t("auth.register.successMessage") });
      navigate("/dashboard");
    } catch (error) {
      showToast({ variant: "error", title: t("auth.register.errorTitle"), message: extractErrorMessage(error) });
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
            <h1 className="auth-title">{t("auth.register.title")}</h1>
            <p className="auth-subtitle">{t("auth.register.subtitle")}</p>
          </div>

          <GoogleSignInButton onSuccess={() => { showToast({ variant: "success", title: t("auth.register.successTitle"), message: t("auth.register.successMessage") }); navigate("/dashboard"); }} />
          <div className="auth-divider">{t("auth.register.orEmail")}</div>

          <form className="stack gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="field">
              <label className="field-label" htmlFor="name">{t("auth.register.name")}</label>
              <div className="input-with-icon">
                <UserIcon size={16} />
                <input id="name" className={`input ${errors.name ? "has-error" : ""}`} placeholder={t("auth.register.namePlaceholder")} {...register("name")} />
              </div>
              {errors.name && <span className="field-error">{errors.name.message}</span>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="businessName">{t("auth.register.businessName")}</label>
              <div className="input-with-icon">
                <Briefcase size={16} />
                <input id="businessName" className={`input ${errors.businessName ? "has-error" : ""}`} placeholder={t("auth.register.businessNamePlaceholder")} {...register("businessName")} />
              </div>
              {errors.businessName && <span className="field-error">{errors.businessName.message}</span>}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="businessType">{t("auth.register.businessType")}</label>
              <div className="input-with-icon">
                <LayoutGrid size={16} />
                <select id="businessType" className="select" style={{ paddingLeft: 40 }} {...register("businessType")}>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`businessTypes.${type}`)}
                    </option>
                  ))}
                </select>
              </div>
              <span className="field-hint">{t("auth.register.businessTypeHint")}</span>
            </div>

            <div className="form-grid">
              <div className="field">
                <label className="field-label" htmlFor="phone">{t("auth.register.phone")}</label>
                <div className="input-with-icon">
                  <Phone size={16} />
                  <input id="phone" className={`input ${errors.phone ? "has-error" : ""}`} placeholder="+996 700 123 456" {...register("phone")} />
                </div>
                {errors.phone && <span className="field-error">{errors.phone.message}</span>}
              </div>
              <div className="field">
                <label className="field-label" htmlFor="email">{t("auth.register.email")}</label>
                <div className="input-with-icon">
                  <Mail size={16} />
                  <input id="email" type="email" className={`input ${errors.email ? "has-error" : ""}`} placeholder="you@example.com" {...register("email")} />
                </div>
                {errors.email && <span className="field-error">{errors.email.message}</span>}
              </div>
            </div>

            <div className="field">
              <label className="field-label" htmlFor="password">{t("auth.register.password")}</label>
              <div className="input-with-icon">
                <Lock size={16} />
                <input id="password" type="password" className={`input ${errors.password ? "has-error" : ""}`} placeholder={t("auth.register.passwordPlaceholder")} {...register("password")} />
              </div>
              {errors.password && <span className="field-error">{errors.password.message}</span>}
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={submitting}>
              <UserPlus size={18} />
              {submitting ? t("auth.register.submitting") : t("auth.register.submit")}
            </button>
          </form>

          <p className="auth-footer-note">
            {t("auth.register.haveAccount")} <Link to="/login">{t("auth.register.login")}</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
