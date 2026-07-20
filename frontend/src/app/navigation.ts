import {
  BarChart3,
  BrushCleaning,
  Database,
  FileUp,
  Home,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  SquareTerminal,
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavigationItem {
  label: string;
  path: string;
  icon: ComponentType<{ className?: string }>;
}

export const navigationItems: NavigationItem[] = [
  { label: "Workspace", path: "/", icon: Home },
  { label: "Data Sources", path: "/data-sources", icon: Database },
  { label: "Import", path: "/import", icon: FileUp },
  { label: "Datasets", path: "/datasets", icon: ListChecks },
  { label: "Cleaning", path: "/cleaning", icon: BrushCleaning },
  { label: "SQL Workspace", path: "/sql", icon: SquareTerminal },
  { label: "Charts", path: "/charts", icon: BarChart3 },
  { label: "Dashboards", path: "/dashboards", icon: LayoutDashboard },
  { label: "Tasks", path: "/tasks", icon: ScrollText },
];
