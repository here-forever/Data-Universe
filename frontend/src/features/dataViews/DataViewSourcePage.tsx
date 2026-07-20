import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  LayoutDashboard,
  RefreshCcw,
  Save,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  createChart,
  createDashboard,
  getDataViewPreview,
  listCharts,
  listDashboards,
  listDataViews,
  type ChartDefinition,
  type DataView,
  type DataViewPreviewResponse,
  type DashboardDefinition,
} from "./api";
import { ChartPreview } from "./ChartPreview";
import {
  AGGREGATIONS,
  CHART_TYPES,
  createDefaultChartState,
  isNumericField,
  toChartConfigPayload,
  type Aggregation,
  type ChartBuilderState,
  type ChartType,
} from "./chartConfig";
import { DashboardPreview } from "./DashboardPreview";

const DEFAULT_PROJECT_ID = "prj_demo";
const PAGE_SIZE = 20;

interface DataViewSourcePageProps {
  mode: "charts" | "dashboards";
}

export function DataViewSourcePage({ mode }: DataViewSourcePageProps) {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isCharts = mode === "charts";
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const targetDataViewId = searchParams.get("data_view_id");
  const targetChartId = searchParams.get("chart_id");
  const targetDashboardId = searchParams.get("dashboard_id");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [selectedDataViewId, setSelectedDataViewId] = useState<string | null>(
    targetDataViewId,
  );
  const [layoutMode, setLayoutMode] = useState<"dashboard" | "report">(
    "dashboard",
  );
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);
  const [hasManualChartSelection, setHasManualChartSelection] = useState(false);
  const [chartState, setChartState] = useState<ChartBuilderState>(() =>
    createDefaultChartState(null),
  );
  const [chartStateDataViewId, setChartStateDataViewId] = useState<
    string | null
  >(null);

  const dataViewsQuery = useQuery({
    queryKey: ["data-views", submittedProjectId],
    queryFn: () => listDataViews(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const dataViews = useMemo(
    () => dataViewsQuery.data?.items ?? [],
    [dataViewsQuery.data],
  );

  const chartsQuery = useQuery({
    queryKey: ["charts", submittedProjectId],
    queryFn: () => listCharts(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const dashboardsQuery = useQuery({
    queryKey: ["dashboards", submittedProjectId],
    queryFn: () => listDashboards(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0 && mode === "dashboards",
  });

  const charts = useMemo(
    () => chartsQuery.data?.items ?? [],
    [chartsQuery.data],
  );
  const dashboards = useMemo(
    () => dashboardsQuery.data?.items ?? [],
    [dashboardsQuery.data],
  );
  const targetChart = useMemo(
    () => charts.find((chart) => chart.id === targetChartId) ?? null,
    [charts, targetChartId],
  );
  const effectiveSelectedDataViewId =
    selectedDataViewId ?? targetChart?.data_view_id ?? null;
  const selectedDataView = useMemo(
    () =>
      dataViews.find(
        (dataView) => dataView.id === effectiveSelectedDataViewId,
      ) ??
      dataViews[0] ??
      null,
    [dataViews, effectiveSelectedDataViewId],
  );
  const previewQuery = useQuery({
    queryKey: ["data-view-preview", selectedDataView?.id, PAGE_SIZE],
    queryFn: () => getDataViewPreview(selectedDataView?.id ?? "", 1, PAGE_SIZE),
    enabled: Boolean(selectedDataView?.id),
  });
  const selectedDataViewCharts = selectedDataView
    ? charts.filter((chart) => chart.data_view_id === selectedDataView.id)
    : [];
  const previewRows = previewQuery.data?.rows ?? [];
  const effectiveChartState =
    selectedDataView && chartStateDataViewId !== selectedDataView.id
      ? createDefaultChartState(selectedDataView)
      : chartState;

  const createChartMutation = useMutation({
    mutationFn: () => {
      if (!selectedDataView) {
        throw new Error("Select a data view before creating a chart.");
      }

      return createChart({
        project_id: submittedProjectId,
        data_view_id: selectedDataView.id,
        name: effectiveChartState.name.trim(),
        chart_type: effectiveChartState.chartType,
        config: toChartConfigPayload(
          effectiveChartState,
          selectedDataView,
          previewRows,
        ),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["charts", submittedProjectId],
      });
    },
  });

  const createDashboardMutation = useMutation({
    mutationFn: () => {
      const layoutChartIds =
        selectedChartIds.length > 0
          ? selectedChartIds
          : hasManualChartSelection
            ? []
            : [charts[0]?.id].filter(Boolean);
      if (layoutChartIds.length === 0) {
        throw new Error(
          "Create a chart before creating a dashboard or report.",
        );
      }

      return createDashboard({
        project_id: submittedProjectId,
        name:
          layoutMode === "dashboard"
            ? `${submittedProjectId} Dashboard`
            : `${submittedProjectId} Report`,
        layout: {
          mode: layoutMode,
          items: layoutChartIds.map((chartId, index) => ({
            chart_id: chartId,
            x: layoutMode === "dashboard" ? (index % 2) * 6 : 0,
            y:
              layoutMode === "dashboard"
                ? Math.floor(index / 2) * 4
                : index * 6,
            w: layoutMode === "dashboard" ? 6 : 12,
            h: layoutMode === "dashboard" ? 4 : 6,
          })),
        },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["dashboards", submittedProjectId],
      });
    },
  });

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
    setSelectedDataViewId(null);
    setSelectedChartIds([]);
    setHasManualChartSelection(false);
    setChartState(createDefaultChartState(null));
    setChartStateDataViewId(null);
    createChartMutation.reset();
    createDashboardMutation.reset();
  }

  function selectDataView(dataView: DataView) {
    setSelectedDataViewId(dataView.id);
    setChartState(createDefaultChartState(dataView));
    setChartStateDataViewId(dataView.id);
    setSelectedChartIds([]);
    setHasManualChartSelection(false);
    createChartMutation.reset();
    createDashboardMutation.reset();
  }

  const Icon = isCharts ? BarChart3 : LayoutDashboard;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">
            {isCharts ? "Charts" : "Dashboards"}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            {isCharts ? "Chart source workspace" : "Dashboard source workspace"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Select reusable data views as stable inputs for visual analysis and
            report layouts.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor={`${mode}-project-id`}>
            Project ID
          </label>
          <input
            id={`${mode}-project-id`}
            className="h-10 flex-1 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="Project ID"
          />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            type="submit"
          >
            <RefreshCcw className="h-4 w-4" />
            Load
          </button>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-md border border-line bg-panel shadow-panel">
          <PanelHeader
            icon={<Icon className="h-4 w-4 text-brand" />}
            title="Data views"
          />
          <div className="p-3">
            {dataViewsQuery.isLoading ? (
              <StateMessage title="Loading data views" />
            ) : dataViewsQuery.error ? (
              <StateMessage title="Could not load data views" tone="error" />
            ) : dataViews.length === 0 ? (
              <StateMessage title="No data views found" />
            ) : (
              <div className="space-y-2">
                {dataViews.map((dataView) => (
                  <DataViewButton
                    key={dataView.id}
                    dataView={dataView}
                    isActive={dataView.id === selectedDataView?.id}
                    onSelect={() => selectDataView(dataView)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="space-y-5">
          <DataViewSummary dataView={selectedDataView} />
          {isCharts ? (
            <ChartResourcePanel
              charts={selectedDataViewCharts}
              allCharts={charts}
              isLoading={chartsQuery.isLoading}
              error={chartsQuery.error}
              selectedDataView={selectedDataView}
              previewRows={previewRows}
              chartState={effectiveChartState}
              createdChart={createChartMutation.data}
              createError={createChartMutation.error}
              isCreating={createChartMutation.isPending}
              targetChartId={targetChartId}
              onChartStateChange={(nextState) => {
                setChartState(nextState);
                setChartStateDataViewId(selectedDataView?.id ?? null);
                createChartMutation.reset();
              }}
              onCreate={() => createChartMutation.mutate()}
            />
          ) : (
            <DashboardResourcePanel
              charts={
                selectedDataViewCharts.length > 0
                  ? selectedDataViewCharts
                  : charts
              }
              dashboards={dashboards}
              layoutMode={layoutMode}
              isLoading={dashboardsQuery.isLoading || chartsQuery.isLoading}
              error={dashboardsQuery.error ?? chartsQuery.error}
              createdDashboard={createDashboardMutation.data}
              createError={createDashboardMutation.error}
              isCreating={createDashboardMutation.isPending}
              selectedChartIds={selectedChartIds}
              hasManualChartSelection={hasManualChartSelection}
              targetDashboardId={targetDashboardId}
              onSelectedChartIdsChange={(chartIds) => {
                setSelectedChartIds(chartIds);
                setHasManualChartSelection(true);
                createDashboardMutation.reset();
              }}
              onLayoutModeChange={(nextMode) => {
                setLayoutMode(nextMode);
                createDashboardMutation.reset();
              }}
              onCreate={() => createDashboardMutation.mutate()}
            />
          )}
          <PreviewPanel
            mode={mode}
            preview={previewQuery.data}
            isLoading={previewQuery.isLoading || previewQuery.isFetching}
            error={previewQuery.error}
          />
        </div>
      </div>
    </section>
  );
}

function ChartResourcePanel({
  charts,
  allCharts,
  isLoading,
  error,
  selectedDataView,
  previewRows,
  chartState,
  createdChart,
  createError,
  isCreating,
  targetChartId,
  onChartStateChange,
  onCreate,
}: {
  charts: ChartDefinition[];
  allCharts: ChartDefinition[];
  isLoading: boolean;
  error: Error | null;
  selectedDataView: DataView | null;
  previewRows: Array<Record<string, string | number | boolean | null>>;
  chartState: ChartBuilderState;
  createdChart?: ChartDefinition;
  createError: Error | null;
  isCreating: boolean;
  targetChartId: string | null;
  onChartStateChange: (nextState: ChartBuilderState) => void;
  onCreate: () => void;
}) {
  const fields = selectedDataView?.fields ?? [];
  const numericFields = fields.filter((field) =>
    isNumericField(field.inferred_type),
  );
  const metricOptions =
    chartState.aggregation === "count" ? fields : numericFields;
  const canSave =
    Boolean(selectedDataView) &&
    chartState.name.trim().length > 0 &&
    chartState.dimension.length > 0 &&
    (chartState.aggregation === "count" || chartState.metric.length > 0);

  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<BarChart3 className="h-4 w-4 text-brand" />}
        title="Chart builder"
      />
      <div className="grid gap-4 p-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ChartPreview rows={previewRows} state={chartState} />
          <ResourceList
            emptyTitle={isLoading ? "Loading charts" : "No charts saved yet"}
            error={error}
            items={charts.length > 0 ? charts : allCharts}
            renderItem={(chart) => (
              <ResourceTile
                key={chart.id}
                isActive={chart.id === targetChartId}
                title={chart.name}
                meta={`${chart.chart_type} - ${chart.data_view_id}`}
              />
            )}
          />
        </div>
        <div className="space-y-3 rounded-md border border-brand/20 bg-blue-50 p-3">
          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              Chart name
            </span>
            <input
              aria-label="Chart name"
              className="mt-2 h-10 w-full rounded-md border border-brand/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={chartState.name}
              onChange={(event) =>
                onChartStateChange({ ...chartState, name: event.target.value })
              }
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              Chart type
            </span>
            <select
              aria-label="Chart type"
              className="mt-2 h-10 w-full rounded-md border border-brand/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={chartState.chartType}
              onChange={(event) =>
                onChartStateChange({
                  ...chartState,
                  chartType: event.target.value as ChartType,
                })
              }
            >
              {CHART_TYPES.map((chartType) => (
                <option key={chartType} value={chartType}>
                  {chartType}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              Dimension
            </span>
            <select
              aria-label="Dimension"
              className="mt-2 h-10 w-full rounded-md border border-brand/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={chartState.dimension}
              onChange={(event) =>
                onChartStateChange({
                  ...chartState,
                  dimension: event.target.value,
                })
              }
            >
              {fields.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              Metric
            </span>
            <select
              aria-label="Metric"
              className="mt-2 h-10 w-full rounded-md border border-brand/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-muted"
              disabled={chartState.aggregation === "count"}
              value={chartState.metric}
              onChange={(event) =>
                onChartStateChange({
                  ...chartState,
                  metric: event.target.value,
                })
              }
            >
              {metricOptions.map((field) => (
                <option key={field.name} value={field.name}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              Aggregation
            </span>
            <select
              aria-label="Aggregation"
              className="mt-2 h-10 w-full rounded-md border border-brand/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={chartState.aggregation}
              onChange={(event) =>
                onChartStateChange({
                  ...chartState,
                  aggregation: event.target.value as Aggregation,
                })
              }
            >
              {AGGREGATIONS.map((aggregation) => (
                <option key={aggregation} value={aggregation}>
                  {aggregation}
                </option>
              ))}
            </select>
          </label>

          <button
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSave || isCreating}
            onClick={onCreate}
            type="button"
          >
            <Save className="h-4 w-4" />
            {isCreating ? "Saving..." : "Save chart"}
          </button>
          {createdChart ? (
            <SuccessMessage message={`Saved ${createdChart.name}`} />
          ) : null}
          {createError ? <Alert message={createError.message} /> : null}
        </div>
      </div>
    </div>
  );
}

function DashboardResourcePanel({
  charts,
  dashboards,
  layoutMode,
  isLoading,
  error,
  createdDashboard,
  createError,
  isCreating,
  onLayoutModeChange,
  selectedChartIds,
  hasManualChartSelection,
  targetDashboardId,
  onSelectedChartIdsChange,
  onCreate,
}: {
  charts: ChartDefinition[];
  dashboards: DashboardDefinition[];
  layoutMode: "dashboard" | "report";
  isLoading: boolean;
  error: Error | null;
  createdDashboard?: DashboardDefinition;
  createError: Error | null;
  isCreating: boolean;
  onLayoutModeChange: (mode: "dashboard" | "report") => void;
  selectedChartIds: string[];
  hasManualChartSelection: boolean;
  targetDashboardId: string | null;
  onSelectedChartIdsChange: (chartIds: string[]) => void;
  onCreate: () => void;
}) {
  const activeChartIds =
    selectedChartIds.length > 0
      ? selectedChartIds
      : !hasManualChartSelection && charts[0]
        ? [charts[0].id]
        : [];

  function toggleChart(chartId: string) {
    if (selectedChartIds.includes(chartId)) {
      onSelectedChartIdsChange(selectedChartIds.filter((id) => id !== chartId));
      return;
    }
    onSelectedChartIdsChange([...selectedChartIds, chartId]);
  }

  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<Boxes className="h-4 w-4 text-brand" />}
        title="Dashboard and report builder"
      />
      <div className="grid gap-4 p-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <DashboardPreview
            charts={charts}
            mode={layoutMode}
            selectedChartIds={activeChartIds}
          />
          <ResourceList
            emptyTitle={isLoading ? "Loading layouts" : "No layouts saved yet"}
            error={error}
            items={dashboards}
            renderItem={(dashboard) => (
              <ResourceTile
                key={dashboard.id}
                isActive={dashboard.id === targetDashboardId}
                title={dashboard.name}
                meta={`${String(dashboard.layout.mode ?? "dashboard")} - ${dashboard.id}`}
              />
            )}
          />
        </div>
        <div className="space-y-3 rounded-md border border-amber/20 bg-amber/10 p-3">
          <label>
            <span className="text-xs font-semibold uppercase text-amber">
              Layout mode
            </span>
            <select
              className="mt-2 h-10 w-full rounded-md border border-amber/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-amber focus:ring-2 focus:ring-amber/20"
              value={layoutMode}
              onChange={(event) =>
                onLayoutModeChange(event.target.value as "dashboard" | "report")
              }
            >
              <option value="dashboard">Dashboard</option>
              <option value="report">Free report</option>
            </select>
          </label>
          <div>
            <p className="text-xs font-semibold uppercase text-amber">Charts</p>
            <div className="mt-2 max-h-64 space-y-2 overflow-auto">
              {charts.length === 0 ? (
                <div className="rounded-md border border-line bg-white px-3 py-4 text-sm text-muted">
                  No chart resources available.
                </div>
              ) : (
                charts.map((chart) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-white px-3 py-3 text-sm text-ink transition hover:border-amber"
                    key={chart.id}
                  >
                    <input
                      aria-label={`Select ${chart.name}`}
                      checked={activeChartIds.includes(chart.id)}
                      className="mt-1 h-4 w-4 rounded border-line text-amber"
                      onChange={() => toggleChart(chart.id)}
                      type="checkbox"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {chart.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">
                        {chart.chart_type} - {chart.data_view_id}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>
          <button
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-amber px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={activeChartIds.length === 0 || isCreating}
            onClick={onCreate}
            type="button"
          >
            <Save className="h-4 w-4" />
            {isCreating ? "Saving..." : "Save layout"}
          </button>
          {createdDashboard ? (
            <SuccessMessage message={`Saved ${createdDashboard.name}`} />
          ) : null}
          {createError ? <Alert message={createError.message} /> : null}
        </div>
      </div>
    </div>
  );
}

function ResourceList<T>({
  items,
  emptyTitle,
  error,
  renderItem,
}: {
  items: T[];
  emptyTitle: string;
  error: Error | null;
  renderItem: (item: T) => React.ReactNode;
}) {
  if (error) {
    return <StateMessage title="Could not load resources" tone="error" />;
  }
  if (items.length === 0) {
    return <StateMessage title={emptyTitle} />;
  }
  return (
    <div className="grid gap-2 md:grid-cols-2">{items.map(renderItem)}</div>
  );
}

function ResourceTile({
  title,
  meta,
  isActive = false,
}: {
  title: string;
  meta: string;
  isActive?: boolean;
}) {
  return (
    <div
      aria-current={isActive ? "true" : undefined}
      className={[
        "rounded-md border px-3 py-3",
        isActive ? "border-brand bg-blue-50" : "border-line bg-white",
      ].join(" ")}
    >
      <p className="truncate text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 truncate text-xs text-muted">{meta}</p>
    </div>
  );
}

function DataViewButton({
  dataView,
  isActive,
  onSelect,
}: {
  dataView: DataView;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={[
        "w-full rounded-md border px-3 py-3 text-left transition",
        isActive
          ? "border-brand bg-blue-50 shadow-sm"
          : "border-line bg-white hover:border-cyan hover:bg-slate-50",
      ].join(" ")}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {dataView.name}
          </p>
          <p className="mt-1 truncate text-xs text-muted">{dataView.id}</p>
        </div>
        <span className="rounded bg-emerald/10 px-2 py-1 text-xs font-semibold text-emerald">
          {dataView.row_count.toLocaleString()}
        </span>
      </div>
      <p className="mt-3 truncate font-mono text-xs text-brand">
        {dataView.physical_table_name}
      </p>
    </button>
  );
}

function DataViewSummary({ dataView }: { dataView: DataView | null }) {
  if (!dataView) {
    return (
      <div className="rounded-md border border-dashed border-line bg-panel p-6 text-sm text-muted">
        Select a data view to inspect fields and preview rows.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric
        label="Rows"
        value={dataView.row_count.toLocaleString()}
        tone="brand"
      />
      <Metric
        label="Fields"
        value={dataView.fields.length.toLocaleString()}
        tone="cyan"
      />
      <Metric label="Source" value={dataView.source_type} tone="emerald" />
      <Metric label="Table" value={dataView.physical_table_name} tone="amber" />
    </div>
  );
}

function PreviewPanel({
  mode,
  preview,
  isLoading,
  error,
}: {
  mode: "charts" | "dashboards";
  preview?: DataViewPreviewResponse;
  isLoading: boolean;
  error: Error | null;
}) {
  const fields = preview?.data_view.fields ?? [];
  const rows = preview?.rows ?? [];

  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<Table2 className="h-4 w-4 text-brand" />}
        title="Data source preview"
      />
      {isLoading ? (
        <StateMessage title="Loading preview rows" />
      ) : error ? (
        <StateMessage title="Could not load preview rows" tone="error" />
      ) : !preview ? (
        <StateMessage title="No data view selected" />
      ) : (
        <>
          <div className="border-b border-line px-4 py-3 text-sm text-muted">
            {mode === "charts"
              ? "Next step: configure chart type, dimension, and metric from this stable data view."
              : "Next step: arrange charts, tables, and filters from this stable data view."}
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-muted">
                <tr>
                  {fields.map((field) => (
                    <th
                      key={field.name}
                      className="border-b border-line px-4 py-3 font-semibold"
                    >
                      {field.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50">
                    {fields.map((field) => (
                      <td
                        key={field.name}
                        className="border-b border-line px-4 py-3 text-ink"
                      >
                        {formatCell(row[field.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      {icon}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "cyan" | "emerald" | "amber";
}) {
  const toneClass = {
    amber: "border-amber/20 bg-amber/10 text-amber",
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StateMessage({
  title,
  tone = "muted",
}: {
  title: string;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={[
        "m-4 rounded-md border px-4 py-6 text-center text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-line bg-slate-50 text-muted",
      ].join(" ")}
    >
      {title}
    </div>
  );
}

function SuccessMessage({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-md border border-emerald/20 bg-emerald/10 px-3 py-2 text-sm text-emerald">
      {message}
    </div>
  );
}

function Alert({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </div>
  );
}

function formatCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted">NULL</span>;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}
