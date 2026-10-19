import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { BrandLogo } from "../../components/BrandLogo";
import "./Legal.css";

export default function Privacy() {
  const { t } = useTranslation();

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <div className="legal-brand">
          <BrandLogo size={32} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <LanguageSwitcher />
          <Link to="/" className="btn btn-ghost">
            <ArrowLeft size={16} /> {t("legal.backHome")}
          </Link>
        </div>
      </nav>

      <div className="legal-content">
        <h1>{t("legal.privacy.title")}</h1>
        <p className="legal-updated">{t("legal.updated")}</p>

        <p>{t("legal.privacy.intro")}</p>

        <h2>{t("legal.privacy.s1Title")}</h2>
        <ul>
          <li><strong>{t("legal.privacy.s1Account")}</strong> {t("legal.privacy.s1AccountText")}</li>
          <li><strong>{t("legal.privacy.s1Google")}</strong> {t("legal.privacy.s1GoogleText")}</li>
          <li><strong>{t("legal.privacy.s1Business")}</strong> {t("legal.privacy.s1BusinessText")}</li>
          <li><strong>{t("legal.privacy.s1Ops")}</strong> {t("legal.privacy.s1OpsText")}</li>
        </ul>

        <h2>{t("legal.privacy.s2Title")}</h2>
        <p>{t("legal.privacy.s2Text")}</p>

        <h2>{t("legal.privacy.s3Title")}</h2>
        <p>{t("legal.privacy.s3Text")}</p>

        <h2>{t("legal.privacy.s4Title")}</h2>
        <p>{t("legal.privacy.s4Text")}</p>
        <ul>
          <li><strong>{t("legal.privacy.s4Google")}</strong> {t("legal.privacy.s4GoogleText")}</li>
          <li><strong>{t("legal.privacy.s4Neon")}</strong> {t("legal.privacy.s4NeonText")}</li>
          <li><strong>{t("legal.privacy.s4Vercel")}</strong> {t("legal.privacy.s4VercelText")}</li>
        </ul>

        <h2>{t("legal.privacy.s5Title")}</h2>
        <p>{t("legal.privacy.s5Text")}</p>

        <h2>{t("legal.privacy.s6Title")}</h2>
        <p>{t("legal.privacy.s6Intro")}</p>
        <ul>
          <li>{t("legal.privacy.s6Item1")}</li>
          <li>{t("legal.privacy.s6Item2")}</li>
          <li>{t("legal.privacy.s6Item3")}</li>
        </ul>
        <p>
          <Trans
            i18nKey="legal.privacy.s6Contact"
            components={{
              whatsapp: <a href="https://wa.me/996702952200" target="_blank" rel="noopener noreferrer" />,
              instagram: <a href="https://instagram.com/ainabi.studio" target="_blank" rel="noopener noreferrer" />,
            }}
          />
        </p>

        <h2>{t("legal.privacy.s7Title")}</h2>
        <p>{t("legal.privacy.s7Text")}</p>
      </div>
    </div>
  );
}
