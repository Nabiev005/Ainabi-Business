import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import "./Legal.css";

export default function Terms() {
  const { t } = useTranslation();

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <div className="legal-brand">
          <span className="legal-brand-mark">AB</span>
          <span>Ainabi Business</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <LanguageSwitcher />
          <Link to="/" className="btn btn-ghost">
            <ArrowLeft size={16} /> {t("legal.backHome")}
          </Link>
        </div>
      </nav>

      <div className="legal-content">
        <h1>{t("legal.terms.title")}</h1>
        <p className="legal-updated">{t("legal.updated")}</p>

        <p>{t("legal.terms.intro")}</p>

        <h2>{t("legal.terms.s1Title")}</h2>
        <p>{t("legal.terms.s1Text")}</p>

        <h2>{t("legal.terms.s2Title")}</h2>
        <ul>
          <li>{t("legal.terms.s2Item1")}</li>
          <li>{t("legal.terms.s2Item2")}</li>
          <li>{t("legal.terms.s2Item3")}</li>
        </ul>

        <h2>{t("legal.terms.s3Title")}</h2>
        <p>{t("legal.terms.s3Text")}</p>

        <h2>{t("legal.terms.s4Title")}</h2>
        <p>{t("legal.terms.s4Text")}</p>

        <h2>{t("legal.terms.s5Title")}</h2>
        <p>{t("legal.terms.s5Text")}</p>

        <h2>{t("legal.terms.s6Title")}</h2>
        <p>{t("legal.terms.s6Text")}</p>

        <h2>{t("legal.terms.billingTitle")}</h2>
        <p>{t("legal.terms.billingText")}</p>

        <h2>{t("legal.terms.s7Title")}</h2>
        <p>
          <Trans
            i18nKey="legal.terms.s7Text"
            components={{
              whatsapp: <a href="https://wa.me/996702952200" target="_blank" rel="noopener noreferrer" />,
              instagram: <a href="https://instagram.com/ainabi.studio" target="_blank" rel="noopener noreferrer" />,
            }}
          />
        </p>
      </div>
    </div>
  );
}
