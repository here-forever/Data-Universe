import { LineChart, PieChart, RadarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import {
  graphic,
  init,
  use as registerEChartsModules,
  type EChartsCoreOption,
} from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import {
  Activity,
  ArrowUpRight,
  CalendarRange,
  Download,
  ListFilter,
  MoreHorizontal,
  Plus,
  Radio,
  RotateCcw,
  ShieldCheck,
  UsersRound,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { localize, useI18n, type LocalizedText } from "../../i18n";

type ChartVariant = "line" | "area" | "donut" | "radar";
type Period = "week" | "month" | "quarter";
type Channel = "all" | "online" | "direct";

registerEChartsModules([
  CanvasRenderer,
  GridComponent,
  LineChart,
  PieChart,
  RadarChart,
  TooltipComponent,
]);

const periods: Array<{ value: Period; label: LocalizedText }> = [
  { value: "week", label: { zh: "本周", en: "Week" } },
  { value: "month", label: { zh: "本月", en: "Month" } },
  { value: "quarter", label: { zh: "本季度", en: "Quarter" } },
];
const channels: Array<{ value: Channel; label: LocalizedText }> = [
  { value: "all", label: { zh: "全部渠道", en: "All channels" } },
  { value: "online", label: { zh: "线上", en: "Online" } },
  { value: "direct", label: { zh: "直营", en: "Direct" } },
];

const periodScale: Record<Period, number> = {
  week: 0.58,
  month: 1,
  quarter: 2.74,
};
const channelScale: Record<Channel, number> = {
  all: 1,
  online: 0.46,
  direct: 0.31,
};

const tableRows = [
  {
    name: { zh: "华东零售渠道", en: "East China retail" },
    source: { zh: "销售订单", en: "Sales orders" },
    channel: "direct" as Channel,
    updated: { zh: "刚刚", en: "Just now" },
    status: { zh: "活跃", en: "Active" },
    warning: false,
    value: "¥ 128,420",
  },
  {
    name: { zh: "会员复购漏斗", en: "Member repurchase funnel" },
    source: { zh: "客户画像", en: "Customer profiles" },
    channel: "online" as Channel,
    updated: { zh: "12 分钟前", en: "12 minutes ago" },
    status: { zh: "已同步", en: "Synced" },
    warning: false,
    value: "64.8%",
  },
  {
    name: { zh: "华南仓储效率", en: "South China warehouse efficiency" },
    source: { zh: "库存流水", en: "Inventory movements" },
    channel: "direct" as Channel,
    updated: { zh: "34 分钟前", en: "34 minutes ago" },
    status: { zh: "活跃", en: "Active" },
    warning: false,
    value: "92.4%",
  },
  {
    name: { zh: "内容投放归因", en: "Content attribution" },
    source: { zh: "营销触点", en: "Marketing touchpoints" },
    channel: "online" as Channel,
    updated: { zh: "1 小时前", en: "1 hour ago" },
    status: { zh: "待校验", en: "Needs review" },
    warning: true,
    value: "¥ 46,280",
  },
];

export function FluidDataDashboard() {
  const { language, t } = useI18n();
  const [period, setPeriod] = useState<Period>("month");
  const [activeChannel, setActiveChannel] = useState<Channel>("all");
  const scale = periodScale[period] * channelScale[activeChannel];
  const filteredRows = useMemo(
    () =>
      tableRows.filter(
        (row) => activeChannel === "all" || row.channel === activeChannel,
      ),
    [activeChannel],
  );

  const resetFilters = () => {
    setPeriod("month");
    setActiveChannel("all");
  };

  return (
    <div className="content dashboard-content">
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            <span /> {t("晨间数据脉冲 · 实时更新", "Morning data pulse · Live")}
          </p>
          <h1>
            {t("你好，林予安", "Hello, Lin Yuan")}
            <span>{t("。", ".")}</span>
          </h1>
          <p className="page-subtitle">
            {t(
              "让重要信号，在安静的流动里浮现。",
              "Bring important signals quietly into focus.",
            )}
          </p>
        </div>
        <div className="heading-actions">
          <div
            className="period-picker"
            aria-label={t("时间范围", "Time range")}
          >
            {periods.map((item) => (
              <button
                className={period === item.value ? "is-selected" : ""}
                key={item.value}
                onClick={() => setPeriod(item.value)}
                aria-pressed={period === item.value}
                type="button"
              >
                {localize(item.label, language)}
              </button>
            ))}
          </div>
          <Link className="add-button" to="/analytics">
            <Plus size={17} />
            {t("新建分析", "New analysis")}
          </Link>
        </div>
      </section>

      <section
        className="filter-ribbon glass-panel"
        aria-label={t("全局筛选", "Global filters")}
      >
        <div className="filter-context">
          <span className="filter-context-icon">
            <CalendarRange size={16} />
          </span>
          <div>
            <small>{t("当前分析视图", "Current analysis view")}</small>
            <strong>
              {localize(
                periods.find((item) => item.value === period)!.label,
                language,
              )}{" "}
              ·{" "}
              {localize(
                channels.find((item) => item.value === activeChannel)!.label,
                language,
              )}
            </strong>
          </div>
        </div>
        <div
          className="channel-filter"
          role="group"
          aria-label={t("渠道筛选", "Channel filter")}
        >
          {channels.map((channel) => (
            <button
              className={activeChannel === channel.value ? "is-active" : ""}
              key={channel.value}
              onClick={() => setActiveChannel(channel.value)}
              aria-pressed={activeChannel === channel.value}
              type="button"
            >
              {localize(channel.label, language)}
            </button>
          ))}
        </div>
        <div className="filter-feedback" aria-live="polite">
          <span>
            <Radio size={14} />
            {t("图表与资产表已联动", "Charts and asset table are linked")}
          </span>
          <button onClick={resetFilters} type="button">
            <RotateCcw size={14} />
            {t("重置", "Reset")}
          </button>
        </div>
      </section>

      <section className="kpi-grid" aria-label={t("核心指标", "Key metrics")}>
        <MetricCard
          label={t("经营总览", "Revenue overview")}
          value={256840 * scale}
          suffix={t("元", "CNY")}
          trend="12.8%"
          accent="blue"
          icon={Activity}
        />
        <MetricCard
          label={t("活跃访客", "Active visitors")}
          value={16492 * scale}
          suffix=""
          trend="8.4%"
          accent="teal"
          icon={UsersRound}
        />
        <MetricCard
          label={t("转化效率", "Conversion rate")}
          value={
            (66.8 + (periodScale[period] - 1) * 2.4) *
            (activeChannel === "all"
              ? 1
              : activeChannel === "online"
                ? 1.06
                : 0.94)
          }
          suffix="%"
          trend="4.1%"
          accent="violet"
          icon={Zap}
          decimal
        />
        <MetricCard
          label={t("数据健康度", "Data health")}
          value={98.6}
          suffix="%"
          trend={t("稳定", "Stable")}
          stable
          accent="pearl"
          icon={ShieldCheck}
          decimal
        />
      </section>

      <section className="dashboard-grid">
        <Panel
          className="chart-panel line-panel"
          title={t("经营趋势", "Business trend")}
          subtitle={t("收入与目标的柔性轨迹", "Revenue and target trajectory")}
          action={t("查看详情", "View details")}
        >
          <FluidChart variant="line" period={period} channel={activeChannel} />
        </Panel>
        <Panel
          className="chart-panel donut-panel"
          title={t("渠道构成", "Channel mix")}
          subtitle={t("点击环图聚焦渠道", "Select a segment to focus")}
        >
          <FluidChart
            variant="donut"
            period={period}
            channel={activeChannel}
            onChannelSelect={setActiveChannel}
          />
        </Panel>
        <Panel
          className="chart-panel radar-panel"
          title={t("经营感知", "Business pulse")}
          subtitle={t("六维表现雷达", "Six-dimension performance")}
        >
          <FluidChart variant="radar" period={period} channel={activeChannel} />
        </Panel>
        <Panel
          className="chart-panel area-panel"
          title={t("数据流速", "Data throughput")}
          subtitle={t("每小时写入与处理量", "Hourly ingestion and processing")}
          action={t("查看流向", "View flow")}
        >
          <FluidChart variant="area" period={period} channel={activeChannel} />
        </Panel>
        <RealtimePanel scale={scale} />
      </section>

      <section className="data-section glass-panel">
        <div className="panel-heading table-heading">
          <div>
            <p className="panel-kicker">DATA PULSE</p>
            <h2>{t("当前关注的数据资产", "Data assets in focus")}</h2>
          </div>
          <div className="table-actions">
            <button className="soft-button" type="button">
              <ListFilter size={16} />
              {t("筛选", "Filter")}
            </button>
            <button className="soft-button" type="button">
              <Download size={16} />
              {t("导出", "Export")}
            </button>
            <button
              className="icon-button"
              aria-label={t("更多表格操作", "More table actions")}
              type="button"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("分析资产", "Analysis asset")}</th>
                <th>{t("来源", "Source")}</th>
                <th>{t("最后更新", "Last updated")}</th>
                <th>{t("状态", "Status")}</th>
                <th>{t("核心数值", "Key value")}</th>
                <th aria-label={t("操作", "Actions")} />
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.name.zh}>
                  <td>
                    <span className="asset-dot" />
                    {localize(row.name, language)}
                  </td>
                  <td className="muted-cell">
                    {localize(row.source, language)}
                  </td>
                  <td className="muted-cell">
                    {localize(row.updated, language)}
                  </td>
                  <td>
                    <span
                      className={
                        row.warning ? "status-chip warning" : "status-chip"
                      }
                    >
                      {localize(row.status, language)}
                    </span>
                  </td>
                  <td className="value-cell">{row.value}</td>
                  <td>
                    <button
                      className="row-more"
                      aria-label={`${localize(row.name, language)} ${t("更多操作", "more actions")}`}
                      type="button"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  trend,
  accent,
  icon: Icon,
  decimal = false,
  stable = false,
}: {
  label: string;
  value: number;
  suffix: string;
  trend: string;
  accent: "blue" | "teal" | "violet" | "pearl";
  icon: LucideIcon;
  decimal?: boolean;
  stable?: boolean;
}) {
  const { formatNumber, t } = useI18n();
  const displayed = useCountUp(value, 1350);
  const number = decimal
    ? displayed.toFixed(1)
    : formatNumber(Math.round(displayed));
  return (
    <article className={`metric-card accent-${accent}`}>
      <div className="metric-top">
        <span>{label}</span>
        <div className="metric-icon">
          <Icon size={18} />
        </div>
      </div>
      <div className="metric-value">
        {number}
        <small>{suffix}</small>
      </div>
      <div className="metric-foot">
        <span className={stable ? "trend stable" : "trend"}>
          <ArrowUpRight size={14} />
          {trend}
        </span>
        <span>{t("较上期", "vs prior period")}</span>
      </div>
    </article>
  );
}

