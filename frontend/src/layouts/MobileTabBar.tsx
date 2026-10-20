import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LayoutGrid } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { NAV_ITEMS, locked } from "./Sidebar";

/** Screens worth a tab on a phone, most important first; each role gets its first four. */
const TAB_PRIORITY = ["/dashboard", "/pos", "/products", "/debts", "/customers", "/sales", "/shifts", "/receiving", "/stock", "/tasks"];
const TAB_COUNT = 4;

interface MobileTabBarProps {
  menuOpen: boolean;
  onOpenMenu: () => void;
}

/** Bottom navigation on phones (CSS shows it only on narrow screens), like a native app. */
export function MobileTabBar({ menuOpen, onOpenMenu }: MobileTabBarProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { pathname } = useLocation();
  if (!session) return null;

  const tabs = TAB_PRIORITY.map((to) => NAV_ITEMS.find((i) => i.to === to)!)
    .filter((item) => item.show(session) && !locked(session, item.feature))
    .slice(0, TAB_COUNT);
  const onTab = tabs.some((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));

  return (
    <nav className="tabbar" aria-label={t("header.menu")}>
      {tabs.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `tabbar-item ${isActive && !menuOpen ? "active" : ""}`}>
          <item.icon size={22} />
          <span>{t(`nav.${item.key}`)}</span>
        </NavLink>
      ))}
      <button type="button" className={`tabbar-item ${menuOpen || !onTab ? "active" : ""}`} onClick={onOpenMenu}>
        <LayoutGrid size={22} />
        <span>{t("header.menu")}</span>
      </button>
    </nav>
  );
}
