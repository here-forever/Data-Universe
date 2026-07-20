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
  Bell,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Database,
  Download,
  FileBarChart,
  Grid2X2,
  LayoutDashboard,
  ListFilter,
  MoreHorizontal,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  UsersRound,
  Workflow,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ChartVariant = "line" | "area" | "donut" | "radar";
type Period = "本周" | "本月" | "本季度";
type Channel = "全部渠道" | "线上" | "直营";

registerEChartsModules([
  CanvasRenderer,
  GridComponent,
  LineChart,
  PieChart,
  RadarChart,
  TooltipComponent,
]);

const navigation: Array<{ label: string; icon: LucideIcon }> = [
  { label: "总览", icon: Grid2X2 },
  { label: "数据源", icon: Database },
  { label: "数据集", icon: Table2 },
  { label: "数据流", icon: Workflow },
  { label: "仪表盘", icon: LayoutDashboard },
  { label: "报表中心", icon: FileBarChart },
];

const periods: Period[] = ["本周", "本月", "本季度"];
const channels: Channel[] = ["全部渠道", "线上", "直营"];

const periodScale: Record<Period, number> = {
  本周: 0.58,
  本月: 1,
  本季度: 2.74,
};
const channelScale: Record<Channel, number> = {
  全部渠道: 1,
  线上: 0.46,
  直营: 0.31,
};

const tableRows = [
  {
    name: "华东零售渠道",
    source: "销售订单",
    channel: "直营",
    updated: "刚刚",
    status: "活跃",
    value: "¥ 128,420",
  },
  {
    name: "会员复购漏斗",
    source: "客户画像",
    channel: "线上",
    updated: "12 分钟前",
    status: "已同步",
    value: "64.8%",
  },
  {
    name: "华南仓储效率",
    source: "库存流水",
    channel: "直营",
    updated: "34 分钟前",
    status: "活跃",
    value: "92.4%",
  },
  {
    name: "内容投放归因",
    source: "营销触点",
    channel: "线上",
    updated: "1 小时前",
    status: "待校验",
    value: "¥ 46,280",
  },
];