function Panel({
  title,
  subtitle,
  action,
  className,
  children,
}: {
  title: string;
  subtitle: string;
  action?: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <article className={`glass-panel ${className}`}>
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">LIVE INSIGHT</p>
          <h2>{title}</h2>
          <span>{subtitle}</span>
        </div>
        {action ? (
          <button className="panel-action" type="button">
            {action}
            <ArrowUpRight size={15} />
          </button>
        ) : null}
      </div>
      {children}
    </article>
  );
}

function RealtimePanel({ scale }: { scale: number }) {
  const { formatNumber, t } = useI18n();
  const throughput = useCountUp(1248 * (0.78 + scale * 0.22), 1100);
  return (
    <article className="glass-panel realtime-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">REAL-TIME</p>
          <h2>{t("实时指标", "Real-time metrics")}</h2>
          <span>{t("系统此刻的微弱心跳", "The system pulse right now")}</span>
        </div>
        <span className="live-badge">
          <i />
          {t("在线", "Live")}
        </span>
      </div>
      <div className="realtime-value">
        <span>{t("处理吞吐", "Processing throughput")}</span>
        <strong>
          {formatNumber(Math.round(throughput))}
          <em>{t("条/秒", "rows/s")}</em>
        </strong>
        <div className="pulse-line">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="realtime-list">
        <div>
          <span>
            <i className="signal blue" />
            {t("任务队列", "Task queue")}
          </span>
          <strong>
            14 <small>{t("运行中", "running")}</small>
          </strong>
        </div>
        <div>
          <span>
            <i className="signal teal" />
            {t("数据连接", "Data connections")}
          </span>
          <strong>
            09 <small>{t("正常", "healthy")}</small>
          </strong>
        </div>
        <div>
          <span>
            <i className="signal violet" />
            {t("计算资源", "Compute resources")}
          </span>
          <strong>
            68 <small>{t("% 已用", "% used")}</small>
          </strong>
        </div>
      </div>
      <button className="realtime-link" type="button">
        {t("进入任务中心", "Open task center")} <ArrowUpRight size={16} />
      </button>
    </article>
  );
}

