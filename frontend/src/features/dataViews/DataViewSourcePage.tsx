import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronUp,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  LayoutDashboard,
  MousePointer2,
  Palette,
  Plus,
  RefreshCcw,
  Save,
  Table2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { useI18n } from "../../i18n";
import {
  createChart,
  createDashboard,
  exportDashboard,
  getDataViewPreview,
  listCharts,
  listDashboardExports,
  listDashboards,
  listDataViews,
  updateDashboard,
  type ChartDefinition,
  type DataView,
  type DataViewPreviewResponse,
  type DashboardDefinition,
  type ReportExportDefinition,
  type ReportExportFormat,
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
import {
  createLayoutItems,
  normalizeDashboardLayout,
  reconcileLayoutItems,
  type DashboardActiveSelection,
  type DashboardGlobalFilter,
  type DashboardLayoutItem,
  type DashboardTheme,
  type LayoutMode,
} from "./reportLayout";

const DEFAULT_PROJECT_ID = "prj_demo";
const PAGE_SIZE = 20;
interface DataViewSourcePageProps {
  mode: "charts" | "dashboards";
}

export function DataViewSourcePage({ mode }: DataViewSourcePageProps) {
  const { t } = useI18n();
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
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("dashboard");
  const [selectedChartIds, setSelectedChartIds] = useState<string[]>([]);
  const [hasManualChartSelection, setHasManualChartSelection] = useState(false);
  const [dashboardName, setDashboardName] = useState(
    `${initialProjectId} ${t("仪表盘", "Dashboard")}`,
  );
  const [dashboardTheme, setDashboardTheme] =
    useState<DashboardTheme>("aurora");
  const [layoutItems, setLayoutItems] = useState<DashboardLayoutItem[]>([]);
  const [globalFilters, setGlobalFilters] = useState<DashboardGlobalFilter[]>(
    [],
  );
  const [activeSelections, setActiveSelections] = useState<
    DashboardActiveSelection[]
  >([]);
  const [editingDashboardId, setEditingDashboardId] = useState<string | null>(
    targetDashboardId,
  );
  const [editingDashboardVersion, setEditingDashboardVersion] = useState(1);
  const loadedRouteDashboardRef = useRef<string | null>(null);
  const [chartState, setChartState] = useState<ChartBuilderState>(() =>
    createDefaultChartState(null, {
      chartSuffix: t("图表", "Chart"),
      fallbackName: t("数据视图图表", "Data view chart"),
    }),
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
  const targetDashboard = useMemo(
    () =>
      dashboards.find((dashboard) => dashboard.id === targetDashboardId) ??
      null,
    [dashboards, targetDashboardId],
  );
  const exportsQuery = useQuery({
    queryKey: ["dashboard-exports", editingDashboardId],
    queryFn: () => listDashboardExports(editingDashboardId ?? ""),
    enabled: Boolean(editingDashboardId) && mode === "dashboards",
  });
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
      ? createDefaultChartState(selectedDataView, {
          chartSuffix: t("图表", "Chart"),
          fallbackName: t("数据视图图表", "Data view chart"),
        })
      : chartState;

  useEffect(() => {
    if (
      !targetDashboard ||
      loadedRouteDashboardRef.current === targetDashboard.id
    ) {
      return;
    }
    const layout = normalizeDashboardLayout(targetDashboard);
    loadedRouteDashboardRef.current = targetDashboard.id;
    setEditingDashboardId(targetDashboard.id);
    setEditingDashboardVersion(targetDashboard.configuration_version ?? 1);
    setDashboardName(targetDashboard.name);
    setLayoutMode(layout.mode);
    setDashboardTheme(layout.theme);
    setLayoutItems(layout.items);
    setSelectedChartIds(layout.items.map((item) => item.chart_id));
    setHasManualChartSelection(true);
    setGlobalFilters(layout.global_filters);
    setActiveSelections(layout.active_selections);
  }, [targetDashboard]);

  const createChartMutation = useMutation({
    mutationFn: () => {
      if (!selectedDataView) {
        throw new Error(
          t(
            "创建图表前请选择数据视图。",
            "Select a data view before creating a chart.",
          ),
        );
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
          t(
            "创建仪表盘或报表前请先创建图表。",
            "Create a chart before creating a dashboard or report.",
          ),
        );
      }

      const layout = {
        schema_version: 1,
        mode: layoutMode,
        theme: dashboardTheme,
        items: reconcileLayoutItems(layoutItems, layoutChartIds, layoutMode),
        global_filters: globalFilters,
        active_selections: activeSelections,
      };
      const name = dashboardName.trim() || `${submittedProjectId} Report`;
      if (editingDashboardId) {
        return updateDashboard(editingDashboardId, {
          expected_version: editingDashboardVersion,
          name,
          layout,
        });
      }
      return createDashboard({
        project_id: submittedProjectId,
        name,
        layout,
      });
    },
    onSuccess: (dashboard) => {
      const layout = normalizeDashboardLayout(dashboard);
      setEditingDashboardId(dashboard.id);
      setEditingDashboardVersion(dashboard.configuration_version ?? 1);
      setDashboardName(dashboard.name);
      setLayoutItems(layout.items);
      void queryClient.invalidateQueries({
        queryKey: ["dashboards", submittedProjectId],
      });
    },
  });

  const exportDashboardMutation = useMutation({
    mutationFn: (format: ReportExportFormat) => {
      if (!editingDashboardId) {
        throw new Error(
          t("请先保存报表。", "Save the report before exporting."),
        );
      }
      return exportDashboard(editingDashboardId, format);
    },
    onSuccess: ({ blob, fileName }) => {
      downloadBlob(blob, fileName ?? "report-export");
      void queryClient.invalidateQueries({
        queryKey: ["dashboard-exports", editingDashboardId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["tasks", submittedProjectId],
      });
    },
  });

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
    setSelectedDataViewId(null);
    setSelectedChartIds([]);
    setHasManualChartSelection(false);
    resetDashboardDraft(projectId.trim());
    setChartState(
      createDefaultChartState(null, {
        chartSuffix: t("图表", "Chart"),
        fallbackName: t("数据视图图表", "Data view chart"),
      }),
    );
    setChartStateDataViewId(null);
    createChartMutation.reset();
    createDashboardMutation.reset();
    exportDashboardMutation.reset();
  }

  function selectDataView(dataView: DataView) {
    setSelectedDataViewId(dataView.id);
    setChartState(
      createDefaultChartState(dataView, {
        chartSuffix: t("图表", "Chart"),
        fallbackName: t("数据视图图表", "Data view chart"),
      }),
    );
    setChartStateDataViewId(dataView.id);
    if (isCharts) {
      setSelectedChartIds([]);
      setHasManualChartSelection(false);
    }
    createChartMutation.reset();
    createDashboardMutation.reset();
  }

  function resetDashboardDraft(nextProjectId = submittedProjectId) {
    setEditingDashboardId(null);
    setEditingDashboardVersion(1);
    setDashboardName(`${nextProjectId} ${t("仪表盘", "Dashboard")}`);
    setLayoutMode("dashboard");
    setDashboardTheme("aurora");
    setLayoutItems([]);
    setSelectedChartIds([]);
    setHasManualChartSelection(false);
    setGlobalFilters([]);
    setActiveSelections([]);
    createDashboardMutation.reset();
    exportDashboardMutation.reset();
  }

  function openDashboard(dashboard: DashboardDefinition) {
    const layout = normalizeDashboardLayout(dashboard);
    setEditingDashboardId(dashboard.id);
    setEditingDashboardVersion(dashboard.configuration_version ?? 1);
    setDashboardName(dashboard.name);
    setLayoutMode(layout.mode);
    setDashboardTheme(layout.theme);
    setLayoutItems(layout.items);
    setSelectedChartIds(layout.items.map((item) => item.chart_id));
    setHasManualChartSelection(true);
    setGlobalFilters(layout.global_filters);
    setActiveSelections(layout.active_selections);
    createDashboardMutation.reset();
    exportDashboardMutation.reset();
  }

  function toggleActiveSelection(selection: DashboardActiveSelection) {
    setActiveSelections((current) => {
      const existing = current.find(
        (item) => item.chart_id === selection.chart_id,
      );
      if (existing?.value === selection.value) {
        return current.filter((item) => item.chart_id !== selection.chart_id);
      }
      return [
        ...current.filter((item) => item.chart_id !== selection.chart_id),
        selection,
      ];
    });
    createDashboardMutation.reset();
  }

  const Icon = isCharts ? BarChart3 : LayoutDashboard;

  return (
    <section className="min-w-0 space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">
            {isCharts ? t("图表", "Charts") : t("仪表盘", "Dashboards")}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            {isCharts
              ? t("图表数据工作区", "Chart source workspace")
              : t("仪表盘数据工作区", "Dashboard source workspace")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            {t(
              "选择可复用的数据视图，作为可视化分析和报表布局的稳定数据输入。",
              "Select reusable data views as stable inputs for visual analysis and report layouts.",
            )}
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor={`${mode}-project-id`}>
            {t("项目 ID", "Project ID")}
          </label>
          <input
            id={`${mode}-project-id`}
            className="h-10 flex-1 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder={t("项目 ID", "Project ID")}
          />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            type="submit"
          >
            <RefreshCcw className="h-4 w-4" />
            {t("加载", "Load")}
          </button>
        </form>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-line bg-panel shadow-panel">
          <PanelHeader
            icon={<Icon className="h-4 w-4 text-brand" />}
            title={t("数据视图", "Data views")}
          />
          <div className="p-3">
            {dataViewsQuery.isLoading ? (
              <StateMessage
                title={t("正在加载数据视图", "Loading data views")}
              />
            ) : dataViewsQuery.error ? (
              <StateMessage
                title={t("无法加载数据视图", "Could not load data views")}
                tone="error"
              />
            ) : dataViews.length === 0 ? (
              <StateMessage
                title={t("未找到数据视图", "No data views found")}
              />
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

        <div className="min-w-0 space-y-5">
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
              exports={exportsQuery.data?.items ?? []}
              layoutMode={layoutMode}
              dashboardName={dashboardName}
              dashboardTheme={dashboardTheme}
              layoutItems={layoutItems}
              globalFilters={globalFilters}
              activeSelections={activeSelections}
              editingDashboardId={editingDashboardId}
              editingDashboardVersion={editingDashboardVersion}
              isLoading={dashboardsQuery.isLoading || chartsQuery.isLoading}
              error={dashboardsQuery.error ?? chartsQuery.error}
              createdDashboard={createDashboardMutation.data}
              createError={createDashboardMutation.error}
              isCreating={createDashboardMutation.isPending}
              exportError={exportDashboardMutation.error}
              isExporting={exportDashboardMutation.isPending}
              selectedChartIds={selectedChartIds}
              hasManualChartSelection={hasManualChartSelection}
              targetDashboardId={targetDashboardId}
              onDashboardNameChange={(name) => {
                setDashboardName(name);
                createDashboardMutation.reset();
              }}
              onDashboardThemeChange={(theme) => {
                setDashboardTheme(theme);
                createDashboardMutation.reset();
              }}
              onLayoutItemsChange={(items) => {
                setLayoutItems(items);
                createDashboardMutation.reset();
              }}
              onGlobalFiltersChange={(filters) => {
                setGlobalFilters(filters);
                createDashboardMutation.reset();
              }}
              onActiveSelectionsChange={(selections) => {
                setActiveSelections(selections);
                createDashboardMutation.reset();
              }}
              onSelectedChartIdsChange={(chartIds) => {
                setSelectedChartIds(chartIds);
                setLayoutItems((current) =>
                  reconcileLayoutItems(current, chartIds, layoutMode),
                );
                setHasManualChartSelection(true);
                createDashboardMutation.reset();
              }}
              onLayoutModeChange={(nextMode) => {
                if (
                  !editingDashboardId &&
                  dashboardName ===
                    defaultDashboardName(submittedProjectId, layoutMode, t)
                ) {
                  setDashboardName(
                    defaultDashboardName(submittedProjectId, nextMode, t),
                  );
                }
                setLayoutMode(nextMode);
                setLayoutItems(createLayoutItems(selectedChartIds, nextMode));
                createDashboardMutation.reset();
              }}
              onOpenDashboard={openDashboard}
              onNewDashboard={() => resetDashboardDraft()}
              onPointSelect={toggleActiveSelection}
              onCreate={() => createDashboardMutation.mutate()}
              onExport={(format) => exportDashboardMutation.mutate(format)}
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
  const { t } = useI18n();
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
    <div className="min-w-0 rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<BarChart3 className="h-4 w-4 text-brand" />}
        title={t("图表构建器", "Chart builder")}
      />
      <div className="grid gap-4 p-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <ChartPreview rows={previewRows} state={chartState} />
          <ResourceList
            emptyTitle={
              isLoading
                ? t("正在加载图表", "Loading charts")
                : t("暂无已保存图表", "No charts saved yet")
            }
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
              {t("图表名称", "Chart name")}
            </span>
            <input
              aria-label={t("图表名称", "Chart name")}
              className="mt-2 h-10 w-full rounded-md border border-brand/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={chartState.name}
              onChange={(event) =>
                onChartStateChange({ ...chartState, name: event.target.value })
              }
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              {t("图表类型", "Chart type")}
            </span>
            <select
              aria-label={t("图表类型", "Chart type")}
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
                  {t(
                    {
                      bar: "柱状图",
                      line: "折线图",
                      pie: "饼图",
                      table: "表格",
                    }[chartType],
                    { bar: "Bar", line: "Line", pie: "Pie", table: "Table" }[
                      chartType
                    ],
                  )}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase text-brand">
              {t("维度", "Dimension")}
            </span>
            <select
              aria-label={t("维度", "Dimension")}
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
              {t("指标", "Metric")}
            </span>
            <select
              aria-label={t("指标", "Metric")}
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
              {t("聚合方式", "Aggregation")}
            </span>
            <select
              aria-label={t("聚合方式", "Aggregation")}
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
                  {t(
                    { sum: "求和", avg: "平均值", count: "计数" }[aggregation],
                    { sum: "Sum", avg: "Average", count: "Count" }[aggregation],
                  )}
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
            {isCreating
              ? t("保存中...", "Saving...")
              : t("保存图表", "Save chart")}
          </button>
          {createdChart ? (
            <SuccessMessage
              message={t(
                `已保存 ${createdChart.name}`,
                `Saved ${createdChart.name}`,
              )}
            />
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
  exports,
  layoutMode,
  dashboardName,
  dashboardTheme,
  layoutItems,
  globalFilters,
  activeSelections,
  editingDashboardId,
  editingDashboardVersion,
  isLoading,
  error,
  createdDashboard,
  createError,
  isCreating,
  exportError,
  isExporting,
  onLayoutModeChange,
  onDashboardNameChange,
  onDashboardThemeChange,
  onLayoutItemsChange,
  onGlobalFiltersChange,
  onActiveSelectionsChange,
  selectedChartIds,
  hasManualChartSelection,
  targetDashboardId,
  onSelectedChartIdsChange,
  onOpenDashboard,
  onNewDashboard,
  onPointSelect,
  onCreate,
  onExport,
}: {
  charts: ChartDefinition[];
  dashboards: DashboardDefinition[];
  exports: ReportExportDefinition[];
  layoutMode: LayoutMode;
  dashboardName: string;
  dashboardTheme: DashboardTheme;
  layoutItems: DashboardLayoutItem[];
  globalFilters: DashboardGlobalFilter[];
  activeSelections: DashboardActiveSelection[];
  editingDashboardId: string | null;
  editingDashboardVersion: number;
  isLoading: boolean;
  error: Error | null;
  createdDashboard?: DashboardDefinition;
  createError: Error | null;
  isCreating: boolean;
  exportError: Error | null;
  isExporting: boolean;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onDashboardNameChange: (name: string) => void;
  onDashboardThemeChange: (theme: DashboardTheme) => void;
  onLayoutItemsChange: (items: DashboardLayoutItem[]) => void;
  onGlobalFiltersChange: (filters: DashboardGlobalFilter[]) => void;
  onActiveSelectionsChange: (selections: DashboardActiveSelection[]) => void;
  selectedChartIds: string[];
  hasManualChartSelection: boolean;
  targetDashboardId: string | null;
  onSelectedChartIdsChange: (chartIds: string[]) => void;
  onOpenDashboard: (dashboard: DashboardDefinition) => void;
  onNewDashboard: () => void;
  onPointSelect: (selection: DashboardActiveSelection) => void;
  onCreate: () => void;
  onExport: (format: ReportExportFormat) => void;
}) {
  const { t } = useI18n();
  const activeChartIds =
    selectedChartIds.length > 0
      ? selectedChartIds
      : !hasManualChartSelection && charts[0]
        ? [charts[0].id]
        : [];
  const activeItems = reconcileLayoutItems(
    layoutItems,
    activeChartIds,
    layoutMode,
  );
  const chartById = new Map(charts.map((chart) => [chart.id, chart]));
  const availableFields = Array.from(
    new Map(
      charts.flatMap((chart) =>
        [chart.config.dimension, chart.config.metric].flatMap((field) =>
          typeof field === "string" && field
            ? [
                [
                  `${chart.data_view_id}::${field}`,
                  { field, dataViewId: chart.data_view_id },
                ] as const,
              ]
            : [],
        ),
      ),
    ).values(),
  );

  function toggleChart(chartId: string) {
    if (activeChartIds.includes(chartId)) {
      onSelectedChartIdsChange(activeChartIds.filter((id) => id !== chartId));
      return;
    }
    onSelectedChartIdsChange([...activeChartIds, chartId]);
  }

  function addFilter() {
    const firstField = availableFields[0];
    if (!firstField) return;
    onGlobalFiltersChange([
      ...globalFilters,
      {
        id: `filter_${Date.now()}`,
        field: firstField.field,
        operator: "eq",
        value: "",
        data_view_id: firstField.dataViewId,
      },
    ]);
  }

  function updateFilter(
    filterId: string,
    patch: Partial<DashboardGlobalFilter>,
  ) {
    onGlobalFiltersChange(
      globalFilters.map((filter) =>
        filter.id === filterId ? { ...filter, ...patch } : filter,
      ),
    );
  }

  function updateLayoutItem(
    chartId: string,
    patch: Partial<DashboardLayoutItem>,
  ) {
    onLayoutItemsChange(
      activeItems.map((item) =>
        item.chart_id === chartId ? { ...item, ...patch } : item,
      ),
    );
  }

  function moveLayoutItem(chartId: string, direction: -1 | 1) {
    const currentIndex = activeItems.findIndex(
      (item) => item.chart_id === chartId,
    );
    const targetIndex = currentIndex + direction;
    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= activeItems.length
    ) {
      return;
    }
    const next = [...activeItems];
    [next[currentIndex], next[targetIndex]] = [
      next[targetIndex],
      next[currentIndex],
    ];
    onLayoutItemsChange(
      next.map((item, index) => ({ ...item, y: index * item.h })),
    );
  }

  return (
    <div className="report-builder min-w-0 overflow-hidden rounded-2xl border border-violet-200/70 bg-panel shadow-panel">
      <div className="report-builder-header flex flex-col gap-3 border-b border-violet-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              {t("报表与交付工作台", "Report delivery studio")}
            </h3>
            <p className="mt-1 text-xs text-muted">
              {editingDashboardId
                ? t(
                    `正在编辑版本 ${editingDashboardVersion}`,
                    `Editing version ${editingDashboardVersion}`,
                  )
                : t("新建未保存草稿", "New unsaved draft")}
            </p>
          </div>
        </div>
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-violet-200 bg-white px-4 text-xs font-semibold text-violet-700 transition hover:-translate-y-0.5 hover:shadow-sm"
          onClick={onNewDashboard}
          type="button"
        >
          <Plus className="h-4 w-4" />
          {t("新建报表", "New report")}
        </button>
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          {activeSelections.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-violet-50/80 px-3 py-2">
              <MousePointer2 className="h-4 w-4 text-violet-600" />
              <span className="text-xs font-semibold text-violet-800">
                {t("联动选择", "Active selections")}
              </span>
              {activeSelections.map((selection) => (
                <button
                  className="rounded-full bg-white px-2.5 py-1 text-xs text-violet-700 shadow-sm transition hover:bg-violet-100"
                  key={selection.chart_id}
                  onClick={() =>
                    onActiveSelectionsChange(
                      activeSelections.filter(
                        (item) => item.chart_id !== selection.chart_id,
                      ),
                    )
                  }
                  type="button"
                >
                  {selection.field}: {String(selection.value)} ×
                </button>
              ))}
            </div>
          ) : null}
          <DashboardPreview
            charts={charts}
            filters={globalFilters}
            items={activeItems}
            mode={layoutMode}
            onPointSelect={onPointSelect}
            selections={activeSelections}
            theme={dashboardTheme}
          />
          <section className="rounded-xl border border-line bg-white/80 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-muted">
                  {t("已保存报表", "Saved reports")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {t(
                    "点击即可恢复完整配置",
                    "Open to restore the full configuration",
                  )}
                </p>
              </div>
              <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                {dashboards.length}
              </span>
            </div>
            <ResourceList
              emptyTitle={
                isLoading
                  ? t("正在加载布局", "Loading layouts")
                  : t("暂无已保存布局", "No layouts saved yet")
              }
              error={error}
              items={dashboards}
              renderItem={(dashboard) => (
                <ResourceTile
                  key={dashboard.id}
                  isActive={
                    dashboard.id === editingDashboardId ||
                    dashboard.id === targetDashboardId
                  }
                  title={dashboard.name}
                  meta={`${String(dashboard.layout.mode ?? "dashboard")} · v${dashboard.configuration_version ?? 1}`}
                  onClick={() => onOpenDashboard(dashboard)}
                />
              )}
            />
          </section>
        </div>
        <div className="report-builder-panel space-y-4 rounded-2xl border border-violet-200/80 p-3.5">
          <label>
            <span className="text-xs font-semibold uppercase text-violet-700">
              {t("报表名称", "Report name")}
            </span>
            <input
              aria-label={t("报表名称", "Report name")}
              className="mt-2 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
              onChange={(event) => onDashboardNameChange(event.target.value)}
              value={dashboardName}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="text-xs font-semibold uppercase text-violet-700">
                {t("布局模式", "Layout mode")}
              </span>
              <select
                aria-label={t("布局模式", "Layout mode")}
                className="mt-2 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                value={layoutMode}
                onChange={(event) =>
                  onLayoutModeChange(event.target.value as LayoutMode)
                }
              >
                <option value="dashboard">{t("仪表盘", "Dashboard")}</option>
                <option value="report">{t("自由报表", "Free report")}</option>
                <option value="screen">{t("数据大屏", "Data screen")}</option>
              </select>
            </label>
            <label>
              <span className="flex items-center gap-1.5 text-xs font-semibold uppercase text-violet-700">
                <Palette className="h-3.5 w-3.5" />
                {t("主题", "Theme")}
              </span>
              <select
                aria-label={t("报表主题", "Report theme")}
                className="mt-2 h-10 w-full rounded-lg border border-violet-200 bg-white px-3 text-sm text-ink outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                onChange={(event) =>
                  onDashboardThemeChange(event.target.value as DashboardTheme)
                }
                value={dashboardTheme}
              >
                <option value="aurora">{t("极光", "Aurora")}</option>
                <option value="warm">{t("暖霞", "Warm")}</option>
                <option value="minimal">{t("简洁", "Minimal")}</option>
              </select>
            </label>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-violet-700">
              {t("图表", "Charts")}
            </p>
            <div className="mt-2 max-h-64 space-y-2 overflow-auto">
              {charts.length === 0 ? (
                <div className="rounded-md border border-line bg-white px-3 py-4 text-sm text-muted">
                  {t("暂无可用图表资源。", "No chart resources available.")}
                </div>
              ) : (
                charts.map((chart) => (
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white px-3 py-3 text-sm text-ink transition hover:border-violet-300 hover:shadow-sm"
                    key={chart.id}
                  >
                    <input
                      aria-label={t(
                        `选择 ${chart.name}`,
                        `Select ${chart.name}`,
                      )}
                      checked={activeChartIds.includes(chart.id)}
                      className="mt-1 h-4 w-4 rounded border-line text-violet-600"
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
          {activeItems.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase text-violet-700">
                {t("布局编排", "Layout arrangement")}
              </p>
              <div className="mt-2 space-y-2">
                {activeItems.map((item, index) => {
                  const chart = chartById.get(item.chart_id);
                  return (
                    <div
                      className="rounded-lg border border-violet-100 bg-white p-2.5"
                      key={item.chart_id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-xs font-semibold text-ink">
                          {chart?.name ?? item.chart_id}
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            aria-label={t("上移图表", "Move chart up")}
                            className="rounded p-1 text-muted transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => moveLayoutItem(item.chart_id, -1)}
                            type="button"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={t("下移图表", "Move chart down")}
                            className="rounded p-1 text-muted transition hover:bg-violet-50 hover:text-violet-700 disabled:opacity-30"
                            disabled={index === activeItems.length - 1}
                            onClick={() => moveLayoutItem(item.chart_id, 1)}
                            type="button"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={t("移除图表", "Remove chart")}
                            className="rounded p-1 text-muted transition hover:bg-rose-50 hover:text-rose-600"
                            onClick={() => toggleChart(item.chart_id)}
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-[11px] text-muted">
                          {t("宽度", "Width")}
                          <select
                            aria-label={t(
                              `${chart?.name ?? ""} 宽度`,
                              `${chart?.name ?? ""} width`,
                            )}
                            className="mt-1 h-8 w-full rounded border border-line bg-slate-50 px-2 text-xs text-ink"
                            onChange={(event) =>
                              updateLayoutItem(item.chart_id, {
                                w: Number(event.target.value),
                              })
                            }
                            value={item.w}
                          >
                            <option value={4}>4/12</option>
                            <option value={6}>6/12</option>
                            <option value={8}>8/12</option>
                            <option value={12}>12/12</option>
                          </select>
                        </label>
                        <label className="text-[11px] text-muted">
                          {t("高度", "Height")}
                          <select
                            aria-label={t(
                              `${chart?.name ?? ""} 高度`,
                              `${chart?.name ?? ""} height`,
                            )}
                            className="mt-1 h-8 w-full rounded border border-line bg-slate-50 px-2 text-xs text-ink"
                            onChange={(event) =>
                              updateLayoutItem(item.chart_id, {
                                h: Number(event.target.value),
                              })
                            }
                            value={item.h}
                          >
                            <option value={3}>{t("紧凑", "Compact")}</option>
                            <option value={4}>{t("标准", "Standard")}</option>
                            <option value={6}>{t("宽松", "Spacious")}</option>
                            <option value={8}>{t("展示", "Showcase")}</option>
                          </select>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-sky-800">
                <Filter className="h-4 w-4" />
                {t("全局筛选", "Global filters")}
              </p>
              <button
                className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 shadow-sm disabled:opacity-40"
                disabled={availableFields.length === 0}
                onClick={addFilter}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("添加", "Add")}
              </button>
            </div>
            <div className="mt-2 space-y-2">
              {globalFilters.length === 0 ? (
                <p className="rounded-lg border border-dashed border-sky-200 bg-white/70 px-3 py-3 text-xs text-muted">
                  {t(
                    "添加筛选后，所有关联图表会同步响应。",
                    "Filters update every compatible chart together.",
                  )}
                </p>
              ) : (
                globalFilters.map((filter) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_92px] gap-2 rounded-lg bg-white p-2"
                    key={filter.id}
                  >
                    <select
                      aria-label={t("筛选字段", "Filter field")}
                      className="h-8 min-w-0 rounded border border-line bg-white px-2 text-xs text-ink"
                      onChange={(event) => {
                        const [dataViewId, field] =
                          event.target.value.split("::");
                        updateFilter(filter.id, {
                          data_view_id: dataViewId,
                          field,
                        });
                      }}
                      value={`${filter.data_view_id ?? ""}::${filter.field}`}
                    >
                      {availableFields.map((field) => (
                        <option
                          key={`${field.dataViewId}::${field.field}`}
                          value={`${field.dataViewId}::${field.field}`}
                        >
                          {field.field}
                        </option>
                      ))}
                    </select>
                    <button
                      className="inline-flex h-8 items-center justify-center gap-1 rounded border border-rose-100 text-xs text-rose-600 transition hover:bg-rose-50"
                      onClick={() =>
                        onGlobalFiltersChange(
                          globalFilters.filter((item) => item.id !== filter.id),
                        )
                      }
                      type="button"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("删除", "Remove")}
                    </button>
                    <select
                      aria-label={t("筛选条件", "Filter operator")}
                      className="h-8 rounded border border-line bg-white px-2 text-xs text-ink"
                      onChange={(event) =>
                        updateFilter(filter.id, {
                          operator: event.target
                            .value as DashboardGlobalFilter["operator"],
                        })
                      }
                      value={filter.operator}
                    >
                      <option value="eq">=</option>
                      <option value="neq">≠</option>
                      <option value="contains">{t("包含", "contains")}</option>
                      <option value="gt">&gt;</option>
                      <option value="gte">≥</option>
                      <option value="lt">&lt;</option>
                      <option value="lte">≤</option>
                    </select>
                    <input
                      aria-label={t("筛选值", "Filter value")}
                      className="h-8 rounded border border-line bg-white px-2 text-xs text-ink"
                      onChange={(event) =>
                        updateFilter(filter.id, { value: event.target.value })
                      }
                      placeholder={t("输入筛选值", "Filter value")}
                      value={String(filter.value ?? "")}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
          <button
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-45"
            disabled={activeChartIds.length === 0 || isCreating}
            onClick={onCreate}
            type="button"
          >
            <Save className="h-4 w-4" />
            {isCreating
              ? t("保存中...", "Saving...")
              : editingDashboardId
                ? t("保存新版本", "Save new version")
                : t("保存报表", "Save report")}
          </button>
          <div>
            <p className="text-xs font-semibold uppercase text-violet-700">
              {t("导出交付", "Export delivery")}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <ExportButton
                disabled={!editingDashboardId || isExporting}
                icon={<FileText className="h-4 w-4" />}
                label="PDF"
                onClick={() => onExport("pdf")}
              />
              <ExportButton
                disabled={!editingDashboardId || isExporting}
                icon={<FileSpreadsheet className="h-4 w-4" />}
                label="Excel"
                onClick={() => onExport("xlsx")}
              />
              <ExportButton
                disabled={!editingDashboardId || isExporting}
                icon={<Download className="h-4 w-4" />}
                label="CSV"
                onClick={() => onExport("csv")}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {isExporting
                ? t(
                    "正在生成并登记导出任务...",
                    "Generating and recording the export task...",
                  )
                : t(
                    `已生成 ${exports.length} 个导出物`,
                    `${exports.length} exports generated`,
                  )}
            </p>
            {exports.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {exports.slice(0, 3).map((item) => (
                  <div
                    className="flex items-center justify-between gap-2 rounded-lg border border-violet-100 bg-white px-2.5 py-2 text-xs"
                    key={item.id}
                  >
                    <span className="min-w-0 truncate text-ink">
                      {item.file_name}
                    </span>
                    <span className="shrink-0 uppercase text-violet-700">
                      {item.export_format}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          {createdDashboard ? (
            <SuccessMessage
              message={t(
                `已保存 ${createdDashboard.name}`,
                `Saved ${createdDashboard.name}`,
              )}
            />
          ) : null}
          {createError ? <Alert message={createError.message} /> : null}
          {exportError ? <Alert message={exportError.message} /> : null}
        </div>
      </div>
    </div>
  );
}

function ExportButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-violet-200 bg-white text-xs font-semibold text-violet-700 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
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
  const { t } = useI18n();
  if (error) {
    return (
      <StateMessage
        title={t("无法加载资源", "Could not load resources")}
        tone="error"
      />
    );
  }
  if (items.length === 0) {
    return <StateMessage title={emptyTitle} />;
  }
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
      {items.map(renderItem)}
    </div>
  );
}

function ResourceTile({
  title,
  meta,
  isActive = false,
  onClick,
}: {
  title: string;
  meta: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  const className = [
    "w-full rounded-lg border px-3 py-3 text-left transition",
    isActive
      ? "border-violet-400 bg-violet-50 shadow-sm"
      : "border-line bg-white hover:border-violet-200 hover:bg-violet-50/40",
  ].join(" ");
  const content = (
    <>
      <p className="truncate text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 truncate text-xs text-muted">{meta}</p>
    </>
  );
  if (onClick) {
    return (
      <button
        aria-current={isActive ? "true" : undefined}
        className={className}
        onClick={onClick}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <div aria-current={isActive ? "true" : undefined} className={className}>
      {content}
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
  const { formatNumber } = useI18n();
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
          {formatNumber(dataView.row_count)}
        </span>
      </div>
      <p className="mt-3 truncate font-mono text-xs text-brand">
        {dataView.physical_table_name}
      </p>
    </button>
  );
}

function DataViewSummary({ dataView }: { dataView: DataView | null }) {
  const { formatNumber, t } = useI18n();
  if (!dataView) {
    return (
      <div className="rounded-md border border-dashed border-line bg-panel p-6 text-sm text-muted">
        {t(
          "选择数据视图以检查字段和预览数据。",
          "Select a data view to inspect fields and preview rows.",
        )}
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-4">
      <Metric
        label={t("行数", "Rows")}
        value={formatNumber(dataView.row_count)}
        tone="brand"
      />
      <Metric
        label={t("字段数", "Fields")}
        value={formatNumber(dataView.fields.length)}
        tone="cyan"
      />
      <Metric
        label={t("来源", "Source")}
        value={dataView.source_type}
        tone="emerald"
      />
      <Metric
        label={t("数据表", "Table")}
        value={dataView.physical_table_name}
        tone="amber"
      />
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
  const { t } = useI18n();
  const fields = preview?.data_view.fields ?? [];
  const rows = preview?.rows ?? [];

  return (
    <div className="min-w-0 rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<Table2 className="h-4 w-4 text-brand" />}
        title={t("数据源预览", "Data source preview")}
      />
      {isLoading ? (
        <StateMessage title={t("正在加载预览数据", "Loading preview rows")} />
      ) : error ? (
        <StateMessage
          title={t("无法加载预览数据", "Could not load preview rows")}
          tone="error"
        />
      ) : !preview ? (
        <StateMessage title={t("未选择数据视图", "No data view selected")} />
      ) : (
        <>
          <div className="border-b border-line px-4 py-3 text-sm text-muted">
            {mode === "charts"
              ? t(
                  "下一步：基于此稳定数据视图配置图表类型、维度和指标。",
                  "Next step: configure chart type, dimension, and metric from this stable data view.",
                )
              : t(
                  "下一步：基于此稳定数据视图编排图表、表格和筛选器。",
                  "Next step: arrange charts, tables, and filters from this stable data view.",
                )}
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function defaultDashboardName(
  projectId: string,
  mode: LayoutMode,
  t: (zh: string, en: string) => string,
) {
  if (mode === "screen") {
    return `${projectId} ${t("数据大屏", "Data Screen")}`;
  }
  if (mode === "report") {
    return `${projectId} ${t("报表", "Report")}`;
  }
  return `${projectId} ${t("仪表盘", "Dashboard")}`;
}