export function FluidDataDashboard() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeNav, setActiveNav] = useState("总览");
  const [period, setPeriod] = useState<Period>("本月");
  const [activeChannel, setActiveChannel] = useState<Channel>("全部渠道");
  const scale = periodScale[period] * channelScale[activeChannel];
  const filteredRows = useMemo(
    () =>
      tableRows.filter(
        (row) => activeChannel === "全部渠道" || row.channel === activeChannel,
      ),
    [activeChannel],
  );

  const resetFilters = () => {
    setPeriod("本月");
    setActiveChannel("全部渠道");
  };

  return (
    <div className={sidebarCollapsed ? "fluid-app is-collapsed" : "fluid-app"}>
      <AmbientBackdrop />
      <aside className="sidebar" aria-label="主导航">
        <div className="brand-lockup">
          <div className="brand-mark">
            <Sparkles size={18} strokeWidth={1.8} />
          </div>
          <div className="brand-copy">
            <strong>雾流</strong>
            <span>DATA ATELIER</span>
          </div>
        </div>

        <button
          className="sidebar-toggle"
          onClick={() => setSidebarCollapsed((current) => !current)}
          type="button"
          aria-label={sidebarCollapsed ? "展开侧边栏" : "折叠侧边栏"}
        >
          {sidebarCollapsed ? (
            <ChevronRight size={17} />
          ) : (
            <ChevronLeft size={17} />
          )}
        </button>

        <nav className="sidebar-nav">
          <p className="nav-caption">工作空间</p>
          {navigation.map(({ label, icon: Icon }) => (
            <button
              className={
                activeNav === label ? "nav-item is-active" : "nav-item"
              }
              key={label}
              onClick={() => setActiveNav(label)}
              aria-pressed={activeNav === label}
              title={sidebarCollapsed ? label : undefined}
              type="button"
            >
              <Icon size={18} strokeWidth={1.75} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-orb">
            <Cloud size={17} />
          </div>
          <div className="storage-copy">
            <span>云端存储</span>
            <strong>72.8% 已使用</strong>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumbs">
            <span>云析空间</span>
            <i /> <strong>{activeNav}</strong>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="搜索" type="button">
              <Search size={18} />
            </button>
            <button
              className="icon-button has-dot"
              aria-label="通知"
              type="button"
            >
              <Bell size={18} />
            </button>
            <div className="user-chip">
              <div className="avatar">林</div>
              <div>
                <strong>林予安</strong>
                <span>分析负责人</span>
              </div>
            </div>
          </div>
        </header>

        <div className="content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">
                <span /> 晨间数据脉冲 · 实时更新
              </p>
              <h1>
                你好，林予安<span>。</span>
              </h1>
              <p className="page-subtitle">让重要信号，在安静的流动里浮现。</p>
            </div>
            <div className="heading-actions">
              <div className="period-picker" aria-label="时间范围">
                {periods.map((item) => (
                  <button
                    className={period === item ? "is-selected" : ""}
                    key={item}
                    onClick={() => setPeriod(item)}
                    aria-pressed={period === item}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
              <button className="add-button" type="button">
                <Plus size={17} />
                新建分析
              </button>
            </div>
          </section>

          <section className="filter-ribbon glass-panel" aria-label="全局筛选">
            <div className="filter-context">
              <span className="filter-context-icon">
                <CalendarRange size={16} />
              </span>
              <div>
                <small>当前分析视图</small>
                <strong>
                  {period} · {activeChannel}
                </strong>
              </div>
            </div>
            <div className="channel-filter" role="group" aria-label="渠道筛选">
              {channels.map((channel) => (
                <button
                  className={activeChannel === channel ? "is-active" : ""}
                  key={channel}
                  onClick={() => setActiveChannel(channel)}
                  aria-pressed={activeChannel === channel}
                  type="button"
                >
                  {channel}
                </button>
              ))}
            </div>
            <div className="filter-feedback" aria-live="polite">
              <span>
                <Radio size={14} />
                图表与资产表已联动
              </span>
              <button onClick={resetFilters} type="button">
                <RotateCcw size={14} />
                重置
              </button>
            </div>
          </section>

          <section className="kpi-grid" aria-label="核心指标">
            <MetricCard
              label="经营总览"
              value={256840 * scale}
              suffix="元"
              trend="12.8%"
              accent="blue"
              icon={Activity}
            />
            <MetricCard
              label="活跃访客"
              value={16492 * scale}
              suffix=""
              trend="8.4%"
              accent="teal"
              icon={UsersRound}
            />
            <MetricCard
              label="转化效率"
              value={
                (66.8 + (periodScale[period] - 1) * 2.4) *
                (activeChannel === "全部渠道"
                  ? 1
                  : activeChannel === "线上"
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
              label="数据健康度"
              value={98.6}
              suffix="%"
              trend="稳定"
              accent="pearl"
              icon={ShieldCheck}
              decimal
            />
          </section>

          <section className="dashboard-grid">
            <Panel
              className="chart-panel line-panel"
              title="经营趋势"
              subtitle="收入与目标的柔性轨迹"
              action="查看详情"
            >
              <FluidChart
                variant="line"
                period={period}
                channel={activeChannel}
              />
            </Panel>
            <Panel
              className="chart-panel donut-panel"
              title="渠道构成"
              subtitle="点击环图聚焦渠道"
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
              title="经营感知"
              subtitle="六维表现雷达"
            >
              <FluidChart
                variant="radar"
                period={period}
                channel={activeChannel}
              />
            </Panel>
            <Panel
              className="chart-panel area-panel"
              title="数据流速"
              subtitle="每小时写入与处理量"
              action="查看流向"
            >
              <FluidChart
                variant="area"
                period={period}
                channel={activeChannel}
              />
            </Panel>
            <RealtimePanel scale={scale} />
          </section>

          <section className="data-section glass-panel">
            <div className="panel-heading table-heading">
              <div>
                <p className="panel-kicker">DATA PULSE</p>
                <h2>当前关注的数据资产</h2>
              </div>
              <div className="table-actions">
                <button className="soft-button" type="button">
                  <ListFilter size={16} />
                  筛选
                </button>
                <button className="soft-button" type="button">
                  <Download size={16} />
                  导出
                </button>
                <button
                  className="icon-button"
                  aria-label="更多表格操作"
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
                    <th>分析资产</th>
                    <th>来源</th>
                    <th>最后更新</th>
                    <th>状态</th>
                    <th>核心数值</th>
                    <th aria-label="操作" />
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.name}>
                      <td>
                        <span className="asset-dot" />
                        {row.name}
                      </td>
                      <td className="muted-cell">{row.source}</td>
                      <td className="muted-cell">{row.updated}</td>
                      <td>
                        <span
                          className={
                            row.status === "待校验"
                              ? "status-chip warning"
                              : "status-chip"
                          }
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="value-cell">{row.value}</td>
                      <td>
                        <button
                          className="row-more"
                          aria-label={`${row.name} 更多操作`}
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
      </main>
    </div>
  );
}

function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <span className="glow glow-one" />
      <span className="glow glow-two" />
      <span className="glow glow-three" />
      <i className="particle particle-one" />
      <i className="particle particle-two" />
      <i className="particle particle-three" />
      <i className="particle particle-four" />
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
}: {
  label: string;
  value: number;
  suffix: string;
  trend: string;
  accent: "blue" | "teal" | "violet" | "pearl";
  icon: LucideIcon;
  decimal?: boolean;
}) {
  const displayed = useCountUp(value, 1350);
  const number = decimal
    ? displayed.toFixed(1)
    : Math.round(displayed).toLocaleString("zh-CN");
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
        <span className={trend === "稳定" ? "trend stable" : "trend"}>
          <ArrowUpRight size={14} />
          {trend}
        </span>
        <span>较上期</span>
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
  const throughput = useCountUp(1248 * (0.78 + scale * 0.22), 1100);
  return (
    <article className="glass-panel realtime-panel">
      <div className="panel-heading">
        <div>
          <p className="panel-kicker">REAL-TIME</p>
          <h2>实时指标</h2>
          <span>系统此刻的微弱心跳</span>
        </div>
        <span className="live-badge">
          <i />
          在线
        </span>
      </div>
      <div className="realtime-value">
        <span>处理吞吐</span>
        <strong>
          {Math.round(throughput).toLocaleString("zh-CN")}
          <em>条/秒</em>
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
            任务队列
          </span>
          <strong>
            14 <small>运行中</small>
          </strong>
        </div>
        <div>
          <span>
            <i className="signal teal" />
            数据连接
          </span>
          <strong>
            09 <small>正常</small>
          </strong>
        </div>
        <div>
          <span>
            <i className="signal violet" />
            计算资源
          </span>
          <strong>
            68 <small>% 已用</small>
          </strong>
        </div>
      </div>
      <button className="realtime-link" type="button">
        进入任务中心 <ArrowUpRight size={16} />
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
  const chartRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = init(chartRef.current, undefined, {
      renderer: "canvas",
    });
    chart.setOption(createChartOption(variant, period, channel));
    if (variant === "donut" && onChannelSelect) {
      chart.on("click", (params) => {
        if (params.name === "线上" || params.name === "直营")
          onChannelSelect(params.name);
        else onChannelSelect("全部渠道");
      });
    }
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [channel, onChannelSelect, period, variant]);

  const chartNames: Record<ChartVariant, string> = {
    line: "经营趋势",
    area: "数据流速",
    donut: "渠道构成",
    radar: "经营感知",
  };
  const chartElement = (
    <div
      className={`echart echart-${variant}`}
      aria-label={`${chartNames[variant]}数据图表`}
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
        <span>{channel === "全部渠道" ? "总收入" : channel}</span>
      </div>
    </div>
  );
}

function createChartOption(
  variant: ChartVariant,
  period: Period,
  channel: Channel,
): EChartsCoreOption {
  const commonText = {
    color: "rgba(232, 244, 255, 0.58)",
    fontFamily: "PingFang SC, Microsoft YaHei, sans-serif",
  };
  const chartScale =
    periodScale[period] *
    (channel === "全部渠道" ? 1 : channelScale[channel] * 1.65);
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
            { value: 34, name: "线上", selected: channel === "线上" },
            { value: 27, name: "直营", selected: channel === "直营" },
            { value: 19, name: "分销" },
            { value: 12, name: "社媒" },
            { value: 8, name: "其他" },
          ],
        },
      ],
    };
  }

  if (variant === "radar") {
    const radarAdjustment =
      channel === "全部渠道" ? 0 : channel === "线上" ? 4 : -3;
    return {
      animationDuration: 1550,
      animationEasing: "cubicOut",
      radar: {
        center: ["50%", "54%"],
        radius: "68%",
        splitNumber: 4,
        indicator: ["增长", "留存", "履约", "复购", "声量", "利润"].map(
          (name) => ({ name, max: 100 }),
        ),
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
    ? ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "现在"]
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
