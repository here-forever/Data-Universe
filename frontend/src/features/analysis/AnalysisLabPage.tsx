import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BrainCircuit,
  Filter,
  FlaskConical,
  LoaderCircle,
  Sigma,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { RecoverableError } from "../../app/RecoverableError";
import { useI18n } from "../../i18n";
import { type ExploreFilter, queryKeys, vibeApi } from "../../lib/vibeApi";
import "../../styles/analysis.css";
import { useCollaboration } from "../collaboration/collaborationState";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { AdvancedWorkspace, AskWorkspace } from "./AnalysisWorkspaces";
import { ExploreWorkspace } from "./ExploreWorkspace";

type LabTab = "explore" | "ask" | "advanced";

export default function AnalysisLabPage() {
  const activeDatasetId = useWorkspaceStore((state) => state.activeDatasetId);
  const theme = useWorkspaceStore((state) => state.theme);
  const { language, t } = useI18n();
  const { chartFilter, send } = useCollaboration();
  const [tab, setTab] = useState<LabTab>("explore");
  const filters: ExploreFilter[] = chartFilter ? [chartFilter] : [];

  const dataset = useQuery({
    queryKey: queryKeys.dataset(activeDatasetId),
    queryFn: () => vibeApi.getDataset(activeDatasetId!),
    enabled: Boolean(activeDatasetId),
  });
  const exploration = useQuery({
    queryKey: queryKeys.explore(activeDatasetId, filters, language),
    queryFn: () => vibeApi.explore(activeDatasetId!, filters, language),
    enabled: Boolean(activeDatasetId),
  });
  const loadError = dataset.error ?? exploration.error;

  const applyFilter = (field: string, value: string) => {
    send("chart_filter", { field, value });
  };
  const clearFilters = () => {
    send("chart_filter_clear", {});
  };

  if (!activeDatasetId) {
    return <LabEmptyState />;
  }

  return (
    <section className="workbench-page analysis-lab">
      <header className="page-heading compact-heading">
        <div>
          <span className="eyebrow">
            <FlaskConical size={14} /> {t("analysis.eyebrow")}
          </span>
          <h1>{t("analysis.title")}</h1>
          <p>
            {t("analysis.subtitle", {
              name: dataset.data?.name ?? t("analysis.loadingDataset"),
            })}
          </p>
        </div>
        {filters.length > 0 && (
          <button className="filter-chip" onClick={clearFilters} type="button">
            <Filter size={14} />
            {filters[0].field} = {filters[0].value}
            <X size={14} />
          </button>
        )}
      </header>

      <div className="lab-tabs" role="tablist" aria-label={t("analysis.modes")}>
        <button
          aria-selected={tab === "explore"}
          className={tab === "explore" ? "is-active" : ""}
          onClick={() => setTab("explore")}
          role="tab"
          type="button"
        >
          <Sparkles size={17} />
          {t("analysis.explore")}
        </button>
        <button
          aria-selected={tab === "ask"}
          className={tab === "ask" ? "is-active" : ""}
          onClick={() => setTab("ask")}
          role="tab"
          type="button"
        >
          <BrainCircuit size={17} />
          {t("analysis.ask")}
        </button>
        <button
          aria-selected={tab === "advanced"}
          className={tab === "advanced" ? "is-active" : ""}
          onClick={() => setTab("advanced")}
          role="tab"
          type="button"
        >
          <Sigma size={17} />
          {t("analysis.advanced")}
        </button>
      </div>

      {exploration.isLoading || dataset.isLoading ? (
        <div className="surface-loading lab-loading">
          <LoaderCircle className="spin" />
          {t("analysis.loading")}
        </div>
      ) : loadError ? (
        <RecoverableError
          className="lab-loading"
          isRetrying={dataset.isFetching || exploration.isFetching}
          message={loadError.message}
          onRetry={() => {
            void Promise.all([dataset.refetch(), exploration.refetch()]);
          }}
        />
      ) : exploration.data && dataset.data ? (
        <>
          {tab === "explore" && (
            <ExploreWorkspace
              exploration={exploration.data}
              onFilter={applyFilter}
              theme={theme}
            />
          )}
          {tab === "ask" && <AskWorkspace datasetId={activeDatasetId} />}
          {tab === "advanced" && (
            <AdvancedWorkspace
              columns={dataset.data.profile.columns}
              datasetId={activeDatasetId}
            />
          )}
        </>
      ) : null}
    </section>
  );
}

function LabEmptyState() {
  const { t } = useI18n();
  return (
    <section className="workbench-page">
      <div className="empty-surface full-empty">
        <FlaskConical size={34} />
        <h2>{t("analysis.emptyTitle")}</h2>
        <p>{t("analysis.emptyBody")}</p>
        <Link className="command-button" to="/data">
          {t("analysis.goToData")}
          <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
