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

import type { LocalizedText } from "../i18n";

export interface NavigationItem {
  label: LocalizedText;
  path: string;
  icon: LucideIcon;
}

export const navigationItems: NavigationItem[] = [
  { label: { zh: "总览", en: "Overview" }, path: "/", icon: Grid2X2 },
  {
    label: { zh: "数据源", en: "Data sources" },
    path: "/data-sources",
    icon: Database,
  },
  {
    label: { zh: "数据导入", en: "Import data" },
    path: "/import",
    icon: FileUp,
  },
  {
    label: { zh: "数据集", en: "Datasets" },
    path: "/datasets",
    icon: ListChecks,
  },
  {
    label: { zh: "数据清洗", en: "Data cleaning" },
    path: "/cleaning",
    icon: BrushCleaning,
  },
  {
    label: { zh: "分析工作台", en: "Analytics" },
    path: "/analytics",
    icon: ChartNoAxesCombined,
  },
  {
    label: { zh: "SQL 工作台", en: "SQL workspace" },
    path: "/sql",
    icon: SquareTerminal,
  },
  { label: { zh: "图表分析", en: "Charts" }, path: "/charts", icon: BarChart3 },
  {
    label: { zh: "仪表盘", en: "Dashboards" },
    path: "/dashboards",
    icon: LayoutDashboard,
  },
  {
    label: { zh: "任务中心", en: "Task center" },
    path: "/tasks",
    icon: ScrollText,
  },
];
