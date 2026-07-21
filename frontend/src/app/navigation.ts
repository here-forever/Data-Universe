import {
  BarChart3,
  BrushCleaning,
  ChartNoAxesCombined,
  Database,
  FileUp,
  Grid2X2,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  SquareTerminal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavigationItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { label: "总览", path: "/", icon: Grid2X2 },
  { label: "数据源", path: "/data-sources", icon: Database },
  { label: "数据导入", path: "/import", icon: FileUp },
  { label: "数据集", path: "/datasets", icon: ListChecks },
  { label: "数据清洗", path: "/cleaning", icon: BrushCleaning },
  { label: "分析工作台", path: "/analytics", icon: ChartNoAxesCombined },
  { label: "SQL 工作台", path: "/sql", icon: SquareTerminal },
  { label: "图表分析", path: "/charts", icon: BarChart3 },
  { label: "仪表盘", path: "/dashboards", icon: LayoutDashboard },
  { label: "任务中心", path: "/tasks", icon: ScrollText },
];
