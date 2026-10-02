import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { SubscriptionBanner } from "../components/SubscriptionBanner";
import "./layout.css";

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="app-shell">
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="app-main">
        <Header onOpenMobileSidebar={() => setMobileOpen(true)} />
        <SubscriptionBanner />
        <main className="page">
          <div key={location.pathname} className="route-transition">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
