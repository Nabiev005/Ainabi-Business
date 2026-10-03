import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Warehouse,
  Users,
  Wallet,
  Truck,
  Receipt,
  BarChart3,
  UserCog,
  Settings,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  ScrollText,
  PackagePlus,
  ClipboardCheck,
  Wrench,
  Coins,
  ChartPie,
  ListTodo,
  SquareKanban,
  Lock,
  Gem,
  Building2,
  Lightbulb,
  Undo2,
  Hourglass,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { sessionCan } from "../hooks/usePermissions";
import type { Permission, Session } from "../types";
import type { Feature } from "../services/billing.service";

const can = (s: Session, ...permissions: Permission[]) => permissions.some((p) => sessionCan(s, p));

// Each role only sees the screens it can actually use (see backend config/permissions.ts).
/** Not in the plan: still listed (so owners know it exists), with a lock. */
const locked = (s: Session, feature?: Feature) => !!feature && !s.isPlatformAdmin && !s.subscription?.features.includes(feature);

type NavGroup = "main" | "sales" | "catalog" | "money" | "reports" | "team";

/** Menu sections in display order ("main" has no heading). */
const GROUPS: NavGroup[] = ["main", "sales", "catalog", "money", "reports", "team"];

const NAV_ITEMS: Array<{
  to: string;
  key: string;
  icon: typeof LayoutDashboard;
  group: NavGroup;
  end?: boolean;
  show: (s: Session) => boolean;
  feature?: Feature;
}> = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard, group: "main", end: true, show: (s) => can(s, "reports.view") },

  { to: "/pos", key: "pos", icon: ShoppingCart, group: "sales", show: (s) => can(s, "pos.sell") },
  { to: "/sales", key: "sales", icon: ScrollText, group: "sales", show: (s) => can(s, "sales.view") },
  { to: "/shifts", key: "shifts", icon: Coins, group: "sales", show: (s) => can(s, "shifts.use", "shifts.viewAll") },
  { to: "/repairs", key: "repairs", icon: Wrench, group: "sales", show: (s) => !!s.business.enableRepairs && can(s, "repairs.manage"), feature: "repairs" },
  { to: "/returns", key: "returns", icon: Undo2, group: "sales", show: (s) => can(s, "returns.view") },

  { to: "/products", key: "products", icon: Package, group: "catalog", show: (s) => can(s, "products.view") },
  { to: "/pipeline", key: "pipeline", icon: SquareKanban, group: "catalog", show: (s) => can(s, "pipeline.view"), feature: "pipeline" },
  { to: "/stock", key: "stock", icon: Warehouse, group: "catalog", show: (s) => can(s, "stock.view") },
  { to: "/receiving", key: "receiving", icon: PackagePlus, group: "catalog", show: (s) => can(s, "stock.receive"), feature: "receiving" },
  { to: "/inventory", key: "inventory", icon: ClipboardCheck, group: "catalog", show: (s) => can(s, "stock.inventory"), feature: "inventory" },
  { to: "/stale", key: "stale", icon: Hourglass, group: "catalog", show: (s) => can(s, "stock.stale") },

  { to: "/customers", key: "customers", icon: Users, group: "money", show: (s) => can(s, "customers.view") },
  { to: "/debts", key: "debts", icon: Wallet, group: "money", show: (s) => can(s, "debts.view") },
  { to: "/suppliers", key: "suppliers", icon: Truck, group: "money", show: (s) => can(s, "suppliers.view") },
  { to: "/expenses", key: "expenses", icon: Receipt, group: "money", show: (s) => can(s, "expenses.view") },

  { to: "/analytics", key: "analytics", icon: ChartPie, group: "reports", show: (s) => can(s, "analytics.view"), feature: "analytics" },
  { to: "/insights", key: "insights", icon: Lightbulb, group: "reports", show: (s) => can(s, "analytics.view"), feature: "analytics" },
  { to: "/reports", key: "reports", icon: BarChart3, group: "reports", show: (s) => can(s, "reports.view") },

  { to: "/tasks", key: "tasks", icon: ListTodo, group: "team", show: () => true, feature: "tasks" },
  { to: "/employees", key: "employees", icon: UserCog, group: "team", show: (s) => can(s, "employees.manage") },
];

const COLLAPSED_GROUPS_KEY = "ainabi:nav-closed";
/** First visit: only selling is unfolded; the rest open on demand (and the current page's group always does). */
const DEFAULT_CLOSED: NavGroup[] = ["catalog", "money", "reports", "team"];

function readClosedGroups(): NavGroup[] {
  try {
    const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
    return raw ? (JSON.parse(raw) as NavGroup[]) : DEFAULT_CLOSED;
  } catch {
    return DEFAULT_CLOSED;
  }
}

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const items = session ? NAV_ITEMS.filter((item) => item.show(session)) : [];
  const { pathname } = useLocation();
  const [closed, setClosed] = useState<NavGroup[]>(readClosedGroups);
  const activeGroup = items.find((i) => pathname === i.to || pathname.startsWith(`${i.to}/`))?.group;

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(closed));
    } catch {
      /* private mode — just don't remember */
    }
  }, [closed]);

  const toggleGroup = (group: NavGroup) =>
    setClosed((prev) => (prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]));

  return (
    <>
      {mobileOpen && <div className="sidebar-mobile-overlay" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">AB</div>
          {!collapsed && <span className="sidebar-brand-name">Ainabi Business</span>}
        </div>

        <nav className="sidebar-nav">
          {GROUPS.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            // Icon-only sidebar: every item stays visible, groups are just separated.
            const open = collapsed || group === "main" || group === activeGroup || !closed.includes(group);
            return (
              <div key={group} className="sidebar-group">
                {group !== "main" &&
                  (collapsed ? (
                    <div className="sidebar-group-divider" />
                  ) : (
                    <button type="button" className="sidebar-group-label" onClick={() => toggleGroup(group)} aria-expanded={open}>
                      <span>{t(`nav.groups.${group}`)}</span>
                      <ChevronDown size={14} className={`sidebar-group-chevron ${open ? "" : "sidebar-group-chevron-closed"}`} />
                    </button>
                  ))}
                {open &&
                  groupItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
                      onClick={onCloseMobile}
                      title={collapsed ? t(`nav.${item.key}`) : undefined}
                    >
                      <item.icon size={19} />
                      {!collapsed && <span>{t(`nav.${item.key}`)}</span>}
                      {!collapsed && session && locked(session, item.feature) && <Lock size={13} className="sidebar-link-lock" />}
                    </NavLink>
                  ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {session?.isPlatformAdmin && (
            <NavLink to="/platform" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`} onClick={onCloseMobile}>
              <Building2 size={19} />
              {!collapsed && <span>{t("nav.platform")}</span>}
            </NavLink>
          )}
          {session && sessionCan(session, "settings.business") && (
            <NavLink to="/billing" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`} onClick={onCloseMobile}>
              <Gem size={19} />
              {!collapsed && <span>{t("nav.billing")}</span>}
            </NavLink>
          )}
          <NavLink to="/settings" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`} onClick={onCloseMobile}>
            <Settings size={19} />
            {!collapsed && <span>{t("nav.settings")}</span>}
          </NavLink>
          <NavLink to="/support" className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`} onClick={onCloseMobile}>
            <LifeBuoy size={19} />
            {!collapsed && <span>{t("nav.support")}</span>}
          </NavLink>
          <button className="sidebar-collapse-btn" onClick={onToggleCollapsed}>
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {!collapsed && <span>{t("nav.collapse")}</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
