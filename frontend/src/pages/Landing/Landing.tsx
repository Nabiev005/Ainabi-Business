import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeftRight,
  ArrowRight,
  BarChart3,
  CalendarClock,
  Car,
  ChartPie,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Coins,
  FileSpreadsheet,
  Hammer,
  Hourglass,
  Instagram,
  Laptop,
  Layers,
  LayoutDashboard,
  Lightbulb,
  ListTodo,
  Minus,
  MessageCircle,
  Package,
  PackagePlus,
  Pill,
  Scale,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Sparkles,
  SquareKanban,
  Store,
  Tag,
  Tv,
  Undo2,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { GuideAccordion } from "../../components/GuideAccordion";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useGuideSections } from "../../data/guideSections";
import * as billingService from "../../services/billing.service";
import type { Feature as PlanFeature, PlanDefinition } from "../../services/billing.service";
import { formatMoney } from "../../utils/format";
import "./Landing.css";

interface Problem { before: string; after: string }
interface Feature { title: string; text: string }
interface Step { title: string; text: string }
interface DailyItem { title: string; text: string }

const FEATURE_ICONS = [Package, ShoppingCart, Warehouse, Users, Wallet, BarChart3];
const DAILY_ICONS = [LayoutDashboard, ShoppingCart, Warehouse, BarChart3];

/** Shop types the app sets itself up for (see backend businessTemplates.ts). */
const INDUSTRIES: { id: string; icon: LucideIcon }[] = [
  { id: "PHONES", icon: Smartphone },
  { id: "LAPTOPS", icon: Laptop },
  { id: "APPLIANCES", icon: Tv },
  { id: "CLOTHING", icon: Shirt },
  { id: "GROCERY", icon: ShoppingBasket },
  { id: "PHARMACY", icon: Pill },
  { id: "COSMETICS", icon: Sparkles },
  { id: "AUTO_PARTS", icon: Car },
  { id: "BUILDING", icon: Hammer },
  { id: "GENERAL", icon: Store },
];

const CAPABILITY_ICONS: LucideIcon[] = [
  PackagePlus,
  ClipboardCheck,
  ArrowLeftRight,
  Undo2,
  Coins,
  Wrench,
  ShieldCheck,
  CalendarClock,
  Layers,
  Tag,
  FileSpreadsheet,
  Scale,
  // added with roles / tasks / pipeline / advice
  UserCog,
  ListTodo,
  SquareKanban,
  ChartPie,
  Lightbulb,
  Hourglass,
];

/** Paid modules in the order the price cards list them. */
const PLAN_FEATURES: PlanFeature[] = ["receiving", "inventory", "repairs", "tasks", "pipeline", "analytics"];

