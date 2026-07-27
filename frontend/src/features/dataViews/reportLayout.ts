import type { ChartDefinition, DashboardDefinition } from "./api";

export type LayoutMode = "dashboard" | "report" | "screen";
export type DashboardTheme = "aurora" | "warm" | "minimal";
export type DashboardFilterOperator =
  "eq" | "neq" | "contains" | "gt" | "gte" | "lt" | "lte";
export type DashboardFilterValue = string | number | boolean | null;

export interface DashboardLayoutItem {
  chart_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DashboardGlobalFilter {
  id: string;
  field: string;
  operator: DashboardFilterOperator;
  value: DashboardFilterValue;
  data_view_id: string | null;
}

export interface DashboardActiveSelection {
  chart_id: string;
  field: string;
  value: DashboardFilterValue;
}

export interface DashboardLayout {
  schema_version: 1;
  mode: LayoutMode;
  theme: DashboardTheme;
  items: DashboardLayoutItem[];
  global_filters: DashboardGlobalFilter[];
  active_selections: DashboardActiveSelection[];
}

export function createLayoutItems(
  chartIds: string[],
  mode: LayoutMode,
): DashboardLayoutItem[] {
  return chartIds.map((chartId, index) => {
    const width = mode === "screen" ? 4 : mode === "dashboard" ? 6 : 12;
    const columns = Math.max(1, 12 / width);
    return {
      chart_id: chartId,
      x: (index % columns) * width,
      y: Math.floor(index / columns) * (mode === "report" ? 6 : 4),
      w: width,
      h: mode === "report" ? 6 : 4,
    };
  });
}

export function normalizeDashboardLayout(
  dashboard: DashboardDefinition,
): DashboardLayout {
  const raw = dashboard.layout;
  const mode = isLayoutMode(raw.mode) ? raw.mode : "dashboard";
  const items = Array.isArray(raw.items)
    ? raw.items.filter(isDashboardLayoutItem)
    : [];
  return {
    schema_version: 1,
    mode,
    theme: isDashboardTheme(raw.theme) ? raw.theme : "aurora",
    items,
    global_filters: Array.isArray(raw.global_filters)
      ? raw.global_filters.flatMap((item, index) => {
          const filter = normalizeDashboardGlobalFilter(item, index);
          return filter ? [filter] : [];
        })
      : [],
    active_selections: Array.isArray(raw.active_selections)
      ? raw.active_selections.filter(isDashboardActiveSelection)
      : [],
  };
}

export function reconcileLayoutItems(
  current: DashboardLayoutItem[],
  chartIds: string[],
  mode: LayoutMode,
): DashboardLayoutItem[] {
  const selectedChartIds = new Set(chartIds);
  const currentByChartId = new Map(
    current.map((item) => [item.chart_id, item]),
  );
  const defaults = createLayoutItems(chartIds, mode);
  const existing = current.filter((item) =>
    selectedChartIds.has(item.chart_id),
  );
  const additions = defaults.filter(
    (fallback) => !currentByChartId.has(fallback.chart_id),
  );
  return [...existing, ...additions];
}

export function applyDashboardInteractions(
  rows: Array<Record<string, string | number | boolean | null>>,
  chart: ChartDefinition,
  filters: DashboardGlobalFilter[],
  selections: DashboardActiveSelection[],
): Array<Record<string, string | number | boolean | null>> {
  return rows.filter((row) => {
    for (const filter of filters) {
      if (filter.value === null || filter.value === "") {
        continue;
      }
      if (filter.data_view_id && filter.data_view_id !== chart.data_view_id) {
        continue;
      }
      if (
        !(filter.field in row) ||
        !matches(row[filter.field], filter.operator, filter.value)
      ) {
        return false;
      }
    }
    for (const selection of selections) {
      if (selection.chart_id === chart.id || !(selection.field in row)) {
        continue;
      }
      if (!matches(row[selection.field], "eq", selection.value)) {
        return false;
      }
    }
    return true;
  });
}

function matches(
  left: DashboardFilterValue | undefined,
  operator: DashboardFilterOperator,
  right: DashboardFilterValue,
): boolean {
  if (operator === "contains") {
    return String(left ?? "")
      .toLocaleLowerCase()
      .includes(String(right ?? "").toLocaleLowerCase());
  }
  if (["gt", "gte", "lt", "lte"].includes(operator)) {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      return false;
    }
    if (operator === "gt") return leftNumber > rightNumber;
    if (operator === "gte") return leftNumber >= rightNumber;
    if (operator === "lt") return leftNumber < rightNumber;
    return leftNumber <= rightNumber;
  }
  const equal =
    String(left ?? "").toLocaleLowerCase() ===
    String(right ?? "").toLocaleLowerCase();
  return operator === "neq" ? !equal : equal;
}

function isLayoutMode(value: unknown): value is LayoutMode {
  return value === "dashboard" || value === "report" || value === "screen";
}

function isDashboardTheme(value: unknown): value is DashboardTheme {
  return value === "aurora" || value === "warm" || value === "minimal";
}

function isDashboardLayoutItem(value: unknown): value is DashboardLayoutItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DashboardLayoutItem>;
  return (
    typeof item.chart_id === "string" &&
    typeof item.x === "number" &&
    typeof item.y === "number" &&
    typeof item.w === "number" &&
    typeof item.h === "number"
  );
}

function normalizeDashboardGlobalFilter(
  value: unknown,
  index: number,
): DashboardGlobalFilter | null {
  if (!value || typeof value !== "object") return null;
  const filter = value as Partial<DashboardGlobalFilter>;
  if (typeof filter.field !== "string") return null;
  return {
    id:
      typeof filter.id === "string"
        ? filter.id
        : `legacy_${filter.field}_${index + 1}`,
    field: filter.field,
    operator: isDashboardFilterOperator(filter.operator)
      ? filter.operator
      : "eq",
    value: isDashboardFilterValue(filter.value) ? filter.value : null,
    data_view_id:
      typeof filter.data_view_id === "string" ? filter.data_view_id : null,
  };
}

function isDashboardActiveSelection(
  value: unknown,
): value is DashboardActiveSelection {
  if (!value || typeof value !== "object") return false;
  const selection = value as Partial<DashboardActiveSelection>;
  return (
    typeof selection.chart_id === "string" &&
    typeof selection.field === "string" &&
    "value" in selection
  );
}

function isDashboardFilterOperator(
  value: unknown,
): value is DashboardFilterOperator {
  return ["eq", "neq", "contains", "gt", "gte", "lt", "lte"].includes(
    String(value),
  );
}

function isDashboardFilterValue(value: unknown): value is DashboardFilterValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}
