import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  MapPin,
  Package,
  PackagePlus,
  Receipt,
  ScrollText,
  ShoppingCart,
  Tag,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface GuideSection {
  id: string;
  icon: LucideIcon;
  title: string;
  steps: string[];
}

const GUIDE_KEYS = [
  { key: "dashboard", icon: LayoutDashboard },
  { key: "products", icon: Package },
  { key: "pos", icon: ShoppingCart },
  { key: "sales", icon: ScrollText },
  { key: "shifts", icon: Coins },
  { key: "stock", icon: Warehouse },
  { key: "receiving", icon: PackagePlus },
  { key: "inventory", icon: ClipboardCheck },
  { key: "labels", icon: Tag },
  { key: "repairs", icon: Wrench },
  { key: "branches", icon: MapPin },
  { key: "customers", icon: Users },
  { key: "debts", icon: Wallet },
  { key: "suppliers", icon: Truck },
  { key: "expenses", icon: Receipt },
  { key: "reports", icon: BarChart3 },
  { key: "employees", icon: UserCog },
] as const;

/**
 * Shared step-by-step "how does each part of the app work" content — used
 * by both the public Landing page and the in-app Support page, so a shop
 * owner can read it before signing up, and an employee who never saw the
 * landing page can still find it from inside the app. Language-aware: the
 * title/steps text comes from the current i18next language.
 */
export function useGuideSections(): GuideSection[] {
  const { t } = useTranslation();

  return GUIDE_KEYS.map(({ key, icon }) => ({
    id: key,
    icon,
    title: t(`guide.sections.${key}.title`),
    steps: t(`guide.sections.${key}.steps`, { returnObjects: true }) as string[],
  }));
}