export default function Landing() {
  const { t } = useTranslation();
  const { session, isLoading } = useAuth();
  const navigate = useNavigate();
  const guideSections = useGuideSections();

  const problems = t("landing.problems.items", { returnObjects: true }) as Problem[];
  const features = t("landing.features.items", { returnObjects: true }) as Feature[];
  const steps = t("landing.steps.items", { returnObjects: true }) as Step[];
  const dailyUse = t("landing.daily.items", { returnObjects: true }) as DailyItem[];
  const industryTexts = t("landing.industries.items", { returnObjects: true }) as Record<string, string>;
  const capabilities = t("landing.capabilities.items", { returnObjects: true }) as Feature[];
  const [plans, setPlans] = useState<PlanDefinition[] | null>(null);
  const [trialDays, setTrialDays] = useState(14);

  // Prices come from the server's plan list, so the landing page never drifts from billing.
  useEffect(() => {
    billingService
      .getPublicPlans()
      .then((res) => {
        setPlans(res.plans);
        setTrialDays(res.trialDays);
      })
      .catch(() => setPlans([]));
  }, []);
  const limit = (n: number | null) => (n === null ? t("billing.unlimited") : String(n));

  // Already signed in — no reason to see the marketing page every visit.
  if (!isLoading && session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="landing-brand">
          <span className="landing-brand-mark">AB</span>
          <span>Ainabi Business</span>
        </div>
        <div className="landing-nav-actions">
          <LanguageSwitcher />
          <a className="btn btn-ghost landing-nav-pricing" href="#pricing">
            {t("landing.nav.pricing")}
          </a>
          <button className="btn btn-ghost" onClick={() => navigate("/login")}>
            {t("landing.nav.login")}
          </button>
          <button className="btn btn-primary" onClick={() => navigate("/register")}>
            {t("landing.nav.register")}
          </button>
        </div>
      </nav>

      <section className="landing-hero">
        <div>
          <span className="landing-eyebrow">
            <Zap size={13} /> {t("landing.hero.eyebrow")}
          </span>
          <h1>{t("landing.hero.title")}</h1>
          <p className="landing-hero-subtitle">{t("landing.hero.subtitle")}</p>
          <div className="landing-hero-actions">
            <button className="btn btn-primary btn-lg" onClick={() => navigate("/register")}>
              {t("landing.hero.ctaPrimary")} <ArrowRight size={18} />
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => navigate("/login")}>
              {t("landing.hero.ctaSecondary")}
            </button>
          </div>
          <div className="landing-hero-points">
            <span className="landing-hero-point">
              <CheckCircle2 size={16} /> {t("landing.hero.point1")}
            </span>
            <span className="landing-hero-point">
              <CheckCircle2 size={16} /> {t("landing.hero.point2")}
            </span>
            <span className="landing-hero-point">
              <CheckCircle2 size={16} /> {t("landing.hero.point3")}
            </span>
          </div>
        </div>
        <div className="landing-hero-image">
          <img src="/og-banner.png" alt="Ainabi Business" />
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t("landing.problems.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.problems.subtitle")}</p>
        </div>
        <div className="landing-problems">
          {problems.map((p) => (
            <div className="landing-problem-row" key={p.before}>
              <div className="landing-problem-before">
                <X size={16} />
                <span>{p.before}</span>
              </div>
              <ArrowRight className="landing-problem-arrow" size={18} />
              <div className="landing-problem-after">
                <CheckCircle2 size={16} />
                <span>{p.after}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t("landing.features.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.features.subtitle")}</p>
        </div>
        <div className="landing-features">
          {features.map((f, i) => {
            const Icon = FEATURE_ICONS[i];
            return (
              <div className="landing-feature-card" key={f.title}>
                <div className="landing-feature-icon">
                  <Icon size={22} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t("landing.industries.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.industries.subtitle")}</p>
        </div>
        <div className="landing-industries">
          {INDUSTRIES.map(({ id, icon: Icon }) => (
            <div className="landing-industry" key={id}>
              <div className="landing-feature-icon">
                <Icon size={20} />
              </div>
              <div>
                <h3>{t(`businessTypes.${id}`)}</h3>
                <p>{industryTexts[id]}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <span className="landing-eyebrow" style={{ margin: "0 auto var(--space-3)" }}>
            <Zap size={13} /> {t("landing.capabilities.eyebrow")}
          </span>
          <h2 className="landing-section-title">{t("landing.capabilities.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.capabilities.subtitle")}</p>
        </div>
        <div className="landing-features landing-capabilities">
          {capabilities.map((c, i) => {
            const Icon = CAPABILITY_ICONS[i] ?? CheckCircle2;
            return (
              <div className="landing-feature-card" key={c.title}>
                <div className="landing-feature-icon">
                  <Icon size={22} />
                </div>
                <h3>{c.title}</h3>
                <p>{c.text}</p>
              </div>
            );
          })}
        </div>
      </section>

      {plans && plans.length > 0 && (
        <section className="landing-section" id="pricing">
          <div className="landing-section-header">
            <h2 className="landing-section-title">{t("landing.pricing.title")}</h2>
            <p className="landing-section-subtitle">{t("landing.pricing.subtitle", { days: trialDays })}</p>
          </div>
          <div className="landing-pricing">
            {plans.map((p) => (
              <div key={p.id} className={`landing-plan ${p.id === "PRO" ? "landing-plan-featured" : ""}`}>
                {p.id === "PRO" && <span className="landing-plan-badge">{t("landing.pricing.popular")}</span>}
                <h3>{t(`billing.plans.${p.id}.name`)}</h3>
                <p className="landing-plan-for">{t(`billing.plans.${p.id}.for`)}</p>
                <div className="landing-plan-price">
                  <strong>{formatMoney(p.priceMonthly)}</strong>
                  <span>/ {t("billing.month")}</span>
                </div>
                <p className="landing-plan-yearly">{t("landing.pricing.yearly", { amount: formatMoney(p.priceYearly) })}</p>
                <ul>
                  <li>
                    <Check size={15} /> {t("billing.coreFeatures")}
                  </li>
                  <li>
                    <Check size={15} /> {t("billing.employeesLimit", { limit: limit(p.maxEmployees) })}
                  </li>
                  <li>
                    <Check size={15} /> {t("billing.locationsLimit", { limit: limit(p.maxLocations) })}
                  </li>
                  {PLAN_FEATURES.map((f) => (
                    <li key={f} className={p.features.includes(f) ? "" : "landing-plan-missing"}>
                      {p.features.includes(f) ? <Check size={15} /> : <Minus size={15} />} {t(`billing.features.${f}`)}
                    </li>
                  ))}
                  {p.id === "MAX" && (
                    <li>
                      <Check size={15} /> {t("billing.prioritySupport")}
                    </li>
                  )}
                </ul>
                <button className={`btn ${p.id === "PRO" ? "btn-primary" : "btn-secondary"}`} onClick={() => navigate("/register")}>
                  {t("landing.pricing.cta", { days: trialDays })}
                </button>
              </div>
            ))}
          </div>
          <p className="landing-pricing-note">{t("landing.pricing.note", { days: trialDays })}</p>
        </section>
      )}

      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t("landing.steps.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.steps.subtitle")}</p>
        </div>
        <div className="landing-steps">
          {steps.map((s, i) => (
            <div className="landing-step" key={s.title}>
              <div className="landing-step-number">{i + 1}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t("landing.daily.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.daily.subtitle")}</p>
        </div>
        <div className="landing-daily">
          {dailyUse.map((d, i) => {
            const Icon = DAILY_ICONS[i];
            return (
              <div className="landing-daily-item" key={d.title}>
                <div className="landing-daily-icon">
                  <Icon size={20} />
                </div>
                <div className="landing-daily-body">
                  <span className="landing-daily-step">{t("landing.daily.step", { n: i + 1 })}</span>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">{t("landing.guide.title")}</h2>
          <p className="landing-section-subtitle">{t("landing.guide.subtitle")}</p>
        </div>
        <GuideAccordion sections={guideSections} />
      </section>

      <div className="landing-cta">
        <h2>{t("landing.cta.title")}</h2>
        <p>{t("landing.cta.subtitle")}</p>
        <div className="landing-cta-actions">
          <button className="btn btn-secondary btn-lg" onClick={() => navigate("/register")}>
            <UserPlus size={18} /> {t("landing.cta.button")}
          </button>
        </div>
      </div>

      <footer className="landing-footer">
        <span>© {new Date().getFullYear()} Ainabi Business</span>
        <div className="landing-footer-contacts">
          <Link to="/privacy" className="landing-footer-link">{t("landing.footer.privacy")}</Link>
          <Link to="/terms" className="landing-footer-link">{t("landing.footer.terms")}</Link>
          <a href="https://instagram.com/ainabi.studio" target="_blank" rel="noopener noreferrer" className="landing-footer-link">
            <Instagram size={16} /> @ainabi.studio
          </a>
          <a href="https://wa.me/996702952200" target="_blank" rel="noopener noreferrer" className="landing-footer-link">
            <MessageCircle size={16} /> +996 702 952 200
          </a>
        </div>
      </footer>
    </div>
  );
}
