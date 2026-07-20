import {
  BarChart3,
  BrushCleaning,
  Database,
  FileUp,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  SquareTerminal,
} from "lucide-react";
import { Link } from "react-router-dom";

const DEMO_PROJECT_ID = "prj_demo";

const workflowItems = [
  {
    title: "Data Sources",
    description: "Upload records, local file intake, and external database entry.",
    href: `/data-sources?project_id=${DEMO_PROJECT_ID}`,
    icon: Database,
    tone: "brand" as const,
  },
  {
    title: "Import",
    description: "CSV/Excel preview, field confirmation, and dataset creation.",
    href: `/import?project_id=${DEMO_PROJECT_ID}`,
    icon: FileUp,
    tone: "cyan" as const,
  },
  {
    title: "Datasets",
    description: "Formal PostgreSQL-backed tables, preview, and quality overview.",
    href: `/datasets?project_id=${DEMO_PROJECT_ID}`,
    icon: ListChecks,
    tone: "emerald" as const,
  },
  {
    title: "Cleaning",
    description: "Saveable visual recipes and derived dataset execution.",
    href: `/cleaning?project_id=${DEMO_PROJECT_ID}`,
    icon: BrushCleaning,
    tone: "amber" as const,
  },
  {
    title: "SQL Workspace",
    description: "Project-scoped read-only SQL and reusable data views.",
    href: `/sql?project_id=${DEMO_PROJECT_ID}`,
    icon: SquareTerminal,
    tone: "brand" as const,
  },
  {
    title: "Charts",
    description: "Data View field mapping and ECharts visualization.",
    href: `/charts?project_id=${DEMO_PROJECT_ID}`,
    icon: BarChart3,
    tone: "cyan" as const,
  },
  {
    title: "Dashboards",
    description: "Saved chart-backed dashboard and report layout foundation.",
    href: `/dashboards?project_id=${DEMO_PROJECT_ID}`,
    icon: LayoutDashboard,
    tone: "emerald" as const,
  },
  {
    title: "Tasks",
    description: "Workflow status, retry entry, and related resource trace.",
    href: `/tasks?project_id=${DEMO_PROJECT_ID}`,
    icon: ScrollText,
    tone: "amber" as const,
  },
];

export function WorkspaceHomePage() {
  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
        <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <p className="text-sm font-semibold uppercase text-cyan">
              Demo workspace
            </p>
            <h2 className="mt-3 max-w-3xl text-3xl font-semibold text-ink">
              Professional data analysis workbench
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted">
              The seeded project follows the MVP data flow from file intake to
              dataset materialization, cleaning, SQL data views, charts,
              dashboards, and task traceability.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                to={`/datasets?project_id=${DEMO_PROJECT_ID}`}
              >
                <ListChecks className="h-4 w-4" />
                Open demo dataset
              </Link>
              <Link
                className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald/30 bg-emerald/10 px-4 text-sm font-semibold text-emerald transition hover:bg-emerald/20"
                to={`/dashboards?project_id=${DEMO_PROJECT_ID}`}
              >
                <LayoutDashboard className="h-4 w-4" />
                View dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-md border border-cyan/20 bg-cyan/10 p-4">
            <p className="text-xs font-semibold uppercase text-cyan">
              Active project
            </p>
            <p className="mt-2 font-mono text-lg font-semibold text-ink">
              {DEMO_PROJECT_ID}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted">
              Seeded resources are available across the sidebar workflow for
              inspecting the current MVP experience.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Primary flow" value="8 modules" tone="brand" />
        <Metric label="Seeded source" value="CSV" tone="cyan" />
        <Metric label="Storage" value="PostgreSQL" tone="emerald" />
        <Metric label="Traceability" value="Tasks + lineage" tone="amber" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {workflowItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              className="rounded-md border border-line bg-panel p-4 shadow-panel transition hover:border-brand hover:bg-blue-50"
              key={item.title}
              to={item.href}
            >
              <div className={`inline-flex rounded-md border p-2 ${toneClass(item.tone)}`}>
                <Icon className="h-4 w-4" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-xs leading-5 text-muted">
                {item.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "cyan" | "emerald" | "amber";
}) {
  return (
    <div className={`rounded-md border px-4 py-3 ${toneClass(tone)}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function toneClass(tone: "brand" | "cyan" | "emerald" | "amber") {
  return {
    amber: "border-amber/20 bg-amber/10 text-amber",
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];
}
