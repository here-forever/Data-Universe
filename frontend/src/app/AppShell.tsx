import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChevronDown,
  Languages,
  Moon,
  Sun,
  Upload,
  Users,
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { CollaborationProvider } from "../features/collaboration/CollaborationContext";
import { useCollaboration } from "../features/collaboration/collaborationState";
import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { useI18n } from "../i18n";
import { queryKeys, vibeApi } from "../lib/vibeApi";
import { navigationItems } from "./navigation";
import { preloadRoute } from "./routeModules";

export function AppShell() {
  return (
    <CollaborationProvider>
      <ShellFrame />
    </CollaborationProvider>
  );
}

function ShellFrame() {
  const location = useLocation();
  const activeDatasetId = useWorkspaceStore((state) => state.activeDatasetId);
  const setActiveDataset = useWorkspaceStore((state) => state.setActiveDataset);
  const theme = useWorkspaceStore((state) => state.theme);
  const toggleTheme = useWorkspaceStore((state) => state.toggleTheme);
  const { formatNumber, language, setLanguage, t } = useI18n();
  const { connected, online, recentEvent } = useCollaboration();
  const datasets = useQuery({
    queryKey: queryKeys.datasets,
    queryFn: vibeApi.listDatasets,
  });

  useEffect(() => {
    if (!datasets.data) return;
    const exists = datasets.data.some(
      (dataset) => dataset.id === activeDatasetId,
    );
    if (!exists) {
      setActiveDataset(datasets.data[0]?.id ?? null);
    }
  }, [activeDatasetId, datasets.data, setActiveDataset]);

  const currentNavigation =
    navigationItems.find((item) =>
      item.end
        ? location.pathname === item.path
        : location.pathname.startsWith(item.path),
    ) ?? navigationItems[0];
  const CurrentIcon = currentNavigation.icon;

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `Vibe Data Universe · ${t(currentNavigation.labelKey)}`;
  }, [currentNavigation.labelKey, language, t]);

  return (
    <div className="app-shell" data-language={language} data-theme={theme}>
      <aside className="app-rail" aria-label={t("nav.main")}>
        <NavLink
          aria-label="Vibe Data Universe"
          className="brand-mark"
          onFocus={() => preloadRoute("/")}
          onMouseEnter={() => preloadRoute("/")}
          to="/"
        >
          <span className="brand-pulse" aria-hidden="true" />
          <span className="brand-copy">
            <strong>VIBE</strong>
            <small>DATA UNIVERSE</small>
          </span>
        </NavLink>
        <nav className="rail-navigation">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                className={({ isActive }) =>
                  `rail-link${isActive ? " is-active" : ""}`
                }
                end={item.end}
                onFocus={() => preloadRoute(item.path)}
                onMouseEnter={() => preloadRoute(item.path)}
                to={item.path}
                title={`${t(item.labelKey)} · ${t(item.descriptionKey)}`}
              >
                <Icon aria-hidden="true" size={20} strokeWidth={1.8} />
                <span>
                  <strong>{t(item.labelKey)}</strong>
                  <small>{t(item.descriptionKey)}</small>
                </span>
              </NavLink>
            );
          })}
        </nav>
        <div
          className="rail-status"
          title={
            connected
              ? t("shell.online", { count: online })
              : t("shell.collaborationOffline")
          }
        >
          <span className={connected ? "status-dot is-online" : "status-dot"} />
          <div>
            <strong>
              {connected
                ? t("shell.online", { count: online })
                : t("shell.localMode")}
            </strong>
            <small>
              {recentEvent?.actor
                ? t("shell.recentAction", { actor: recentEvent.actor })
                : t("shell.analysisCanvas")}
            </small>
          </div>
        </div>
      </aside>

      <header className="app-topbar">
        <div className="view-identity">
          <CurrentIcon size={18} aria-hidden="true" />
          <span>{t(currentNavigation.labelKey)}</span>
        </div>
        <div className="dataset-select-wrap">
          <span className="dataset-select-label">
            {t("shell.currentDataset")}
          </span>
          <select
            aria-label={t("shell.selectDataset")}
            disabled={!datasets.data?.length}
            onChange={(event) => setActiveDataset(event.target.value || null)}
            value={activeDatasetId ?? ""}
          >
            {!datasets.data?.length && (
              <option value="">{t("shell.awaitingDataset")}</option>
            )}
            {datasets.data?.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {t("shell.datasetRows", {
                  name: dataset.name,
                  count: formatNumber(dataset.row_count),
                })}
              </option>
            ))}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </div>
        <div className="topbar-actions">
          <span className="online-chip" title={t("shell.onlineCount")}>
            {connected ? <Users size={15} /> : <Activity size={15} />}
            {connected ? online : t("shell.local")}
          </span>
          <div
            aria-label={t("language.control")}
            className="language-switcher"
            role="group"
          >
            <Languages aria-hidden="true" size={14} />
            <button
              aria-label={t("language.switchChinese")}
              aria-pressed={language === "zh-CN"}
              className={language === "zh-CN" ? "is-active" : ""}
              onClick={() => setLanguage("zh-CN")}
              title={t("language.switchChinese")}
              type="button"
            >
              中
            </button>
            <button
              aria-label={t("language.switchEnglish")}
              aria-pressed={language === "en-US"}
              className={language === "en-US" ? "is-active" : ""}
              onClick={() => setLanguage("en-US")}
              title={t("language.switchEnglish")}
              type="button"
            >
              EN
            </button>
          </div>
          <NavLink
            className="icon-button"
            onFocus={() => preloadRoute("/data")}
            onMouseEnter={() => preloadRoute("/data")}
            to="/data"
            title={t("shell.upload")}
          >
            <Upload size={18} />
          </NavLink>
          <button
            className="icon-button"
            onClick={toggleTheme}
            title={t("shell.toggleTheme")}
            type="button"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="app-content">
        <Outlet />
      </main>

      <nav className="mobile-navigation" aria-label={t("nav.mobile")}>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              className={({ isActive }) => (isActive ? "is-active" : "")}
              end={item.end}
              onFocus={() => preloadRoute(item.path)}
              onTouchStart={() => preloadRoute(item.path)}
              to={item.path}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{t(item.shortLabelKey)}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
