import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LogOut, Menu, Plus, Search, Settings, User } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useLabels } from "../hooks/useLabels";
import { useBackButton } from "../hooks/useBackButton";
import { GlobalSearch } from "./GlobalSearch";
import { NotificationCenter } from "./NotificationCenter";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { BrandIcon } from "../components/BrandLogo";

interface HeaderProps {
  onOpenMobileSidebar: () => void;
}

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const { t } = useTranslation();
  const { session, logout } = useAuth();
  const labels = useLabels();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useBackButton(profileOpen, () => setProfileOpen(false));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const initials = session?.user.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="header">
      <button className="header-icon-btn header-mobile-toggle" onClick={onOpenMobileSidebar} aria-label={t("header.menu")}>
        <Menu size={18} />
      </button>

      {/* Phones: an app bar with the business name instead of the search box. */}
      <div className="header-title">
        <BrandIcon size={30} />
        <span>{session?.business.name}</span>
      </div>

      <GlobalSearch mobileOpen={searchOpen} onCloseMobile={() => setSearchOpen(false)} />

      <div className="spacer" />

      <div className="header-actions">
        <button className="header-icon-btn header-search-toggle" onClick={() => setSearchOpen(true)} aria-label={t("header.searchPlaceholder")}>
          <Search size={18} />
        </button>

        <LanguageSwitcher className="header-lang" />

        <button className="btn btn-primary btn-sm header-quick-sale" onClick={() => navigate("/pos")}>
          <Plus size={16} />
          <span className="quick-sale-label">{t("header.quickSale")}</span>
        </button>

        <NotificationCenter />

        <div style={{ position: "relative" }} ref={menuRef}>
          <button className="header-profile" onClick={() => setProfileOpen((v) => !v)}>
            {session?.user.avatarUrl ? (
              <img src={session.user.avatarUrl} alt={session.user.name} className="avatar" style={{ objectFit: "cover" }} />
            ) : (
              <span className="avatar">{initials || "AB"}</span>
            )}
            <div className="stack header-profile-text" style={{ textAlign: "left", lineHeight: 1.2 }}>
              <span style={{ fontSize: "var(--font-size-sm)", fontWeight: 700 }}>{session?.business.name}</span>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" }}>
                {session ? labels.role[session.role] : ""}
              </span>
            </div>
          </button>

          {profileOpen && (
            <div
              className="card animate-in"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 8px)",
                width: 220,
                maxWidth: "calc(100vw - 32px)",
                padding: "var(--space-2)",
                zIndex: 50,
              }}
            >
              <div style={{ padding: "var(--space-3)" }}>
                <div style={{ fontWeight: 700 }}>{session?.user.name}</div>
                <div className="text-muted" style={{ fontSize: "var(--font-size-xs)" }}>
                  {session?.user.email}
                </div>
              </div>
              <button className="sidebar-link" style={{ width: "100%" }} onClick={() => { setProfileOpen(false); navigate("/settings"); }}>
                <User size={16} />
                <span>{t("header.profile")}</span>
              </button>
              <button className="sidebar-link" style={{ width: "100%" }} onClick={() => { setProfileOpen(false); navigate("/settings"); }}>
                <Settings size={16} />
                <span>{t("header.settings")}</span>
              </button>
              <button
                className="sidebar-link"
                style={{ width: "100%", color: "var(--color-danger-text)" }}
                onClick={() => {
                  setProfileOpen(false);
                  logout();
                  navigate("/login");
                }}
              >
                <LogOut size={16} />
                <span>{t("header.logout")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
