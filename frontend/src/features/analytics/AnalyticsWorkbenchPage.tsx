import { BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from "echarts/components";
import {
  init,
  use as registerEChartsModules,
  type EChartsCoreOption,
} from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Braces,
  Calculator,
  Check,
  ChevronDown,
  Download,
  Database,
  FileSpreadsheet,
  Filter,
  FolderOpen,
  LayoutDashboard,
  LoaderCircle,
  Play,
  RefreshCcw,
  Save,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useI18n } from "../../i18n";
import { listDatasets, type Dataset, type DatasetField } from "../datasets/api";
import type { DataView } from "../dataViews/api";
import {
  aggregateDataset,
  calculateCorrelation,
  calculateRegression,
  calculateStatistics,
  createAnalysisDefinition,
  exportAnalysis,
  listAnalysisDefinitions,
  materializeAnalysisDefinition,
  runAnalysisDefinition,
  type Aggregation,
  type AnalysisChartType,
  type AnalysisDefinition,
  type AnalysisFilter,
  type AnalysisRequest,
  type AnalysisResponse,
  type AnalysisResultType,
  type AnalysisViewMode,
  type AnalysisWorkspaceConfiguration,
  type CorrelationResponse,
  type FilterOperator,
  type RegressionResponse,
  type StatisticsResponse,
} from "./api";

registerEChartsModules([
  BarChart,
  CanvasRenderer,
  GridComponent,
  LegendComponent,
  LineChart,
  ScatterChart,
  TooltipComponent,
]);

const DEFAULT_PROJECT_ID = "prj_demo";
const NUMERIC_TYPES = new Set(["integer", "decimal"]);
const AGGREGATIONS: Array<{ label: [string, string]; value: Aggregation }> = [
  { label: ["求和", "Sum"], value: "sum" },
  { label: ["平均值", "Average"], value: "avg" },
  { label: ["计数", "Count"], value: "count" },
  { label: ["去重计数", "Distinct count"], value: "distinct_count" },
  { label: ["最小值", "Minimum"], value: "min" },
  { label: ["最大值", "Maximum"], value: "max" },
];
const FILTER_OPERATORS: Array<{
  label: [string, string];
  value: FilterOperator;
}> = [
  { label: ["等于", "Equals"], value: "eq" },
  { label: ["不等于", "Does not equal"], value: "ne" },
  { label: ["包含", "Contains"], value: "contains" },
  { label: ["大于", "Greater than"], value: "gt" },
  { label: ["大于等于", "Greater or equal"], value: "gte" },
  { label: ["小于", "Less than"], value: "lt" },
  { label: ["小于等于", "Less or equal"], value: "lte" },
  { label: ["为空", "Is null"], value: "is_null" },
  { label: ["不为空", "Is not null"], value: "not_null" },
];
const VIEW_MODES = [
  {
    label: ["维度分析", "Dimension analysis"],
    value: "dimension",
    icon: BarChart3,
  },
  { label: ["统计概览", "Statistics"], value: "statistics", icon: Sigma },
  { label: ["相关性", "Correlation"], value: "correlation", icon: Braces },
  { label: ["回归模型", "Regression"], value: "regression", icon: TrendingUp },
] as const;
type ViewMode = AnalysisViewMode;
type ChartType = AnalysisChartType;

