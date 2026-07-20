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
}

export function ChartPreview({ rows, state }: ChartPreviewProps) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const points = useMemo(() => aggregateRows(rows, state), [rows, state]);

  useEffect(() => {
    if (!chartRef.current || state.chartType === "table") {
      return;
    }

    const chart = init(chartRef.current);
    chart.setOption(createChartOption(points, state));

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [points, state]);

  if (state.chartType === "table") {
    return <ChartDataTable points={points} />;
  }

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-line bg-white text-sm text-muted">
        Select fields to render a chart preview.
      </div>
    );
  }

  return (
    <div
      aria-label="Chart preview"
      className="h-80 rounded-md border border-line bg-white"
      ref={chartRef}
    />
  );
}

function createChartOption(
  points: AggregatedPoint[],
  state: ChartBuilderState,
): EChartsCoreOption {
  const labels = points.map((point) => point.label);
  const values = points.map((point) => point.value);
  const title = `${state.aggregation.toUpperCase()}(${state.metric}) by ${state.dimension}`;

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

function ChartDataTable({ points }: { points: AggregatedPoint[] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-line bg-white">
      <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-muted">
          <tr>
            <th className="border-b border-line px-4 py-3 font-semibold">
              Dimension
            </th>
            <th className="border-b border-line px-4 py-3 font-semibold">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label} className="hover:bg-slate-50">
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
