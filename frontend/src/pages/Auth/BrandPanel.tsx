import { useTranslation } from "react-i18next";
import { BarChart3, PackageCheck, Wallet, Zap } from "lucide-react";
import { BrandLogo } from "../../components/BrandLogo";

export function BrandPanel() {
  const { t } = useTranslation();

  return (
    <div className="auth-brand-panel">
      <div className="auth-brand-mark">
        <BrandLogo size={44} tone="light" />
      </div>

      <div>
        <h1 className="auth-brand-headline">{t("auth.brandPanel.headline")}</h1>
        <p className="auth-brand-sub">{t("auth.brandPanel.subtitle")}</p>
      </div>

      <div className="auth-brand-points">
        <div className="auth-brand-point">
          <Zap size={18} /> {t("auth.brandPanel.point1")}
        </div>
        <div className="auth-brand-point">
          <PackageCheck size={18} /> {t("auth.brandPanel.point2")}
        </div>
        <div className="auth-brand-point">
          <Wallet size={18} /> {t("auth.brandPanel.point3")}
        </div>
        <div className="auth-brand-point">
          <BarChart3 size={18} /> {t("auth.brandPanel.point4")}
        </div>
      </div>
    </div>
  );
}