function FluidChart({
  variant,
  period,
  channel,
  onChannelSelect,
}: {
  variant: ChartVariant;
  period: Period;
  channel: Channel;
  onChannelSelect?: (channel: Channel) => void;
}) {
  const { language, t } = useI18n();
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current, undefined, {
      renderer: "canvas",
    });
    chart.setOption(createChartOption(variant, period, channel, t));
    if (variant === "donut" && onChannelSelect) {
      chart.on("click", (params) => {
        if (params.name === t("线上", "Online")) onChannelSelect("online");
        else if (params.name === t("直营", "Direct")) onChannelSelect("direct");
        else onChannelSelect("all");
      });
    }
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [channel, onChannelSelect, period, t, variant]);

  const chartNames: Record<ChartVariant, string> = {
    line: t("经营趋势", "Business trend"),
    area: t("数据流速", "Data throughput"),
    donut: t("渠道构成", "Channel mix"),
    radar: t("经营感知", "Business pulse"),
  };
  const chartElement = (
    <div
      className={`echart echart-${variant}`}
      aria-label={`${chartNames[variant]} ${t("数据图表", "chart")}`}
      ref={chartRef}
    />
  );

  if (variant !== "donut") return chartElement;

  const total = 256840 * periodScale[period] * channelScale[channel];
  return (
    <div className="donut-stage">
      {chartElement}
      <div className="donut-center" aria-live="polite">
        <strong>¥ {(total / 1000).toFixed(1)}K</strong>
        <span>
          {channel === "all"
            ? t("总收入", "Total revenue")
            : localize(
                channels.find((item) => item.value === channel)!.label,
                language,
              )}
        </span>
      </div>
    </div>
  );
}

