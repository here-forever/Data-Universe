import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Search,
  Sparkles,
} from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { navigationItems } from "./navigation";

export function AppShell() {
  const location = useLocation();
  const sidebarCollapsed = useWorkspaceStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useWorkspaceStore((state) => state.toggleSidebar);
  const activeItem =
    navigationItems.find((item) =>
      item.path === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.path),
    ) ?? navigationItems[0];

  return (
    <div className={sidebarCollapsed ? "fluid-app is-collapsed" : "fluid-app"}>
      <AmbientBackdrop />
      <aside className="sidebar" aria-label="主导航">
        <NavLink
          className="brand-lockup"
          to="/"
          aria-label="雾流数据工作台首页"
        >
          <span className="brand-mark">
            <Sparkles size={18} strokeWidth={1.8} />
          </span>
          <span className="brand-copy">
            <strong>雾流</strong>
            <span>DATA ATELIER</span>
          </span>
        </NavLink>

        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          type="button"
          aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={17} />
          ) : (
            <ChevronLeft size={17} />
          )}
        </button>

        <nav className="sidebar-nav" aria-label="数据工作台导航">
          <p className="nav-caption">数据工作台</p>
          {navigationItems.map(({ label, path, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                isActive ? "nav-item is-active" : "nav-item"
              }
              end={path === "/"}
              key={path}
              title={sidebarCollapsed ? label : undefined}
              to={path}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-orb">
            <Cloud size={17} />
          </div>
          <div className="storage-copy">
            <span>本地对象存储</span>
            <strong>72.8% 可用</strong>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span>云析空间</span>
            <i />
            <strong>{activeItem.label}</strong>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="搜索" type="button">
              <Search size={18} />
            </button>
            <button
              className="icon-button has-dot"
              aria-label="通知"
              type="button"
            >
              <Bell size={18} />
            </button>
            <div className="user-chip">
              <div className="avatar">林</div>
              <div>
                <strong>林予安</strong>
                <span>分析负责人</span>
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
