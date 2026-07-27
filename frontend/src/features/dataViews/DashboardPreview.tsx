import type { ChartDefinition } from "./api";
import { useI18n } from "../../i18n";
import { ChartPreview } from "./ChartPreview";
import { chartDefinitionToState, getChartPreviewRows } from "./chartConfig";
import {
  applyDashboardInteractions,
  type DashboardActiveSelection,
  type DashboardGlobalFilter,
  type DashboardLayoutItem,
  type DashboardTheme,
  type LayoutMode,
} from "./reportLayout";

interface DashboardPreviewProps {
  charts: ChartDefinition[];
  mode: LayoutMode;
  theme: DashboardTheme;
  items: DashboardLayoutItem[];
  filters: DashboardGlobalFilter[];
  selections: DashboardActiveSelection[];
  onPointSelect: (selection: DashboardActiveSelection) => void;
}

export function DashboardPreview({
  charts,
  mode,
  theme,
  items,
  filters,
  selections,
  onPointSelect,
}: DashboardPreviewProps) {
  const { t } = useI18n();
  const chartById = new Map(charts.map((chart) => [chart.id, chart]));
  const selectedCharts = items.flatMap((item) => {
    const chart = chartById.get(item.chart_id);
    return chart ? [{ chart, item }] : [];
  });

  if (selectedCharts.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed border-line bg-white text-sm text-muted">
        {t(
          "选择图表资源以预览仪表盘或报表布局。",
          "Select chart resources to preview a dashboard or report layout.",
        )}
      </div>
    );
  }

  return (
    <div
      className={[
        "grid gap-4",
        "grid-cols-1 md:grid-cols-12",
        mode === "screen"
          ? "rounded-2xl border border-cyan/20 bg-slate-950 p-4"
          : "",
        theme === "warm"
          ? "report-preview-warm"
          : theme === "minimal"
            ? "report-preview-minimal"
            : "report-preview-aurora",
      ].join(" ")}
    >
      {selectedCharts.map(({ chart, item }) => {
        const state = chartDefinitionToState(chart);
        const activeSelection = selections.find(
          (selection) => selection.chart_id === chart.id,
        );
        const rows = applyDashboardInteractions(
          getChartPreviewRows(chart),
          chart,
          filters,
          selections,
        );
        return (
          <section
            key={chart.id}
            style={{ gridColumn: `span ${Math.min(12, Math.max(1, item.w))}` }}
            className={[
              "min-w-0 rounded-xl border p-3 transition duration-200",
              mode === "screen"
                ? "border-cyan/20 bg-slate-900 shadow-[0_0_24px_rgba(38,216,200,0.08)]"
                : "border-white/70 bg-white/90 shadow-sm",
              activeSelection
                ? "ring-2 ring-violet-300"
                : "hover:-translate-y-0.5 hover:shadow-md",
            ].join(" ")}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h4
                  className={
                    mode === "screen"
                      ? "truncate text-sm font-semibold text-white"
                      : "truncate text-sm font-semibold text-ink"
                  }
                >
                  {chart.name}
                </h4>
                <p
                  className={
                    mode === "screen"
                      ? "mt-1 text-xs text-slate-400"
                      : "mt-1 text-xs text-muted"
                  }
                >
                  {chart.chart_type}
                </p>
              </div>
              <span className="max-w-[48%] shrink-0 truncate rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-brand">
                {chart.data_view_id}
              </span>
            </div>
            <ChartPreview
              rows={rows}
              selectedLabel={
                activeSelection ? String(activeSelection.value ?? "") : null
              }
              state={state}
              onPointSelect={(value) =>
                onPointSelect({
                  chart_id: chart.id,
                  field: state.dimension,
                  value,
                })
              }
            />
          </section>
        );
      })}
    </div>
  );
}
