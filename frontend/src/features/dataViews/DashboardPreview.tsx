import type { ChartDefinition } from "./api";
import { ChartPreview } from "./ChartPreview";
import { chartDefinitionToState, getChartPreviewRows } from "./chartConfig";

interface DashboardPreviewProps {
  charts: ChartDefinition[];
  mode: "dashboard" | "report";
  selectedChartIds: string[];
}

export function DashboardPreview({
  charts,
  mode,
  selectedChartIds,
}: DashboardPreviewProps) {
  const selectedCharts = charts.filter((chart) =>
    selectedChartIds.includes(chart.id),
  );

  if (selectedCharts.length === 0) {
    return (
      <div className="flex min-h-72 items-center justify-center rounded-md border border-dashed border-line bg-white text-sm text-muted">
        Select chart resources to preview a dashboard or report layout.
      </div>
    );
  }

  return (
    <div
      className={[
        "grid gap-4",
        mode === "report" ? "grid-cols-1" : "xl:grid-cols-2",
      ].join(" ")}
    >
      {selectedCharts.map((chart) => (
        <section
          key={chart.id}
          className="rounded-md border border-line bg-white p-3"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="truncate text-sm font-semibold text-ink">
                {chart.name}
              </h4>
              <p className="mt-1 text-xs text-muted">{chart.chart_type}</p>
            </div>
            <span className="rounded bg-blue-50 px-2 py-1 text-xs font-semibold text-brand">
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
