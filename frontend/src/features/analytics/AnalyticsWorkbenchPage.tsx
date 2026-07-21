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
import { useQuery } from "@tanstack/react-query";
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
  FileSpreadsheet,
  Filter,
  LoaderCircle,
  RefreshCcw,
  Sigma,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { listDatasets, type Dataset, type DatasetField } from "../datasets/api";
import {
  aggregateDataset,
  calculateCorrelation,
  calculateRegression,
  calculateStatistics,
  exportAnalysis,
  type Aggregation,
  type AnalysisFilter,
  type AnalysisRequest,
  type AnalysisResponse,
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
const AGGREGATIONS: Array<{ label: string; value: Aggregation }> = [
  { label: "求和", value: "sum" },
  { label: "平均值", value: "avg" },
  { label: "计数", value: "count" },
  { label: "去重计数", value: "distinct_count" },
  { label: "最小值", value: "min" },
  { label: "最大值", value: "max" },
];
const FILTER_OPERATORS: Array<{ label: string; value: FilterOperator }> = [
  { label: "等于", value: "eq" },
  { label: "不等于", value: "ne" },
  { label: "包含", value: "contains" },
  { label: "大于", value: "gt" },
  { label: "大于等于", value: "gte" },
  { label: "小于", value: "lt" },
  { label: "小于等于", value: "lte" },
  { label: "为空", value: "is_null" },
  { label: "不为空", value: "not_null" },
];
const VIEW_MODES = [
  { label: "维度分析", value: "dimension", icon: BarChart3 },
  { label: "统计概览", value: "statistics", icon: Sigma },
  { label: "相关性", value: "correlation", icon: Braces },
  { label: "回归模型", value: "regression", icon: TrendingUp },
] as const;
type ViewMode = (typeof VIEW_MODES)[number]["value"];
type ChartType = "bar" | "line";

export function AnalyticsWorkbenchPage() {
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [selectedDatasetId, setSelectedDatasetId] = useState(
    searchParams.get("dataset_id") ?? "",
  );
  const [dimension, setDimension] = useState("");
  const [secondaryDimension, setSecondaryDimension] = useState("");
  const [metric, setMetric] = useState("");
  const [aggregation, setAggregation] = useState<Aggregation>("sum");
  const [viewMode, setViewMode] = useState<ViewMode>("dimension");
  const [chartType, setChartType] = useState<ChartType>("bar");
  const [filterField, setFilterField] = useState("");
  const [filterOperator, setFilterOperator] = useState<FilterOperator>("eq");
  const [filterValue, setFilterValue] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<AnalysisFilter[]>([]);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const datasetsQuery = useQuery({
    queryKey: ["datasets", submittedProjectId],
    queryFn: () => listDatasets(submittedProjectId),
    enabled: submittedProjectId.length > 0,
  });
  const datasets = datasetsQuery.data?.items ?? [];
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
  const regressionFeature = numericFields[0]?.name ?? "";
  const regressionTarget = numericFields[1]?.name ?? "";
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
  const correlationFields = numericFields
    .slice(0, 5)
    .map((field) => field.name);
  const correlationQuery = useQuery({
    queryKey: [
      "analysis-correlation",
      selectedDataset?.id,
      correlationFields,
      appliedFilters,
    ],
    queryFn: () =>
      calculateCorrelation(
        selectedDataset!.id,
        correlationFields,
        appliedFilters,
      ),
    enabled:
      Boolean(selectedDataset) &&
      viewMode === "correlation" &&
      correlationFields.length >= 2,
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

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProjectId = projectId.trim();
    setSubmittedProjectId(nextProjectId);
    setSelectedDatasetId("");
    setAppliedFilters([]);
  }

  function applyFilter() {
    if (!filterField) {
      setAppliedFilters([]);
      return;
    }
    const ignoresValue = ["is_null", "not_null"].includes(filterOperator);
    if (!ignoresValue && filterValue.trim().length === 0) {
      setFeedback("请输入筛选值后再应用。 ");
      return;
    }
    setAppliedFilters([
      {
        field: filterField,
        operator: filterOperator,
        value: ignoresValue ? null : filterValue.trim(),
      },
    ]);
    setFeedback("筛选已应用到全部分析视图。");
  }

  async function download(format: "csv" | "xlsx") {
    if (!selectedDataset) return;
    setExporting(format);
    setFeedback(null);
    try {
      await exportAnalysis(selectedDataset.id, analysisRequest, format);
      setFeedback(`已生成 ${format.toUpperCase()} 分析结果。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExporting(null);
    }
  }

  const isLoading = datasetsQuery.isLoading || datasetsQuery.isFetching;
  const primaryError =
    datasetsQuery.error ?? aggregateQuery.error ?? statisticsQuery.error;

  return (
    <section className="analysis-page" aria-labelledby="analysis-title">
      <header className="analysis-header">
        <div>
          <div className="analysis-title-row">
            <span className="analysis-title-icon" aria-hidden="true">
              <Sparkles size={19} />
            </span>
            <h1 id="analysis-title">分析工作台</h1>
          </div>
          <p>用正式数据集完成指标计算、维度拆解、统计分析与轻量算法建模。</p>
        </div>
        <div className="analysis-header-actions">
          <button
            className="analysis-button secondary"
            disabled={!aggregateQuery.data || exporting !== null}
            onClick={() => void download("csv")}
            type="button"
          >
            <Download size={16} />
            {exporting === "csv" ? "生成中" : "CSV"}
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
            导出 Excel
          </button>
        </div>
      </header>

      <div className="analysis-flow" aria-label="分析流程">
        {[
          ["数据集", Boxes],
          ["筛选", Filter],
          ["计算", Calculator],
          ["可视化", BarChart3],
          ["导出", Download],
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
        <label htmlFor="analysis-project-id">项目</label>
        <input
          id="analysis-project-id"
          value={projectId}
          onChange={(event) => setProjectId(event.target.value)}
        />
        <button
          className="analysis-icon-button"
          aria-label="刷新项目数据"
          type="submit"
        >
          <RefreshCcw size={16} />
        </button>
        <span>
          {selectedDataset
            ? `${datasets.length} 个可分析数据集`
            : "等待选择数据集"}
        </span>
      </form>

      {feedback ? (
        <div className="analysis-feedback" role="status">
          <Check size={15} />
          <span>{feedback}</span>
          <button
            aria-label="关闭提示"
            onClick={() => setFeedback(null)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {primaryError ? (
        <AnalysisState
          title="暂时无法读取分析数据"
          detail={
            primaryError instanceof Error
              ? primaryError.message
              : "请检查后端服务。"
          }
        />
      ) : null}

      {isLoading ? (
        <AnalysisState
          title="正在加载数据集"
          detail="正在读取字段结构与分析元数据。"
          loading
        />
      ) : null}

      {!isLoading && !primaryError && datasets.length === 0 ? (
        <div className="analysis-empty">
          <FileSpreadsheet size={30} />
          <h2>先导入一份 CSV 或 Excel</h2>
          <p>正式数据集创建后，才能进行指标计算、维度分析和结果导出。</p>
          <Link
            className="analysis-button primary"
            to={`/import?project_id=${submittedProjectId}`}
          >
            去导入数据
          </Link>
        </div>
      ) : null}

      {selectedDataset ? (
        <div className="analysis-layout">
          <aside className="analysis-config" aria-label="分析配置">
            <div className="analysis-section-heading">
              <div>
                <small>CONFIGURATION</small>
                <h2>计算配置</h2>
              </div>
              <span className="analysis-ready">
                <i />
                已就绪
              </span>
            </div>

            <Control label="数据集" htmlFor="analysis-dataset">
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
                {selectedDataset.row_count.toLocaleString()} 行 ·{" "}
                {selectedDataset.fields.length} 字段
              </span>
            </Control>

            <div className="config-divider" />
            <Control label="主维度" htmlFor="analysis-dimension">
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
            <Control label="次级维度" htmlFor="analysis-secondary-dimension">
              <SelectShell>
                <select
                  id="analysis-secondary-dimension"
                  value={activeSecondaryDimension}
                  onChange={(event) =>
                    setSecondaryDimension(event.target.value)
                  }
                >
                  <option value="">不拆分</option>
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
            <Control label="指标字段" htmlFor="analysis-metric">
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
            <Control label="聚合方式" htmlFor="analysis-aggregation">
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
                      {item.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
            </Control>

            <div className="config-divider" />
            <div className="control-label-row">
              <label htmlFor="analysis-filter-field">全局筛选</label>
              {appliedFilters.length ? <span>已启用</span> : null}
            </div>
            <SelectShell>
              <select
                id="analysis-filter-field"
                value={filterField}
                onChange={(event) => setFilterField(event.target.value)}
              >
                <option value="">不筛选</option>
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
                  aria-label="筛选运算符"
                  value={filterOperator}
                  onChange={(event) =>
                    setFilterOperator(event.target.value as FilterOperator)
                  }
                >
                  {FILTER_OPERATORS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </SelectShell>
              <input
                aria-label="筛选值"
                disabled={["is_null", "not_null"].includes(filterOperator)}
                placeholder="输入值"
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
              应用到全部视图
            </button>
            {appliedFilters.map((filter) => (
              <button
                className="active-filter"
                key={`${filter.field}-${filter.operator}`}
                onClick={() => setAppliedFilters([])}
                title="清除筛选"
                type="button"
              >
                <span>{filter.field}</span>
                {filter.operator}
                {filter.value === null ? "" : ` ${String(filter.value)}`}
                <X size={13} />
              </button>
            ))}
          </aside>

          <main className="analysis-results">
            <nav className="analysis-tabs" aria-label="分析视图">
              {VIEW_MODES.map(({ label, value, icon: Icon }) => (
                <button
                  className={viewMode === value ? "is-active" : ""}
                  key={value}
                  onClick={() => setViewMode(value)}
                  type="button"
                >
                  <Icon size={15} />
                  {label}
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
  const values =
    aggregate?.rows
      .map((row) => Number(row[metricAlias]))
      .filter(Number.isFinite) ?? [];
  const metricTotal = values.reduce((sum, value) => sum + value, 0);
  return (
    <section className="analysis-metric-band" aria-label="分析摘要">
      <SummaryMetric
        accent="sky"
        icon={Activity}
        label="参与计算"
        value={(
          aggregate?.filtered_row_count ??
          statistics?.filtered_row_count ??
          0
        ).toLocaleString()}
        suffix="行"
      />
      <SummaryMetric
        accent="mint"
        icon={Boxes}
        label="维度分组"
        value={(aggregate?.total_groups ?? 0).toLocaleString()}
        suffix="组"
      />
      <SummaryMetric
        accent="lilac"
        icon={Calculator}
        label="指标汇总"
        value={formatNumber(metricTotal)}
        suffix=""
      />
      <SummaryMetric
        accent="rose"
        icon={Target}
        label="数值字段"
        value={(statistics?.numeric_fields.length ?? 0).toLocaleString()}
        suffix="个"
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
  if (query.isFetching) {
    return (
      <AnalysisState
        title="正在计算维度结果"
        detail="聚合、排序和图表正在同步刷新。"
        loading
      />
    );
  }
  if (query.error || !query.data) {
    return (
      <AnalysisState
        title="无法生成维度分析"
        detail={
          query.error instanceof Error
            ? query.error.message
            : "请调整字段配置。"
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
              {metricAlias} 按 {dimension}
              {secondaryDimension ? ` / ${secondaryDimension}` : ""} 拆解
            </h2>
          </div>
          <div className="chart-mode-switch" aria-label="图表类型">
            <button
              className={chartType === "bar" ? "is-active" : ""}
              onClick={() => onChartTypeChange("bar")}
              type="button"
            >
              柱状图
            </button>
            <button
              className={chartType === "line" ? "is-active" : ""}
              onClick={() => onChartTypeChange("line")}
              type="button"
            >
              折线图
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
  const chartRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current);
    const labels = data.rows.map((row) =>
      dimensions.map((field) => String(row[field] ?? "空值")).join(" / "),
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
  }, [chartType, data, dimensions, metricAlias]);
  return (
    <div className="analysis-chart" aria-label="维度分析图表" ref={chartRef} />
  );
}

function AnalysisTable({ data }: { data: AnalysisResponse }) {
  return (
    <section className="analysis-panel analysis-table-panel">
      <div className="analysis-panel-heading">
        <div>
          <small>RESULT DETAIL</small>
          <h2>聚合明细</h2>
        </div>
        <span>
          {data.rows.length} / {data.total_groups} 个分组
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
  if (isLoading)
    return (
      <AnalysisState
        title="正在计算描述统计"
        detail="正在整理分布、分位数和离散程度。"
        loading
      />
    );
  if (!data)
    return (
      <AnalysisState title="暂无统计结果" detail="当前数据集没有可分析字段。" />
    );
  return (
    <div className="statistics-grid">
      <section className="analysis-panel statistics-numeric">
        <div className="analysis-panel-heading">
          <div>
            <small>DESCRIPTIVE STATISTICS</small>
            <h2>数值字段概览</h2>
          </div>
          <span>{data.numeric_fields.length} 个字段</span>
        </div>
        <div className="analysis-table-wrap">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>均值</th>
                <th>中位数</th>
                <th>最小 / 最大</th>
                <th>标准差</th>
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
            <h2>分类字段分布</h2>
          </div>
        </div>
        <div className="category-list">
          {data.categorical_fields.map((field) => (
            <div className="category-row" key={field.field}>
              <div>
                <strong>{field.field}</strong>
                <span>{field.distinct_count} 个不同值</span>
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
  if (numericFields.length < 2)
    return (
      <AnalysisState
        title="至少需要两个数值字段"
        detail="请在清洗阶段转换字段类型，或选择包含多个数值字段的数据集。"
      />
    );
  if (isLoading)
    return (
      <AnalysisState
        title="正在计算相关系数"
        detail="使用完整数值观测生成 Pearson 相关矩阵。"
        loading
      />
    );
  if (error || !data)
    return (
      <AnalysisState
        title="无法生成相关矩阵"
        detail={error?.message ?? "请检查字段数据。"}
      />
    );
  return (
    <section className="analysis-panel correlation-panel">
      <div className="analysis-panel-heading">
        <div>
          <small>CORRELATION MATRIX</small>
          <h2>数值字段相关性</h2>
        </div>
        <span>{data.observations} 条完整观测</span>
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
        <span>负相关</span>
        <i />
        <span>无相关</span>
        <i />
        <span>正相关</span>
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
  if (!feature || !target)
    return (
      <AnalysisState
        title="至少需要两个数值字段"
        detail="第一个数值字段作为特征，第二个作为预测目标。"
      />
    );
  if (isLoading)
    return (
      <AnalysisState
        title="正在拟合线性模型"
        detail="正在计算系数、拟合优度和误差。"
        loading
      />
    );
  if (error || !data)
    return (
      <AnalysisState
        title="模型拟合失败"
        detail={error?.message ?? "请检查数值字段分布。"}
      />
    );
  return (
    <>
      <section className="model-metrics" aria-label="模型指标">
        <div>
          <span>特征 X</span>
          <strong>{feature}</strong>
        </div>
        <div>
          <span>目标 Y</span>
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
          <span>模型方程</span>
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
              {target} 对 {feature} 的线性拟合
            </h2>
          </div>
          <span>{data.observations} 条观测</span>
        </div>
        <RegressionChart data={data} />
      </section>
    </>
  );
}

function RegressionChart({ data }: { data: RegressionResponse }) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current);
    chart.setOption({
      color: ["#4fc3f7", "#ff9fa5"],
      grid: { bottom: 48, left: 58, right: 25, top: 35 },
      legend: { data: ["实际值", "预测线"], textStyle: { color: "#9aa9c2" } },
      series: [
        {
          data: data.points.map((point) => [point.feature, point.actual]),
          name: "实际值",
          symbolSize: 9,
          type: "scatter",
        },
        {
          data: data.points.map((point) => [point.feature, point.predicted]),
          name: "预测线",
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
  }, [data]);
  return (
    <div className="analysis-chart" aria-label="线性回归图表" ref={chartRef} />
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