export function AnalyticsWorkbenchPage() {
  const { formatNumber: formatLocaleNumber, t } = useI18n();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [selectedDatasetId, setSelectedDatasetId] = useState(
    searchParams.get("dataset_id") ?? "",
  );
  const [selectedDefinitionId, setSelectedDefinitionId] = useState(
    searchParams.get("analysis_id") ?? "",
  );
  const initialDefinitionAppliedRef = useRef(!searchParams.get("analysis_id"));
  const [analysisName, setAnalysisName] = useState("");
  const [dimension, setDimension] = useState("");
  const [secondaryDimension, setSecondaryDimension] = useState("");
  const [metric, setMetric] = useState("");
  const [aggregation, setAggregation] = useState<Aggregation>("sum");
  const [viewMode, setViewMode] = useState<ViewMode>("dimension");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [correlationFieldSelection, setCorrelationFieldSelection] = useState<
    string[]
  >([]);
  const [regressionFeatureSelection, setRegressionFeatureSelection] =
    useState("");
  const [regressionTargetSelection, setRegressionTargetSelection] =
    useState("");
  const [statisticsMaterialization, setStatisticsMaterialization] = useState<
    "statistics_numeric" | "statistics_categorical"
  >("statistics_numeric");
  const [filterField, setFilterField] = useState("");
  const [filterOperator, setFilterOperator] = useState<FilterOperator>("eq");
  const [filterValue, setFilterValue] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AnalysisFilter[]>([]);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [materializedView, setMaterializedView] = useState<DataView | null>(
    null,
  );

  const datasetsQuery = useQuery({
    queryKey: ["datasets", submittedProjectId],
    queryFn: () => listDatasets(submittedProjectId),
    enabled: submittedProjectId.length > 0,
  });
  const definitionsQuery = useQuery({
    queryKey: ["analysis-definitions", submittedProjectId],
    queryFn: () => listAnalysisDefinitions(submittedProjectId),
    enabled: submittedProjectId.length > 0,
  });
  const datasets = datasetsQuery.data?.items ?? [];
  const definitions = useMemo(
    () => definitionsQuery.data?.items ?? [],
    [definitionsQuery.data],
  );
  const selectedDefinition =
    definitions.find((item) => item.id === selectedDefinitionId) ?? null;
  const selectedDataset =
    datasets.find((item) => item.id === selectedDatasetId) ??
    datasets[0] ??
    null;
  const numericFields = useMemo(
    () =>
      selectedDataset?.fields.filter((field) =>
        NUMERIC_TYPES.has(field.inferred_type),
      ) ?? [],
    [selectedDataset],
  );
  const categoricalFields = useMemo(
    () =>
      selectedDataset?.fields.filter(
        (field) => !NUMERIC_TYPES.has(field.inferred_type),
      ) ?? [],
    [selectedDataset],
  );
  const preferredDimension = pickPreferredField(categoricalFields, [
    "region",
    "channel",
    "category",
    "province",
    "segment",
  ]);
  const preferredMetric = pickPreferredField(numericFields, [
    "revenue",
    "amount",
    "sales",
    "profit",
    "quantity",
    "cost",
  ]);
  const activeDimension = fieldValue(
    selectedDataset,
    dimension,
    preferredDimension ?? selectedDataset?.fields[0]?.name ?? "",
  );
  const activeSecondaryDimension = fieldValue(
    selectedDataset,
    secondaryDimension,
    "",
    true,
  );
  const activeMetric = fieldValue(
    selectedDataset,
    metric,
    preferredMetric ?? selectedDataset?.fields[0]?.name ?? "",
  );
  const activeCorrelationFields = useMemo(() => {
    const selectedFields = correlationFieldSelection.filter((field) =>
      numericFields.some((candidate) => candidate.name === field),
    );
    return selectedFields.length >= 2
      ? selectedFields
      : numericFields.slice(0, 5).map((field) => field.name);
  }, [correlationFieldSelection, numericFields]);
  const regressionFeature = fieldValue(
    selectedDataset,
    regressionFeatureSelection,
    numericFields[0]?.name ?? "",
  );
  const regressionTarget =
    regressionTargetSelection !== regressionFeature
      ? fieldValue(
          selectedDataset,
          regressionTargetSelection,
          numericFields.find((field) => field.name !== regressionFeature)
            ?.name ?? "",
        )
      : (numericFields.find((field) => field.name !== regressionFeature)
          ?.name ?? "");
  const metricAlias = `${aggregation}_${activeMetric || "rows"}`;
  const analysisRequest = useMemo<AnalysisRequest>(
    () => ({
      dimensions: [activeDimension, activeSecondaryDimension].filter(Boolean),
      metrics: [
        {
          field: aggregation === "count" && !activeMetric ? null : activeMetric,
          aggregation,
          alias: metricAlias,
        },
      ],
      filters: appliedFilters,
      sort_by: metricAlias,
      sort_direction: "desc",
      limit: 100,
    }),
    [
      activeDimension,
      activeMetric,
      activeSecondaryDimension,
      aggregation,
      appliedFilters,
      metricAlias,
    ],
  );
  const currentConfiguration = useMemo<AnalysisWorkspaceConfiguration>(
    () => ({
      aggregate: analysisRequest,
      statistics: { fields: [], filters: appliedFilters },
      correlation:
        activeCorrelationFields.length >= 2
          ? { fields: activeCorrelationFields, filters: appliedFilters }
          : null,
      regression:
        regressionFeature && regressionTarget
          ? {
              feature: regressionFeature,
              target: regressionTarget,
              filters: appliedFilters,
            }
          : null,
      presentation: { view_mode: viewMode, chart_type: chartType },
    }),
    [
      activeCorrelationFields,
      analysisRequest,
      appliedFilters,
      chartType,
      regressionFeature,
      regressionTarget,
      viewMode,
    ],
  );

  const aggregateQuery = useQuery({
    queryKey: ["analysis-aggregate", selectedDataset?.id, analysisRequest],
    queryFn: () => aggregateDataset(selectedDataset!.id, analysisRequest),
    enabled: Boolean(selectedDataset && activeMetric),
    retry: false,
  });
  const statisticsQuery = useQuery({
    queryKey: ["analysis-statistics", selectedDataset?.id, appliedFilters],
    queryFn: () => calculateStatistics(selectedDataset!.id, [], appliedFilters),
    enabled: Boolean(selectedDataset),
    retry: false,
  });
  const correlationQuery = useQuery({
    queryKey: [
      "analysis-correlation",
      selectedDataset?.id,
      activeCorrelationFields,
      appliedFilters,
    ],
    queryFn: () =>
      calculateCorrelation(
        selectedDataset!.id,
        activeCorrelationFields,
        appliedFilters,
      ),
    enabled:
      Boolean(selectedDataset) &&
      viewMode === "correlation" &&
      activeCorrelationFields.length >= 2,
    retry: false,
  });
  const regressionQuery = useQuery({
    queryKey: [
      "analysis-regression",
      selectedDataset?.id,
      regressionFeature,
      regressionTarget,
      appliedFilters,
    ],
    queryFn: () =>
      calculateRegression(
        selectedDataset!.id,
        regressionFeature,
        regressionTarget,
        appliedFilters,
      ),
    enabled:
      Boolean(selectedDataset) &&
      viewMode === "regression" &&
      Boolean(regressionFeature && regressionTarget),
    retry: false,
  });

  const createDefinitionMutation = useMutation({
    mutationFn: createAnalysisDefinition,
    onSuccess: (definition) => {
      setSelectedDefinitionId(definition.id);
      setAnalysisName(definition.name);
      void queryClient.invalidateQueries({
        queryKey: ["analysis-definitions", submittedProjectId],
      });
      setFeedback(t("分析已保存。", "Analysis saved."));
    },
    onError: (error) => {
      setFeedback(
        error instanceof Error
          ? error.message
          : t("保存分析失败", "Could not save analysis"),
      );
    },
  });
  const runDefinitionMutation = useMutation({
    mutationFn: runAnalysisDefinition,
    onSuccess: (result) => {
      applyDefinition(result.definition);
      const configuration = result.definition.configuration;
      queryClient.setQueryData(
        [
          "analysis-aggregate",
          result.definition.source_dataset_id,
          configuration.aggregate,
        ],
        result.aggregate,
      );
      queryClient.setQueryData(
        [
          "analysis-statistics",
          result.definition.source_dataset_id,
          configuration.statistics.filters,
        ],
        result.statistics,
      );
      if (configuration.correlation && result.correlation) {
        queryClient.setQueryData(
          [
            "analysis-correlation",
            result.definition.source_dataset_id,
            configuration.correlation.fields,
            configuration.correlation.filters,
          ],
          result.correlation,
        );
      }
      if (configuration.regression && result.regression) {
        queryClient.setQueryData(
          [
            "analysis-regression",
            result.definition.source_dataset_id,
            configuration.regression.feature,
            configuration.regression.target,
            configuration.regression.filters,
          ],
          result.regression,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ["analysis-definitions", submittedProjectId],
      });
      setFeedback(
        t("已按保存配置重新运行。", "Saved analysis rerun completed."),
      );
    },
    onError: (error) => {
      setFeedback(
        error instanceof Error
          ? error.message
          : t("重跑分析失败", "Could not rerun analysis"),
      );
    },
  });
  const materializeMutation = useMutation({
    mutationFn: ({
      definitionId,
      name,
      resultType,
    }: {
      definitionId: string;
      name: string;
      resultType: AnalysisResultType;
    }) =>
      materializeAnalysisDefinition(definitionId, {
        name,
        description: null,
        result_type: resultType,
      }),
    onSuccess: (dataView) => {
      setMaterializedView(dataView);
      setFeedback(
        t("分析结果已生成为数据视图。", "Analysis result materialized."),
      );
    },
    onError: (error) => {
      setFeedback(
        error instanceof Error
          ? error.message
          : t("生成数据视图失败", "Could not materialize data view"),
      );
    },
  });

  const applyDefinition = useCallback((definition: AnalysisDefinition) => {
    const configuration = definition.configuration;
    const savedMetric = configuration.aggregate.metrics[0];
    const savedFilter = configuration.aggregate.filters[0];
    initialDefinitionAppliedRef.current = true;
    setSelectedDefinitionId(definition.id);
    setSelectedDatasetId(definition.source_dataset_id);
    setAnalysisName(definition.name);
    setDimension(configuration.aggregate.dimensions[0] ?? "");
    setSecondaryDimension(configuration.aggregate.dimensions[1] ?? "");
    setMetric(savedMetric?.field ?? "");
    setAggregation(savedMetric?.aggregation ?? "count");
    setAppliedFilters(configuration.aggregate.filters);
    setFilterField(savedFilter?.field ?? "");
    setFilterOperator(savedFilter?.operator ?? "eq");
    setFilterValue(savedFilter?.value == null ? "" : String(savedFilter.value));
    setCorrelationFieldSelection(configuration.correlation?.fields ?? []);
    setRegressionFeatureSelection(configuration.regression?.feature ?? "");
    setRegressionTargetSelection(configuration.regression?.target ?? "");
    setViewMode(configuration.presentation.view_mode);
    setChartType(configuration.presentation.chart_type);
    setMaterializedView(null);
  }, []);

  useEffect(() => {
    if (!initialDefinitionAppliedRef.current && selectedDefinition) {
      applyDefinition(selectedDefinition);
    }
  }, [applyDefinition, selectedDefinition]);

  function saveCurrentDefinition() {
    if (!selectedDataset) return;
    const name = analysisName.trim();
    if (!name) {
      setFeedback(t("请输入分析名称。", "Enter an analysis name."));
      return;
    }
    createDefinitionMutation.mutate({
      project_id: submittedProjectId,
      source_dataset_id: selectedDataset.id,
      name,
      description: null,
      configuration: currentConfiguration,
    });
  }

  function rerunSelectedDefinition() {
    if (selectedDefinition) {
      runDefinitionMutation.mutate(selectedDefinition.id);
    }
  }

  function materializeSelectedResult() {
    if (!selectedDefinition) return;
    const resultType: AnalysisResultType =
      viewMode === "dimension"
        ? "aggregate"
        : viewMode === "statistics"
          ? statisticsMaterialization
          : viewMode;
    const resultLabel = t(
      {
        aggregate: "维度结果",
        statistics_numeric: "数值统计",
        statistics_categorical: "分类统计",
        correlation: "相关矩阵",
        regression: "回归结果",
      }[resultType],
      {
        aggregate: "Dimension result",
        statistics_numeric: "Numeric statistics",
        statistics_categorical: "Category statistics",
        correlation: "Correlation matrix",
        regression: "Regression result",
      }[resultType],
    );
    materializeMutation.mutate({
      definitionId: selectedDefinition.id,
      name: `${selectedDefinition.name} - ${resultLabel}`,
      resultType,
    });
  }

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProjectId = projectId.trim();
    setSubmittedProjectId(nextProjectId);
    setSelectedDatasetId("");
    setSelectedDefinitionId("");
    setAnalysisName("");
    setAppliedFilters([]);
    setCorrelationFieldSelection([]);
    setRegressionFeatureSelection("");
    setRegressionTargetSelection("");
    setMaterializedView(null);
  }

  function applyFilter() {
    if (!filterField) {
      setAppliedFilters([]);
      return;
    }
    const ignoresValue = ["is_null", "not_null"].includes(filterOperator);
    if (!ignoresValue && filterValue.trim().length === 0) {
      setFeedback(
        t("请输入筛选值后再应用。", "Enter a filter value before applying."),
      );
      return;
    }
    setAppliedFilters([
      {
        field: filterField,
        operator: filterOperator,
        value: ignoresValue ? null : filterValue.trim(),
      },
    ]);
    setFeedback(
      t("筛选已应用到全部分析视图。", "Filter applied to all analysis views."),
    );
  }

  async function download(format: "csv" | "xlsx") {
    if (!selectedDataset) return;
    setExporting(format);
    setFeedback(null);
    try {
      await exportAnalysis(selectedDataset.id, analysisRequest, format);
      setFeedback(
        t(
          `已生成 ${format.toUpperCase()} 分析结果。`,
          `${format.toUpperCase()} analysis exported.`,
        ),
      );
    } catch (error) {
      setFeedback(
        error instanceof Error ? error.message : t("导出失败", "Export failed"),
      );
    } finally {
      setExporting(null);
    }
  }

  const isLoading =
    datasetsQuery.isLoading ||
    datasetsQuery.isFetching ||
    definitionsQuery.isLoading;
  const primaryError =
    datasetsQuery.error ??
    definitionsQuery.error ??
    aggregateQuery.error ??
    statisticsQuery.error;

  return (
    <section className="analysis-page" aria-labelledby="analysis-title">
      <header className="analysis-header">
        <div>
          <div className="analysis-title-row">
            <span className="analysis-title-icon" aria-hidden="true">
              <Sparkles size={19} />
            </span>
            <h1 id="analysis-title">
              {t("分析工作台", "Analytics workspace")}
            </h1>
          </div>
          <p>
            {t(
              "用正式数据集完成指标计算、维度拆解、统计分析与轻量算法建模。",
              "Calculate metrics, break down dimensions, explore statistics, and build lightweight models from formal datasets.",
            )}
          </p>
        </div>
        <div className="analysis-header-actions">
          <button
            className="analysis-button secondary"
            disabled={!aggregateQuery.data || exporting !== null}
            onClick={() => void download("csv")}
            type="button"
          >
            <Download size={16} />
            {exporting === "csv" ? t("生成中", "Generating") : "CSV"}
          </button>
          <button
            className="analysis-button primary"
            disabled={!aggregateQuery.data || exporting !== null}
            onClick={() => void download("xlsx")}
            type="button"
          >
            {exporting === "xlsx" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <FileSpreadsheet size={16} />
            )}
            {t("导出 Excel", "Export Excel")}
          </button>
        </div>
      </header>

      <div
        className="analysis-flow"
        aria-label={t("分析流程", "Analysis flow")}
      >
        {[
          [t("数据集", "Dataset"), Boxes],
          [t("筛选", "Filter"), Filter],
          [t("计算", "Calculate"), Calculator],
          [t("可视化", "Visualize"), BarChart3],
          [t("导出", "Export"), Download],
        ].map(([label, Icon], index) => (
          <div className="analysis-flow-step" key={String(label)}>
            <span>
              <Icon size={15} />
            </span>
            <strong>{String(label)}</strong>
            {index < 4 ? <ArrowRight size={14} aria-hidden="true" /> : null}
          </div>
        ))}
      </div>

      <form className="analysis-project-bar" onSubmit={submitProject}>
        <label htmlFor="analysis-project-id">{t("项目", "Project")}</label>
        <input
          id="analysis-project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        />
        <button
          className="analysis-icon-button"
          aria-label={t("刷新项目数据", "Refresh project data")}
          type="submit"
        >
          <RefreshCcw size={16} />
        </button>
        <span>
          {selectedDataset
            ? t(
                `${datasets.length} 个可分析数据集`,
                `${formatLocaleNumber(datasets.length)} datasets available`,
              )
            : t("等待选择数据集", "Select a dataset")}
        </span>
      </form>

      <section
        className="analysis-assets-bar"
        aria-label={t("可复用分析", "Reusable analyses")}
      >
        <div className="analysis-assets-title">
          <FolderOpen size={16} />
          <div>
            <strong>{t("已保存分析", "Saved analyses")}</strong>
            <span>
              {t(
                `${definitions.length} 个配置`,
                `${formatLocaleNumber(definitions.length)} definitions`,
              )}
            </span>
          </div>
        </div>
        <SelectShell>
          <select
            aria-label={t("选择已保存分析", "Select saved analysis")}
            value={selectedDefinitionId}
            onChange={(event) => {
              const definition = definitions.find(
                (item) => item.id === event.target.value,
              );
              if (definition) applyDefinition(definition);
              else setSelectedDefinitionId("");
            }}
          >
            <option value="">{t("选择配置", "Select definition")}</option>
            {definitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.name}
              </option>
            ))}
          </select>
        </SelectShell>
        <button
          className="analysis-icon-button"
          aria-label={t("按保存配置重跑", "Rerun saved analysis")}
          disabled={!selectedDefinition || runDefinitionMutation.isPending}
          onClick={rerunSelectedDefinition}
          title={t("按保存配置重跑", "Rerun saved analysis")}
          type="button"
        >
          {runDefinitionMutation.isPending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Play size={15} />
          )}
        </button>
        <input
          aria-label={t("分析名称", "Analysis name")}
          placeholder={
            selectedDataset
              ? t(
                  `${selectedDataset.name} 分析`,
                  `${selectedDataset.name} analysis`,
                )
              : t("分析名称", "Analysis name")
          }
          value={analysisName}
          onChange={(event) => setAnalysisName(event.target.value)}
        />
        <button
          className="analysis-button secondary"
          disabled={!selectedDataset || createDefinitionMutation.isPending}
          onClick={saveCurrentDefinition}
          type="button"
        >
          {createDefinitionMutation.isPending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Save size={15} />
          )}
          {t("保存", "Save")}
        </button>
        {viewMode === "statistics" ? (
          <SelectShell>
            <select
              aria-label={t("统计结果类型", "Statistics result type")}
              value={statisticsMaterialization}
              onChange={(event) =>
                setStatisticsMaterialization(
                  event.target.value as
                    "statistics_numeric" | "statistics_categorical",
                )
              }
            >
              <option value="statistics_numeric">
                {t("数值统计", "Numeric")}
              </option>
              <option value="statistics_categorical">
                {t("分类统计", "Categorical")}
              </option>
            </select>
          </SelectShell>
        ) : null}
        <button
          className="analysis-button primary"
          disabled={!selectedDefinition || materializeMutation.isPending}
          onClick={materializeSelectedResult}
          type="button"
        >
          {materializeMutation.isPending ? (
            <LoaderCircle className="spin" size={15} />
          ) : (
            <Database size={15} />
          )}
          {t("生成数据视图", "Create data view")}
        </button>
      </section>

      {materializedView ? (
        <div className="analysis-promotion-bar" role="status">
          <div>
            <Check size={15} />
            <span>{materializedView.name}</span>
            <small>
              {formatLocaleNumber(materializedView.row_count)} {t("行", "rows")}
            </small>
          </div>
          <Link
            to={`/charts?project_id=${submittedProjectId}&data_view_id=${materializedView.id}`}
          >
            <BarChart3 size={14} />
            {t("配置图表", "Configure chart")}
          </Link>
          <Link
            to={`/dashboards?project_id=${submittedProjectId}&data_view_id=${materializedView.id}`}
          >
            <LayoutDashboard size={14} />
            {t("进入看板", "Open dashboard")}
          </Link>
        </div>
      ) : null}

      {feedback ? (
        <div className="analysis-feedback" role="status">
          <Check size={15} />
          <span>{feedback}</span>
          <button
            aria-label={t("关闭提示", "Dismiss message")}
            onClick={() => setFeedback(null)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {primaryError ? (
        <AnalysisState
          title={t("暂时无法读取分析数据", "Unable to load analysis data")}
          detail={
            primaryError instanceof Error
              ? primaryError.message
              : t("请检查后端服务。", "Check the backend service.")
          }
        />
      ) : null}

      {isLoading ? (
        <AnalysisState
          title={t("正在加载数据集", "Loading datasets")}
          detail={t(
            "正在读取字段结构与分析元数据。",
            "Reading fields and analysis metadata.",
          )}
          loading
        />
      ) : null}

      {!isLoading && !primaryError && datasets.length === 0 ? (
        <div className="analysis-empty">
          <FileSpreadsheet size={30} />
          <h2>
            {t("先导入一份 CSV 或 Excel", "Import a CSV or Excel file first")}
          </h2>
          <p>
            {t(
              "正式数据集创建后，才能进行指标计算、维度分析和结果导出。",
              "Create a formal dataset before calculating metrics, analyzing dimensions, or exporting results.",
            )}
          </p>
          <Link
            className="analysis-button primary"
            to={`/import?project_id=${submittedProjectId}`}
          >
            {t("去导入数据", "Import data")}
          </Link>
        </div>
      ) : null}

      {selectedDataset ? (
        <div className="analysis-layout">
          <aside
            className="analysis-config"
            aria-label={t("分析配置", "Analysis configuration")}
          >
            <div className="analysis-section-heading">
              <div>
                <small>CONFIGURATION</small>
                <h2>{t("计算配置", "Calculation settings")}</h2>
              </div>
              <span className="analysis-ready">
                <i />
                {t("已就绪", "Ready")}
              </span>
            </div>

            <Control label={t("数据集", "Dataset")} htmlFor="analysis-dataset">
              <SelectShell>
                <select
                  id="analysis-dataset"
                  value={selectedDataset.id}
                  onChange={(event) => {
                    setSelectedDatasetId(event.target.value);
                    setDimension("");
                    setSecondaryDimension("");
                    setMetric("");
                    setAppliedFilters([]);
                    setSelectedDefinitionId("");
                    setAnalysisName("");
                    setCorrelationFieldSelection([]);
                    setRegressionFeatureSelection("");
                    setRegressionTargetSelection("");
                    setMaterializedView(null);
                  }}
                >
                  {datasets.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name}
                    </option>
                  ))}
                </select>
              </SelectShell>
              <span className="control-meta">
                {formatLocaleNumber(selectedDataset.row_count)}{" "}
                {t("行", "rows")} ·{" "}
                {formatLocaleNumber(selectedDataset.fields.length)}{" "}
                {t("字段", "fields")}
              </span>
            </Control>

            <div className="config-divider" />
            <Control
              label={t("主维度", "Primary dimension")}
              htmlFor="analysis-dimension"
            >
              <SelectShell>
                <select
                  id="analysis-dimension"
                  value={activeDimension}
                  onChange={(event) => setDimension(event.target.value)}
                >
                  {selectedDataset.fields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Control>
            <Control
              label={t("次级维度", "Secondary dimension")}
              htmlFor="analysis-secondary-dimension"
            >
              <SelectShell>
                <select
                  id="analysis-secondary-dimension"
                  value={activeSecondaryDimension}
                  onChange={(event) =>
                    setSecondaryDimension(event.target.value)
                  }
                >
                  <option value="">{t("不拆分", "No split")}</option>
                  {selectedDataset.fields
                    .filter((field) => field.name !== activeDimension)
                    .map((field) => (
                      <option key={field.name} value={field.name}>
                        {field.name}
                      </option>
                    ))}
                </select>
              </SelectShell>
            </Control>
            <Control
              label={t("指标字段", "Metric field")}
              htmlFor="analysis-metric"
            >
              <SelectShell>
                <select
                  id="analysis-metric"
                  value={activeMetric}
                  onChange={(event) => setMetric(event.target.value)}
                >
                  {(numericFields.length
                    ? numericFields
                    : selectedDataset.fields
                  ).map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.name}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Control>
            <Control
              label={t("聚合方式", "Aggregation")}
              htmlFor="analysis-aggregation"
            >
              <SelectShell>
                <select
                  id="analysis-aggregation"
                  value={aggregation}
                  onChange={(event) =>
                    setAggregation(event.target.value as Aggregation)
                  }
                >
                  {AGGREGATIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t(item.label[0], item.label[1])}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Control>

            <div className="config-divider" />
            <div className="control-label-row">
              <label htmlFor="analysis-filter-field">
                {t("全局筛选", "Global filter")}
              </label>
              {appliedFilters.length ? (
                <span>{t("已启用", "Active")}</span>
              ) : null}
            </div>
            <SelectShell>
              <select
                id="analysis-filter-field"
                value={filterField}
                onChange={(event) => setFilterField(event.target.value)}
              >
                <option value="">{t("不筛选", "No filter")}</option>
                {selectedDataset.fields.map((field) => (
                  <option key={field.name} value={field.name}>
                    {field.name}
                  </option>
                ))}
              </select>
            </SelectShell>
            <div className="analysis-filter-row">
              <SelectShell>
                <select
                  aria-label={t("筛选运算符", "Filter operator")}
                  value={filterOperator}
                  onChange={(event) =>
                    setFilterOperator(event.target.value as FilterOperator)
                  }
                >
                  {FILTER_OPERATORS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {t(item.label[0], item.label[1])}
                    </option>
                  ))}
                </select>
              </SelectShell>
              <input
                aria-label={t("筛选值", "Filter value")}
                disabled={["is_null", "not_null"].includes(filterOperator)}
                placeholder={t("输入值", "Enter value")}
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
              />
            </div>
            <button
              className="analysis-apply-filter"
              onClick={applyFilter}
              type="button"
            >
              <Filter size={15} />
              {t("应用到全部视图", "Apply to all views")}
            </button>
            {appliedFilters.map((filter) => (
              <button
                className="active-filter"
                key={`${filter.field}-${filter.operator}`}
                onClick={() => setAppliedFilters([])}
                title={t("清除筛选", "Clear filter")}
                type="button"
              >
                <span>{filter.field}</span>
                {filter.operator}
                {filter.value === null ? "" : ` ${String(filter.value)}`}
                <X size={13} />
              </button>
            ))}
            {viewMode === "correlation" ? (
              <div className="analysis-model-config">
                <div className="config-divider" />
                <div className="control-label-row">
                  <label>{t("相关性字段", "Correlation fields")}</label>
                  <span>{activeCorrelationFields.length}/5</span>
                </div>
                <div className="analysis-field-checklist">
                  {numericFields.map((field) => {
                    const checked = activeCorrelationFields.includes(
                      field.name,
                    );
                    return (
                      <label key={field.name}>
                        <input
                          checked={checked}
                          onChange={() => {
                            const base = correlationFieldSelection.length
                              ? correlationFieldSelection
                              : activeCorrelationFields;
                            setCorrelationFieldSelection(
                              checked
                                ? base.filter((name) => name !== field.name)
                                : [...base, field.name].slice(0, 5),
                            );
                          }}
                          type="checkbox"
                        />
                        <span>{field.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {viewMode === "regression" ? (
              <div className="analysis-model-config">
                <div className="config-divider" />
                <Control
                  label={t("特征字段", "Feature field")}
                  htmlFor="analysis-regression-feature"
                >
                  <SelectShell>
                    <select
                      id="analysis-regression-feature"
                      value={regressionFeature}
                      onChange={(event) =>
                        setRegressionFeatureSelection(event.target.value)
                      }
                    >
                      {numericFields.map((field) => (
                        <option key={field.name} value={field.name}>
                          {field.name}
                        </option>
                      ))}
                    </select>
                  </SelectShell>
                </Control>
                <Control
                  label={t("目标字段", "Target field")}
                  htmlFor="analysis-regression-target"
                >
                  <SelectShell>
                    <select
                      id="analysis-regression-target"
                      value={regressionTarget}
                      onChange={(event) =>
                        setRegressionTargetSelection(event.target.value)
                      }
                    >
                      {numericFields
                        .filter((field) => field.name !== regressionFeature)
                        .map((field) => (
                          <option key={field.name} value={field.name}>
                            {field.name}
                          </option>
                        ))}
                    </select>
                  </SelectShell>
                </Control>
              </div>
            ) : null}
          </aside>

          <main className="analysis-results">
            <nav
              className="analysis-tabs"
              aria-label={t("分析视图", "Analysis views")}
            >
              {VIEW_MODES.map(({ label, value, icon: Icon }) => (
                <button
                  className={viewMode === value ? "is-active" : ""}
                  key={value}
                  onClick={() => setViewMode(value)}
                  type="button"
                >
                  <Icon size={15} />
                  {t(label[0], label[1])}
                </button>
              ))}
            </nav>

            <MetricBand
              aggregate={aggregateQuery.data}
              metricAlias={metricAlias}
              statistics={statisticsQuery.data}
            />

            {viewMode === "dimension" ? (
              <DimensionAnalysis
                chartType={chartType}
                dimension={activeDimension}
                metricAlias={metricAlias}
                onChartTypeChange={setChartType}
                query={aggregateQuery}
                secondaryDimension={activeSecondaryDimension}
              />
            ) : null}
            {viewMode === "statistics" ? (
              <StatisticsView
                data={statisticsQuery.data}
                isLoading={statisticsQuery.isFetching}
              />
            ) : null}
            {viewMode === "correlation" ? (
              <CorrelationView
                data={correlationQuery.data}
                error={correlationQuery.error}
                isLoading={correlationQuery.isFetching}
                numericFields={numericFields}
              />
            ) : null}
            {viewMode === "regression" ? (
              <RegressionView
                data={regressionQuery.data}
                error={regressionQuery.error}
                feature={regressionFeature}
                isLoading={regressionQuery.isFetching}
                target={regressionTarget}
              />
            ) : null}
          </main>
        </div>
      ) : null}
    </section>
  );
}

function Control({
  children,
  htmlFor,
  label,
}: {
  children: React.ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="analysis-control">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function SelectShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="analysis-select">
      {children}
      <ChevronDown size={14} aria-hidden="true" />
    </div>
  );
}

function MetricBand({
  aggregate,
  metricAlias,
  statistics,
}: {
  aggregate?: AnalysisResponse;
  metricAlias: string;
  statistics?: StatisticsResponse;
}) {
  const { formatNumber: formatLocaleNumber, t } = useI18n();
  const values =
    aggregate?.rows
      .map((row) => Number(row[metricAlias]))
      .filter(Number.isFinite) ?? [];
  const metricTotal = values.reduce((sum, value) => sum + value, 0);
  return (
    <section
      className="analysis-metric-band"
      aria-label={t("分析摘要", "Analysis summary")}
    >
      <SummaryMetric
        accent="sky"
        icon={Activity}
        label={t("参与计算", "Rows analyzed")}
        value={formatLocaleNumber(
          aggregate?.filtered_row_count ?? statistics?.filtered_row_count ?? 0,
        )}
        suffix={t("行", "rows")}
      />
      <SummaryMetric
        accent="mint"
        icon={Boxes}
        label={t("维度分组", "Dimension groups")}
        value={formatLocaleNumber(aggregate?.total_groups ?? 0)}
        suffix={t("组", "groups")}
      />
      <SummaryMetric
        accent="lilac"
        icon={Calculator}
        label={t("指标汇总", "Metric total")}
        value={formatNumber(metricTotal)}
        suffix=""
      />
      <SummaryMetric
        accent="rose"
        icon={Target}
        label={t("数值字段", "Numeric fields")}
        value={formatLocaleNumber(statistics?.numeric_fields.length ?? 0)}
        suffix={t("个", "")}
      />
    </section>
  );
}

function SummaryMetric({
  accent,
  icon: Icon,
  label,
  suffix,
  value,
}: {
  accent: "sky" | "mint" | "lilac" | "rose";
  icon: typeof Activity;
  label: string;
  suffix: string;
  value: string;
}) {
  return (
    <article className={`analysis-summary accent-${accent}`}>
      <div>
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>
        {value}
        <small>{suffix}</small>
      </strong>
    </article>
  );
}

function DimensionAnalysis({
  chartType,
  dimension,
  metricAlias,
  onChartTypeChange,
  query,
  secondaryDimension,
}: {
  chartType: ChartType;
  dimension: string;
  metricAlias: string;
  onChartTypeChange: (value: ChartType) => void;
  query: ReturnType<typeof useQuery<AnalysisResponse>>;
  secondaryDimension: string;
}) {
  const { t } = useI18n();
  if (query.isFetching) {
    return (
      <AnalysisState
        title={t("正在计算维度结果", "Calculating dimension results")}
        detail={t(
          "聚合、排序和图表正在同步刷新。",
          "Aggregation, sorting, and charts are refreshing.",
        )}
        loading
      />
    );
  }
  if (query.error || !query.data) {
    return (
      <AnalysisState
        title={t("无法生成维度分析", "Unable to generate dimension analysis")}
        detail={
          query.error instanceof Error
            ? query.error.message
            : t("请调整字段配置。", "Adjust the field configuration.")
        }
      />
    );
  }
  return (
    <>
      <section className="analysis-panel analysis-chart-panel">
        <div className="analysis-panel-heading">
          <div>
            <small>DIMENSION BREAKDOWN</small>
            <h2>
              {metricAlias} {t("按", "by")} {dimension}
              {secondaryDimension ? ` / ${secondaryDimension}` : ""}{" "}
              {t("拆解", "breakdown")}
            </h2>
          </div>
          <div
            className="chart-mode-switch"
            aria-label={t("图表类型", "Chart type")}
          >
            <button
              className={chartType === "bar" ? "is-active" : ""}
              onClick={() => onChartTypeChange("bar")}
              type="button"
            >
              {t("柱状图", "Bar")}
            </button>
            <button
              className={chartType === "line" ? "is-active" : ""}
              onClick={() => onChartTypeChange("line")}
              type="button"
            >
              {t("折线图", "Line")}
            </button>
          </div>
        </div>
        <AggregateChart
          chartType={chartType}
          data={query.data}
          dimensions={[dimension, secondaryDimension].filter(Boolean)}
          metricAlias={metricAlias}
        />
      </section>
      <AnalysisTable data={query.data} />
    </>
  );
}

function AggregateChart({
  chartType,
  data,
  dimensions,
  metricAlias,
}: {
  chartType: ChartType;
  data: AnalysisResponse;
  dimensions: string[];
  metricAlias: string;
}) {
  const { t } = useI18n();
  const chartRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current);
    const labels = data.rows.map((row) =>
      dimensions
        .map((field) => String(row[field] ?? t("空值", "Null")))
        .join(" / "),
    );
    const values = data.rows.map((row) => Number(row[metricAlias] ?? 0));
    const option: EChartsCoreOption = {
      animationDuration: 560,
      color: chartType === "bar" ? ["#4fc3f7"] : ["#a7e9d8"],
      grid: { bottom: 52, left: 58, right: 24, top: 24 },
      series: [
        {
          areaStyle:
            chartType === "line"
              ? { color: "rgba(167,233,216,.10)" }
              : undefined,
          barMaxWidth: 42,
          data: values,
          itemStyle:
            chartType === "bar" ? { borderRadius: [5, 5, 1, 1] } : undefined,
          smooth: chartType === "line",
          type: chartType,
        },
      ],
      tooltip: { trigger: "axis" },
      xAxis: {
        axisLabel: { color: "#9aa9c2", hideOverlap: true },
        axisLine: { lineStyle: { color: "rgba(232,244,255,.12)" } },
        data: labels,
        type: "category",
      },
      yAxis: {
        axisLabel: { color: "#9aa9c2" },
        splitLine: { lineStyle: { color: "rgba(232,244,255,.07)" } },
        type: "value",
      },
    };
    chart.setOption(option);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [chartType, data, dimensions, metricAlias, t]);
  return (
    <div
      className="analysis-chart"
      aria-label={t("维度分析图表", "Dimension analysis chart")}
      ref={chartRef}
    />
  );
}

function AnalysisTable({ data }: { data: AnalysisResponse }) {
  const { formatNumber: formatLocaleNumber, t } = useI18n();
  return (
    <section className="analysis-panel analysis-table-panel">
      <div className="analysis-panel-heading">
        <div>
          <small>RESULT DETAIL</small>
          <h2>{t("聚合明细", "Aggregate details")}</h2>
        </div>
        <span>
          {formatLocaleNumber(data.rows.length)} /{" "}
          {formatLocaleNumber(data.total_groups)} {t("个分组", "groups")}
        </span>
      </div>
      <div className="analysis-table-wrap">
        <table>
          <thead>
            <tr>
              {data.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, index) => (
              <tr key={`${data.dataset_id}-${index}`}>
                {data.columns.map((column) => (
                  <td key={column}>{formatCell(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatisticsView({
  data,
  isLoading,
}: {
  data?: StatisticsResponse;
  isLoading: boolean;
}) {
  const { formatNumber: formatLocaleNumber, t } = useI18n();
  if (isLoading)
    return (
      <AnalysisState
        title={t("正在计算描述统计", "Calculating descriptive statistics")}
        detail={t(
          "正在整理分布、分位数和离散程度。",
          "Preparing distributions, percentiles, and dispersion.",
        )}
        loading
      />
    );
  if (!data)
    return (
      <AnalysisState
        title={t("暂无统计结果", "No statistics available")}
        detail={t(
          "当前数据集没有可分析字段。",
          "The current dataset has no fields to analyze.",
        )}
      />
    );
  return (
    <div className="statistics-grid">
      <section className="analysis-panel statistics-numeric">
        <div className="analysis-panel-heading">
          <div>
            <small>DESCRIPTIVE STATISTICS</small>
            <h2>{t("数值字段概览", "Numeric field overview")}</h2>
          </div>
          <span>
            {formatLocaleNumber(data.numeric_fields.length)}{" "}
            {t("个字段", "fields")}
          </span>
        </div>
        <div className="analysis-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("字段", "Field")}</th>
                <th>{t("均值", "Mean")}</th>
                <th>{t("中位数", "Median")}</th>
                <th>{t("最小 / 最大", "Min / Max")}</th>
                <th>{t("标准差", "Std. dev.")}</th>
                <th>P25 / P75</th>
              </tr>
            </thead>
            <tbody>
              {data.numeric_fields.map((field) => (
                <tr key={field.field}>
                  <td>
                    <strong>{field.field}</strong>
                  </td>
                  <td>{formatNumber(field.mean)}</td>
                  <td>{formatNumber(field.median)}</td>
                  <td>
                    {formatNumber(field.minimum)} /{" "}
                    {formatNumber(field.maximum)}
                  </td>
                  <td>{formatNumber(field.standard_deviation)}</td>
                  <td>
                    {formatNumber(field.percentile_25)} /{" "}
                    {formatNumber(field.percentile_75)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="analysis-panel statistics-categories">
        <div className="analysis-panel-heading">
          <div>
            <small>CATEGORY DISTRIBUTION</small>
            <h2>{t("分类字段分布", "Categorical distributions")}</h2>
          </div>
        </div>
        <div className="category-list">
          {data.categorical_fields.map((field) => (
            <div className="category-row" key={field.field}>
              <div>
                <strong>{field.field}</strong>
                <span>
                  {formatLocaleNumber(field.distinct_count)}{" "}
                  {t("个不同值", "distinct values")}
                </span>
              </div>
              <div className="category-values">
                {field.top_values.slice(0, 4).map((item) => (
                  <span key={item.value}>
                    <i style={{ width: `${Math.max(4, item.ratio * 100)}%` }} />
                    {item.value}
                    <em>{item.count}</em>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CorrelationView({
  data,
  error,
  isLoading,
  numericFields,
}: {
  data?: CorrelationResponse;
  error: Error | null;
  isLoading: boolean;
  numericFields: DatasetField[];
}) {
  const { formatNumber: formatLocaleNumber, t } = useI18n();
  if (numericFields.length < 2)
    return (
      <AnalysisState
        title={t(
          "至少需要两个数值字段",
          "At least two numeric fields are required",
        )}
        detail={t(
          "请在清洗阶段转换字段类型，或选择包含多个数值字段的数据集。",
          "Convert field types during cleaning or select a dataset with multiple numeric fields.",
        )}
      />
    );
  if (isLoading)
    return (
      <AnalysisState
        title={t("正在计算相关系数", "Calculating correlations")}
        detail={t(
          "使用完整数值观测生成 Pearson 相关矩阵。",
          "Generating a Pearson correlation matrix from complete numeric observations.",
        )}
        loading
      />
    );
  if (error || !data)
    return (
      <AnalysisState
        title={t("无法生成相关矩阵", "Unable to generate correlation matrix")}
        detail={
          error?.message ?? t("请检查字段数据。", "Check the field data.")
        }
      />
    );
  return (
    <section className="analysis-panel correlation-panel">
      <div className="analysis-panel-heading">
        <div>
          <small>CORRELATION MATRIX</small>
          <h2>{t("数值字段相关性", "Numeric field correlation")}</h2>
        </div>
        <span>
          {formatLocaleNumber(data.observations)}{" "}
          {t("条完整观测", "complete observations")}
        </span>
      </div>
      <div
        className="correlation-matrix"
        style={{
          gridTemplateColumns: `minmax(110px, 1.4fr) repeat(${data.fields.length}, minmax(70px, 1fr))`,
        }}
      >
        <span />
        {data.fields.map((field) => (
          <strong key={`head-${field}`}>{field}</strong>
        ))}
        {data.matrix.flatMap((row, rowIndex) => [
          <strong key={`label-${data.fields[rowIndex]}`}>
            {data.fields[rowIndex]}
          </strong>,
          ...row.map((value, columnIndex) => (
            <span
              className="correlation-cell"
              key={`${rowIndex}-${columnIndex}`}
              style={{ backgroundColor: correlationColor(value) }}
              title={`${data.fields[rowIndex]} / ${data.fields[columnIndex]}`}
            >
              {value === null ? "-" : value.toFixed(2)}
            </span>
          )),
        ])}
      </div>
      <div className="correlation-legend">
        <span>{t("负相关", "Negative")}</span>
        <i />
        <span>{t("无相关", "None")}</span>
        <i />
        <span>{t("正相关", "Positive")}</span>
      </div>
    </section>
  );
}

function RegressionView({
  data,
  error,
  feature,
  isLoading,
  target,
}: {
  data?: RegressionResponse;
  error: Error | null;
  feature: string;
  isLoading: boolean;
  target: string;
}) {
  const { formatNumber: formatLocaleNumber, t } = useI18n();
  if (!feature || !target)
    return (
      <AnalysisState
        title={t(
          "至少需要两个数值字段",
          "At least two numeric fields are required",
        )}
        detail={t(
          "第一个数值字段作为特征，第二个作为预测目标。",
          "The first numeric field is the feature and the second is the prediction target.",
        )}
      />
    );
  if (isLoading)
    return (
      <AnalysisState
        title={t("正在拟合线性模型", "Fitting linear model")}
        detail={t(
          "正在计算系数、拟合优度和误差。",
          "Calculating coefficients, fit quality, and error.",
        )}
        loading
      />
    );
  if (error || !data)
    return (
      <AnalysisState
        title={t("模型拟合失败", "Model fitting failed")}
        detail={
          error?.message ??
          t("请检查数值字段分布。", "Check the numeric field distribution.")
        }
      />
    );
  return (
    <>
      <section
        className="model-metrics"
        aria-label={t("模型指标", "Model metrics")}
      >
        <div>
          <span>{t("特征 X", "Feature X")}</span>
          <strong>{feature}</strong>
        </div>
        <div>
          <span>{t("目标 Y", "Target Y")}</span>
          <strong>{target}</strong>
        </div>
        <div>
          <span>R²</span>
          <strong>{data.r_squared.toFixed(4)}</strong>
        </div>
        <div>
          <span>RMSE</span>
          <strong>{formatNumber(data.rmse)}</strong>
        </div>
        <div>
          <span>{t("模型方程", "Model equation")}</span>
          <strong>
            y = {data.slope.toFixed(3)}x + {data.intercept.toFixed(3)}
          </strong>
        </div>
      </section>
      <section className="analysis-panel analysis-chart-panel">
        <div className="analysis-panel-heading">
          <div>
            <small>LINEAR REGRESSION</small>
            <h2>
              {t(
                `${target} 对 ${feature} 的线性拟合`,
                `${target} fitted against ${feature}`,
              )}
            </h2>
          </div>
          <span>
            {formatLocaleNumber(data.observations)}{" "}
            {t("条观测", "observations")}
          </span>
        </div>
        <RegressionChart data={data} />
      </section>
    </>
  );
}

function RegressionChart({ data }: { data: RegressionResponse }) {
  const { t } = useI18n();
  const chartRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current);
    chart.setOption({
      color: ["#4fc3f7", "#ff9fa5"],
      grid: { bottom: 48, left: 58, right: 25, top: 35 },
      legend: {
        data: [t("实际值", "Actual"), t("预测线", "Prediction")],
        textStyle: { color: "#9aa9c2" },
      },
      series: [
        {
          data: data.points.map((point) => [point.feature, point.actual]),
          name: t("实际值", "Actual"),
          symbolSize: 9,
          type: "scatter",
        },
        {
          data: data.points.map((point) => [point.feature, point.predicted]),
          name: t("预测线", "Prediction"),
          showSymbol: false,
          smooth: true,
          type: "line",
        },
      ],
      tooltip: { trigger: "axis" },
      xAxis: {
        axisLabel: { color: "#9aa9c2" },
        splitLine: { lineStyle: { color: "rgba(232,244,255,.07)" } },
        type: "value",
      },
      yAxis: {
        axisLabel: { color: "#9aa9c2" },
        splitLine: { lineStyle: { color: "rgba(232,244,255,.07)" } },
        type: "value",
      },
    });
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [data, t]);
  return (
    <div
      className="analysis-chart"
      aria-label={t("线性回归图表", "Linear regression chart")}
      ref={chartRef}
    />
  );
}

function AnalysisState({
  detail,
  loading = false,
  title,
}: {
  detail: string;
  loading?: boolean;
  title: string;
}) {
  return (
    <div className="analysis-state">
      {loading ? (
        <LoaderCircle className="spin" size={24} />
      ) : (
        <Calculator size={24} />
      )}
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function fieldValue(
  dataset: Dataset | null,
  current: string,
  fallback: string,
  allowEmpty = false,
): string {
  if (allowEmpty && !current) return "";
  return dataset?.fields.some((field) => field.name === current)
    ? current
    : fallback;
}

function pickPreferredField(
  fields: DatasetField[],
  priorities: string[],
): string | undefined {
  for (const priority of priorities) {
    const exact = fields.find(
      (field) => field.name.toLocaleLowerCase() === priority,
    );
    if (exact) return exact.name;
    const partial = fields.find((field) =>
      field.name.toLocaleLowerCase().includes(priority),
    );
    if (partial) return partial.name;
  }
  return (
    fields.find((field) => !/(^|_)id$/i.test(field.name))?.name ??
    fields[0]?.name
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return formatNumber(value);
  return String(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
    value,
  );
}

function correlationColor(value: number | null): string {
  if (value === null) return "rgba(232,244,255,.04)";
  const strength = Math.min(1, Math.abs(value));
  return value >= 0
    ? `rgba(79,195,247,${0.08 + strength * 0.58})`
    : `rgba(255,159,165,${0.08 + strength * 0.58})`;
}
