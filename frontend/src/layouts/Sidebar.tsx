import { NavLink } from "react-router-dom";
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
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { sessionCan } from "../hooks/usePermissions";
import type { Permission, Session } from "../types";

const can = (s: Session, ...permissions: Permission[]) => permissions.some((p) => sessionCan(s, p));

// Each role only sees the screens it can actually use (see backend config/permissions.ts).
const NAV_ITEMS: Array<{ to: string; key: string; icon: typeof LayoutDashboard; end?: boolean; show: (s: Session) => boolean }> = [
  { to: "/dashboard", key: "dashboard", icon: LayoutDashboard, end: true, show: (s) => can(s, "reports.view") },
  { to: "/analytics", key: "analytics", icon: ChartPie, show: (s) => can(s, "analytics.view") },
  { to: "/tasks", key: "tasks", icon: ListTodo, show: () => true },
  { to: "/pos", key: "pos", icon: ShoppingCart, show: (s) => can(s, "pos.sell") },
  { to: "/sales", key: "sales", icon: ScrollText, show: (s) => can(s, "sales.view") },
  { to: "/shifts", key: "shifts", icon: Coins, show: (s) => can(s, "shifts.use", "shifts.viewAll") },
  { to: "/repairs", key: "repairs", icon: Wrench, show: (s) => !!s.business.enableRepairs && can(s, "repairs.manage") },
  { to: "/products", key: "products", icon: Package, show: (s) => can(s, "products.view") },
  { to: "/pipeline", key: "pipeline", icon: SquareKanban, show: (s) => can(s, "pipeline.view") },
  { to: "/stock", key: "stock", icon: Warehouse, show: (s) => can(s, "stock.view") },
  { to: "/receiving", key: "receiving", icon: PackagePlus, show: (s) => can(s, "stock.receive") },
  { to: "/inventory", key: "inventory", icon: ClipboardCheck, show: (s) => can(s, "stock.inventory") },
  { to: "/customers", key: "customers", icon: Users, show: (s) => can(s, "customers.view") },
  { to: "/debts", key: "debts", icon: Wallet, show: (s) => can(s, "debts.view") },
  { to: "/suppliers", key: "suppliers", icon: Truck, show: (s) => can(s, "suppliers.view") },
  { to: "/expenses", key: "expenses", icon: Receipt, show: (s) => can(s, "expenses.view") },
  { to: "/reports", key: "reports", icon: BarChart3, show: (s) => can(s, "reports.view") },
  { to: "/employees", key: "employees", icon: UserCog, show: (s) => can(s, "employees.manage") },
];

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

  return (
    <>
      {mobileOpen && <div className="sidebar-mobile-overlay" onClick={onCloseMobile} />}
      <aside className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark">AB</div>
          {!collapsed && <span className="sidebar-brand-name">Ainabi Business</span>}
        </div>

        <nav className="sidebar-nav">
          {items.map((item) => (
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
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
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
