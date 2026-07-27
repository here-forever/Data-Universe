import { useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Languages,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useCurrentUser } from "../features/auth/useCurrentUser";
import { logout } from "../features/auth/api";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { localize, useI18n } from "../i18n";
import { navigationItems } from "./navigation";

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const { language, setLanguage, t } = useI18n();
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const activeItem =
    navigationItems.find((item) =>
      item.path === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.path),
    ) ?? navigationItems[0];

  useEffect(() => {
    document.title = t("雾流数据台", "Mistflow Data Atelier");
  }, [t]);

  function handleLogout() {
    logout();
    queryClient.removeQueries({ queryKey: ["auth"] });
    navigate("/login", { replace: true });
  }

  return (
    <div className={sidebarCollapsed ? "fluid-app is-collapsed" : "fluid-app"}>
      <AmbientBackdrop />
      <aside className="sidebar" aria-label={t("主导航", "Main navigation")}>
        <NavLink
          className="brand-lockup"
          to="/"
          aria-label={t("雾流数据工作台首页", "Mistflow data workspace home")}
        >
          <span className="brand-mark">
            <Sparkles size={18} strokeWidth={1.8} />
          </span>
          <span className="brand-copy">
            <strong>{t("雾流", "Mistflow")}</strong>
            <span>DATA ATELIER</span>
          </span>
        </NavLink>

        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          type="button"
          aria-label={
            sidebarCollapsed
              ? t("展开侧边栏", "Expand sidebar")
              : t("折叠侧边栏", "Collapse sidebar")
          }
        >
          {sidebarCollapsed ? (
            <ChevronRight size={17} />
          ) : (
            <ChevronLeft size={17} />
          )}
        </button>

        <nav
          className="sidebar-nav"
          aria-label={t("数据工作台导航", "Data workspace navigation")}
        >
          <p className="nav-caption">{t("数据工作台", "Data workspace")}</p>
          {navigationItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "nav-item is-active" : "nav-item"
              }
              end={path === "/"}
              key={path}
              title={sidebarCollapsed ? localize(label, language) : undefined}
              to={path}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{localize(label, language)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-orb">
            <Cloud size={17} />
          </div>
          <div className="storage-copy">
            <span>{t("本地对象存储", "Local object storage")}</span>
            <strong>{t("72.8% 可用", "72.8% available")}</strong>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span>{t("云析空间", "Analytics space")}</span>
            <i />
            <strong>{localize(activeItem.label, language)}</strong>
          </div>
          <div className="topbar-actions">
            <div
              className="language-switcher"
              role="group"
              aria-label={t("界面语言", "Interface language")}
            >
              <Languages size={15} aria-hidden="true" />
              <button
                className={language === "zh-CN" ? "is-active" : undefined}
                onClick={() => setLanguage("zh-CN")}
                type="button"
                aria-pressed={language === "zh-CN"}
              >
                中文
              </button>
              <button
                className={language === "en-US" ? "is-active" : undefined}
                onClick={() => setLanguage("en-US")}
                type="button"
                aria-pressed={language === "en-US"}
              >
                EN
              </button>
            </div>
            <button
              className="icon-button"
              aria-label={t("搜索", "Search")}
              type="button"
            >
              <Search size={18} />
            </button>
            <button
              className="icon-button has-dot"
              aria-label={t("通知", "Notifications")}
              type="button"
            >
              <Bell size={18} />
            </button>
            <button
              className="icon-button"
              aria-label={t("退出登录", "Sign out")}
              onClick={handleLogout}
              type="button"
            >
              <LogOut size={18} />
            </button>
            <div className="user-chip">
              <div className="avatar">
                {currentUser?.display_name.slice(0, 1).toUpperCase() ?? "林"}
              </div>
              <div>
                <strong>{currentUser?.display_name ?? "林予安"}</strong>
                <span>
                  {currentUser?.is_platform_admin
                    ? t("平台管理员", "Platform administrator")
                    : t("分析负责人", "Analytics lead")}
                </span>
              </div>
            </div>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="glow glow-one" />
      <span className="glow glow-two" />
      <span className="glow glow-three" />
      <i className="particle particle-one" />
      <i className="particle particle-two" />
      <i className="particle particle-three" />
      <i className="particle particle-four" />
    </div>
  );
}
