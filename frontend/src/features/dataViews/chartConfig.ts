import type { ChartDefinition, DataView } from "./api";

export const CHART_TYPES = ["bar", "line", "pie", "table"] as const;
export const AGGREGATIONS = ["sum", "avg", "count"] as const;

export type ChartType = (typeof CHART_TYPES)[number];
export type Aggregation = (typeof AGGREGATIONS)[number];

export interface ChartBuilderState {
  name: string;
  chartType: ChartType;
  dimension: string;
  metric: string;
  aggregation: Aggregation;
}

export interface ChartConfigPayload extends Record<string, unknown> {
  dimension: string;
  metric: string;
  aggregation: Aggregation;
  data_view_name: string;
  preview_rows: Array<Record<string, string | number | boolean | null>>;
}

export interface AggregatedPoint {
  label: string;
  value: number;
}

export function createDefaultChartState(
  dataView: DataView | null,
): ChartBuilderState {
  return {
    name: dataView ? `${dataView.name} Chart` : "Data view chart",
    chartType: "bar",
    dimension: pickDimensionField(dataView),
    metric: pickMetricField(dataView),
    aggregation: "sum",
  };
}

export function toChartConfigPayload(
  state: ChartBuilderState,
  dataView: DataView,
  rows: Array<Record<string, string | number | boolean | null>>,
): ChartConfigPayload {
  return {
    dimension: state.dimension,
    metric: state.metric,
    aggregation: state.aggregation,
    data_view_name: dataView.name,
    preview_rows: rows.slice(0, 200),
  };
}

export function chartDefinitionToState(
  chart: ChartDefinition,
): ChartBuilderState {
  return {
    name: chart.name,
    chartType: asChartType(chart.chart_type),
    dimension: readStringConfig(chart.config.dimension),
    metric: readStringConfig(chart.config.metric),
    aggregation: asAggregation(chart.config.aggregation),
  };
}

export function getChartPreviewRows(
  chart: ChartDefinition,
): Array<Record<string, string | number | boolean | null>> {
  if (!Array.isArray(chart.config.preview_rows)) {
    return [];
  }
  return chart.config.preview_rows.filter(isPreviewRow);
}

export function aggregateRows(
  rows: Array<Record<string, string | number | boolean | null>>,
  state: Pick<ChartBuilderState, "dimension" | "metric" | "aggregation">,
): AggregatedPoint[] {
  if (!state.dimension) {
    return [];
  }

  const groups = new Map<string, { sum: number; count: number }>();
  rows.forEach((row) => {
    const label = formatGroupLabel(row[state.dimension]);
    const current = groups.get(label) ?? { sum: 0, count: 0 };
    const value =
      state.aggregation === "count" ? 1 : toNumber(row[state.metric]);
    groups.set(label, {
      sum: current.sum + value,
      count: current.count + 1,
    });
  });

  return [...groups.entries()].map(([label, value]) => ({
    label,
    value:
      state.aggregation === "avg" && value.count > 0
        ? roundNumber(value.sum / value.count)
        : roundNumber(value.sum),
  }));
}

export function pickDimensionField(dataView: DataView | null): string {
  if (!dataView) {
    return "";
  }
  return (
    dataView.fields.find((field) => field.inferred_type === "text")?.name ??
    dataView.fields[0]?.name ??
    ""
  );
}

export function pickMetricField(dataView: DataView | null): string {
  if (!dataView) {
    return "";
  }
  return (
    dataView.fields.find((field) =>
      ["decimal", "integer"].includes(field.inferred_type),
    )?.name ??
    dataView.fields[0]?.name ??
    ""
  );
}

export function isNumericField(type: string): boolean {
  return ["decimal", "integer"].includes(type);
}

function formatGroupLabel(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }
  return String(value);
}

function toNumber(value: string | number | boolean | null | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundNumber(value: number): number {
  return Math.round(value * 100) / 100;
}

function asChartType(value: string): ChartType {
  return CHART_TYPES.includes(value as ChartType)
    ? (value as ChartType)
    : "bar";
}

function asAggregation(value: unknown): Aggregation {
  return AGGREGATIONS.includes(value as Aggregation)
    ? (value as Aggregation)
    : "sum";
}

function readStringConfig(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isPreviewRow(
  value: unknown,
): value is Record<string, string | number | boolean | null> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
