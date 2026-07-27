import { BarChart, LineChart, PieChart } from "echarts/charts";
import {
  GridComponent,
  TitleComponent,
  TooltipComponent,
} from "echarts/components";
import {
  init,
  use as registerEChartsModules,
  type EChartsCoreOption,
} from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useMemo, useRef } from "react";

import { useI18n } from "../../i18n";
import {
  aggregateRows,
  type AggregatedPoint,
  type ChartBuilderState,
} from "./chartConfig";

registerEChartsModules([
  BarChart,
  CanvasRenderer,
  GridComponent,
  LineChart,
  PieChart,
  TitleComponent,
  TooltipComponent,
]);

interface ChartPreviewProps {
  rows: Array<Record<string, string | number | boolean | null>>;
  state: ChartBuilderState;
  selectedLabel?: string | null;
  onPointSelect?: (label: string) => void;
}

export function ChartPreview({
  rows,
  state,
  selectedLabel = null,
  onPointSelect,
}: ChartPreviewProps) {
  const { t } = useI18n();
  const chartRef = useRef<HTMLDivElement | null>(null);
  const points = useMemo(() => aggregateRows(rows, state), [rows, state]);

  useEffect(() => {
    if (!chartRef.current || state.chartType === "table") {
      return;
    }

    const chart = init(chartRef.current);
    chart.setOption(createChartOption(points, state, t));
    const handlePointClick = (event: { name?: string }) => {
      if (event.name) onPointSelect?.(event.name);
    };
    chart.on("click", handlePointClick);

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.off?.("click", handlePointClick);
      chart.dispose();
    };
  }, [onPointSelect, points, state, t]);

  if (state.chartType === "table") {
    return (
      <ChartDataTable
        onPointSelect={onPointSelect}
        points={points}
        selectedLabel={selectedLabel}
      />
    );
  }

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-line bg-white text-sm text-muted">
        {t(
          "选择字段以渲染图表预览。",
          "Select fields to render a chart preview.",
        )}
      </div>
    );
  }

  return (
    <div
      aria-label={t("图表预览", "Chart preview")}
      className="h-80 min-w-0 rounded-md border border-line bg-white"
      ref={chartRef}
    />
  );
}

function createChartOption(
  points: AggregatedPoint[],
  state: ChartBuilderState,
  t: (zh: string, en: string) => string,
): EChartsCoreOption {
  const labels = points.map((point) => point.label);
  const values = points.map((point) => point.value);
  const title = `${state.aggregation.toUpperCase()}(${state.metric}) ${t("按", "by")} ${state.dimension}`;

  if (state.chartType === "pie") {
    return {
      color: ["#2563eb", "#0891b2", "#059669", "#d97706", "#be123c", "#7c3aed"],
      series: [
        {
          data: points.map((point) => ({
            name: point.label,
            value: point.value,
          })),
          radius: ["42%", "72%"],
          type: "pie",
        },
      ],
      title: {
        left: 18,
        text: title,
        textStyle: { color: "#152033", fontSize: 13 },
      },
      tooltip: { trigger: "item" },
    };
  }

  return {
    color: state.chartType === "line" ? ["#0891b2"] : ["#2563eb"],
    grid: { bottom: 44, left: 56, right: 24, top: 58 },
    series: [
      {
        areaStyle:
          state.chartType === "line"
            ? { color: "rgba(8, 145, 178, 0.12)" }
            : undefined,
        data: values,
        smooth: state.chartType === "line",
        type: state.chartType,
      },
    ],
    title: {
      left: 18,
      text: title,
      textStyle: { color: "#152033", fontSize: 13 },
    },
    tooltip: { trigger: "axis" },
    xAxis: { data: labels, type: "category" },
    yAxis: { type: "value" },
  };
}

function ChartDataTable({
  points,
  selectedLabel,
  onPointSelect,
}: {
  points: AggregatedPoint[];
  selectedLabel: string | null;
  onPointSelect?: (label: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-line bg-white">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-muted">
          <tr>
            <th className="border-b border-line px-4 py-3 font-semibold">
              {t("维度", "Dimension")}
            </th>
            <th className="border-b border-line px-4 py-3 font-semibold">
              {t("数值", "Value")}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr
              key={point.label}
              aria-current={selectedLabel === point.label ? "true" : undefined}
              className={
                selectedLabel === point.label
                  ? "cursor-pointer bg-violet-50"
                  : "cursor-pointer hover:bg-slate-50"
              }
              onClick={() => onPointSelect?.(point.label)}
            >
              <td className="border-b border-line px-4 py-3 text-ink">
                {point.label}
              </td>
              <td className="border-b border-line px-4 py-3 text-ink">
                {point.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
