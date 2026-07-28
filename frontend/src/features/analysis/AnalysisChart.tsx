import {
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
} from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

import type { ChartRecommendation, ExploreResponse } from "../../lib/vibeApi";

echarts.use([
  BarChart,
  HeatmapChart,
  LineChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

interface AnalysisChartProps {
  chart?: ChartRecommendation;
  correlations?: ExploreResponse["correlations"];
  theme: "dark" | "light";
  onFilter?: (field: string, value: string) => void;
}

export default function AnalysisChart({
  chart,
  correlations,
  theme,
  onFilter,
}: AnalysisChartProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const ink = theme === "dark" ? "#dfe8e2" : "#26332d";
    const muted = theme === "dark" ? "#7f9289" : "#6d7c75";
    const grid =
      theme === "dark" ? "rgba(210,230,220,.1)" : "rgba(31,52,43,.1)";
    const instance = echarts.init(container.current, undefined, {
      renderer: "canvas",
    });
    instance.setOption(
      correlations
        ? correlationOption(correlations, ink, muted)
        : chartOption(chart!, ink, muted, grid),
    );
    const handleClick = (event: { name?: string }) => {
      if (chart?.type === "bar" && event.name && onFilter)
        onFilter(chart.x_field, event.name);
    };
    instance.on("click", handleClick);
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      instance.off("click", handleClick);
      instance.dispose();
    };
  }, [chart, correlations, onFilter, theme]);

  return <div className="analysis-chart-canvas" ref={container} />;
}

function chartOption(
  chart: ChartRecommendation,
  ink: string,
  muted: string,
  grid: string,
) {
  const base = {
    animationDuration: 520,
    animationEasing: "cubicOut" as const,
    grid: { top: 22, right: 12, bottom: 12, left: 12, containLabel: true },
    tooltip: {
      trigger: chart.type === "scatter" ? "item" : "axis",
      backgroundColor: "rgba(20,24,21,.94)",
      borderWidth: 0,
      textStyle: { color: "#f4f7f5" },
    },
    xAxis: {
      type: chart.type === "scatter" ? "value" : "category",
      data: chart.categories,
      axisLabel: { color: muted, hideOverlap: true, fontSize: 10 },
      axisLine: { lineStyle: { color: grid } },
      splitLine: { lineStyle: { color: grid } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: muted, fontSize: 10 },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: grid } },
    },
  };
  if (chart.type === "scatter") {
    return {
      ...base,
      series: [
        {
          type: "scatter",
          data: chart.points,
          symbolSize: 8,
          itemStyle: { color: "#64e6c4", opacity: 0.72 },
          emphasis: { scale: 1.8, itemStyle: { color: "#ff8364" } },
        },
      ],
    };
  }
  if (chart.type === "line") {
    return {
      ...base,
      dataZoom:
        chart.categories && chart.categories.length > 80
          ? [{ type: "inside" }]
          : [],
      series: [
        {
          type: "line",
          data: chart.series,
          showSymbol: false,
          smooth: 0.28,
          lineStyle: { color: "#64e6c4", width: 2 },
          areaStyle: { color: "rgba(100,230,196,.1)" },
        },
      ],
    };
  }
  return {
    ...base,
    series: [
      {
        type: "bar",
        data: chart.series,
        barMaxWidth: 28,
        itemStyle: {
          color: chart.type === "histogram" ? "#f7c95c" : "#ff8364",
          borderRadius: [3, 3, 0, 0],
        },
        emphasis: { itemStyle: { color: "#64e6c4" } },
      },
    ],
    textStyle: { color: ink },
  };
}

function correlationOption(
  correlations: ExploreResponse["correlations"],
  ink: string,
  muted: string,
) {
  const data: [number, number, number | null][] = [];
  correlations.matrix.forEach((row, y) => {
    row.forEach((value, x) => data.push([x, y, value]));
  });
  return {
    animationDuration: 450,
    grid: { top: 10, right: 54, bottom: 60, left: 82 },
    tooltip: {
      formatter: (params: { value: [number, number, number | null] }) => {
        const [x, y, value] = params.value;
        return `${correlations.fields[y]} × ${correlations.fields[x]}<br><strong>${value ?? "—"}</strong>`;
      },
    },
    xAxis: {
      type: "category",
      data: correlations.fields,
      axisLabel: { color: muted, rotate: 32 },
    },
    yAxis: {
      type: "category",
      data: correlations.fields,
      axisLabel: { color: muted },
    },
    visualMap: {
      min: -1,
      max: 1,
      calculable: false,
      orient: "vertical",
      right: 0,
      top: "middle",
      textStyle: { color: muted },
      inRange: { color: ["#8ea1ff", "#26302b", "#f7c95c"] },
    },
    series: [
      {
        type: "heatmap",
        data,
        label: {
          show: correlations.fields.length <= 7,
          color: ink,
          fontSize: 9,
        },
        emphasis: { itemStyle: { borderColor: "#ffffff", borderWidth: 1 } },
      },
    ],
  };
}
