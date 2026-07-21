import type { ChartDefinition } from "./api";
import { useI18n } from "../../i18n";
import { ChartPreview } from "./ChartPreview";
import { chartDefinitionToState, getChartPreviewRows } from "./chartConfig";

interface DashboardPreviewProps {
  charts: ChartDefinition[];
  mode: "dashboard" | "report" | "screen";
  selectedChartIds: string[];
}

export function DashboardPreview({
  charts,
  mode,
  selectedChartIds,
}: DashboardPreviewProps) {
  const { t } = useI18n();
  const selectedCharts = charts.filter((chart) =>
    selectedChartIds.includes(chart.id),
  );

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
        mode === "report"
          ? "grid-cols-1"
          : mode === "screen"
            ? "grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] rounded-md border border-cyan/20 bg-canvas p-4"
            : "xl:grid-cols-2",
      ].join(" ")}
    >
      {selectedCharts.map((chart) => (
        <section
          key={chart.id}
          className={[
            "min-w-0 rounded-md border p-3",
            mode === "screen"
              ? "border-cyan/20 bg-panel shadow-[0_0_24px_rgba(38,216,200,0.08)]"
              : "border-line bg-white",
          ].join(" ")}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-ink">
                {chart.name}
              </h4>
              <p className="mt-1 text-xs text-muted">{chart.chart_type}</p>
            </div>
            <span className="max-w-[48%] shrink-0 truncate rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-brand">
              {chart.data_view_id}
            </span>
          </div>
          <ChartPreview
            rows={getChartPreviewRows(chart)}
            state={chartDefinitionToState(chart)}
          />
        </section>
      ))}
    </div>
  );
}