function createChartOption(
  variant: ChartVariant,
  period: Period,
  channel: Channel,
  t: (zh: string, en: string) => string,
): EChartsCoreOption {
  const commonText = {
    color: "rgba(232, 244, 255, 0.58)",
    fontFamily: "PingFang SC, Microsoft YaHei, sans-serif",
  };
  const chartScale =
    periodScale[period] *
    (channel === "all" ? 1 : channelScale[channel] * 1.65);
  const axis = {
    axisLabel: { ...commonText, fontSize: 10, margin: 14 },
    axisLine: { lineStyle: { color: "rgba(184, 194, 217, 0.12)" } },
    axisTick: { show: false },
  };

  if (variant === "donut") {
    return {
      animationDuration: 1700,
      animationEasing: "cubicOut",
      color: ["#4FC3F7", "#26D8C8", "#7C85FF", "#C4B5FF", "#A7E9D8"],
      tooltip: {
        trigger: "item",
        backgroundColor: "rgba(22, 30, 45, .92)",
        borderColor: "rgba(232,244,255,.12)",
        textStyle: { color: "#E8F4FF" },
      },
      series: [
        {
          type: "pie",
          radius: ["56%", "76%"],
          center: ["50%", "54%"],
          padAngle: 3,
          selectedMode: "single",
          selectedOffset: 5,
          itemStyle: {
            borderColor: "#19202e",
            borderWidth: 5,
            borderRadius: 10,
            shadowBlur: 20,
            shadowColor: "rgba(79,195,247,.28)",
          },
          label: {
            color: "rgba(232,244,255,.7)",
            fontSize: 10,
            formatter: "{b}  {d}%",
          },
          labelLine: {
            lineStyle: { color: "rgba(184,194,217,.28)" },
            length: 8,
            length2: 6,
          },
          data: [
            {
              value: 34,
              name: t("线上", "Online"),
              selected: channel === "online",
            },
            {
              value: 27,
              name: t("直营", "Direct"),
              selected: channel === "direct",
            },
            { value: 19, name: t("分销", "Distribution") },
            { value: 12, name: t("社媒", "Social") },
            { value: 8, name: t("其他", "Other") },
          ],
        },
      ],
    };
  }

  if (variant === "radar") {
    const radarAdjustment =
      channel === "all" ? 0 : channel === "online" ? 4 : -3;
    return {
      animationDuration: 1550,
      animationEasing: "cubicOut",
      radar: {
        center: ["50%", "54%"],
        radius: "68%",
        splitNumber: 4,
        indicator: [
          t("增长", "Growth"),
          t("留存", "Retention"),
          t("履约", "Fulfillment"),
          t("复购", "Repurchase"),
          t("声量", "Reach"),
          t("利润", "Profit"),
        ].map((name) => ({ name, max: 100 })),
        axisName: { color: "rgba(232,244,255,.68)", fontSize: 10 },
        splitLine: { lineStyle: { color: ["rgba(184,194,217,.08)"] } },
        splitArea: {
          areaStyle: {
            color: ["rgba(255,255,255,.008)", "rgba(79,195,247,.018)"],
          },
        },
        axisLine: { lineStyle: { color: "rgba(184,194,217,.14)" } },
      },
      series: [
        {
          type: "radar",
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: "#A7E9D8", width: 2 },
          itemStyle: {
            color: "#E8F4FF",
            shadowBlur: 8,
            shadowColor: "#26D8C8",
          },
          areaStyle: {
            color: new graphic.RadialGradient(0.5, 0.5, 0.8, [
              { offset: 0, color: "rgba(38,216,200,.38)" },
              { offset: 1, color: "rgba(124,133,255,.04)" },
            ]),
          },
          data: [
            {
              value: [86, 72, 91, 65, 78, 84].map(
                (value) => value + radarAdjustment,
              ),
            },
          ],
        },
      ],
    };
  }

  const isArea = variant === "area";
  const labels = isArea
    ? [
        "08:00",
        "10:00",
        "12:00",
        "14:00",
        "16:00",
        "18:00",
        "20:00",
        t("现在", "Now"),
      ]
    : ["01", "05", "09", "13", "17", "21", "25", "29"];
  const baseData = isArea
    ? [38, 52, 43, 71, 62, 86, 68, 96]
    : [58, 66, 59, 79, 74, 92, 88, 104];
  const data = baseData.map((value) => Math.round(value * chartScale));
  const tone = isArea ? "#26D8C8" : "#4FC3F7";
  const lineGradient = new graphic.LinearGradient(0, 0, 1, 0, [
    { offset: 0, color: isArea ? "#26D8C8" : "#4FC3F7" },
    { offset: 0.55, color: isArea ? "#A7E9D8" : "#7C85FF" },
    { offset: 1, color: isArea ? "#4FC3F7" : "#C4B5FF" },
  ]);
  const axisMax = Math.max(120, Math.ceil(Math.max(...data) / 30) * 30);
  return {
    animationDuration: 1800,
    animationDurationUpdate: 800,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicInOut",
    grid: { left: 10, right: 16, top: 20, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "line",
        lineStyle: { color: "rgba(232,244,255,.18)" },
      },
      backgroundColor: "rgba(22, 30, 45, .94)",
      borderColor: "rgba(232,244,255,.12)",
      padding: [9, 12],
      textStyle: { color: "#E8F4FF" },
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: labels,
      ...axis,
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: axisMax,
      splitNumber: 4,
      ...axis,
      splitLine: {
        lineStyle: { color: "rgba(184,194,217,.08)", type: "dashed" },
      },
    },
    series: [
      {
        type: "line",
        data,
        smooth: 0.48,
        showSymbol: false,
        symbol: "circle",
        lineStyle: {
          color: lineGradient,
          width: 3,
          shadowBlur: 12,
          shadowColor: isArea ? "rgba(38,216,200,.38)" : "rgba(79,195,247,.44)",
        },
        itemStyle: { color: "#E8F4FF", borderColor: tone, borderWidth: 3 },
        emphasis: { focus: "series", scale: true },
        areaStyle: {
          color: new graphic.LinearGradient(0, 0, 0, 1, [
            {
              offset: 0,
              color: isArea ? "rgba(38,216,200,.34)" : "rgba(124,133,255,.29)",
            },
            { offset: 1, color: "rgba(18,23,33,0)" },
          ]),
        },
      },
    ],
  };
}

function useCountUp(target: number, duration: number) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      setValue(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, target]);
  return value;
}
