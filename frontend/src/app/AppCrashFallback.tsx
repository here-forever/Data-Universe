import { AlertTriangle, House, RefreshCw } from "lucide-react";

import { useWorkspaceStore } from "../features/workspace/workspaceStore";
import { useI18n } from "../i18n";

export function AppCrashFallback() {
  const theme = useWorkspaceStore((state) => state.theme);
  const { t } = useI18n();

  return (
    <div className="app-shell app-crash-shell" data-theme={theme}>
      <main className="app-crash" role="alert">
        <section className="app-crash-card">
          <span className="app-crash-icon" aria-hidden="true">
            <AlertTriangle size={25} />
          </span>
          <span className="eyebrow">{t("recovery.eyebrow")}</span>
          <h1>{t("recovery.title")}</h1>
          <p>{t("recovery.body")}</p>
          <div className="recovery-actions">
            <button
              className="command-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              <RefreshCw size={15} />
              {t("recovery.reload")}
            </button>
            <a className="secondary-button" href="/">
              <House size={15} />
              {t("recovery.home")}
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
