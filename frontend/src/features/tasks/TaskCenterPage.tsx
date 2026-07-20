import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  DatabaseZap,
  FileSpreadsheet,
  ListChecks,
  RefreshCcw,
  RotateCcw,
  Search,
  SquareTerminal,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { listTasks, retryTask, type TaskItem, type TaskStatus } from "./api";

const DEFAULT_PROJECT_ID = "prj_demo";

const TASK_TYPE_LABELS: Record<string, string> = {
  chart_save: "Chart save",
  cleaning_recipe_execution: "Cleaning execution",
  dashboard_save: "Dashboard/report save",
  dataset_materialization: "Dataset materialization",
  derived_dataset_materialization: "Derived dataset",
  file_preview_parse: "File preview parse",
  sql_query_run: "SQL query",
  sql_data_view_materialization: "SQL data view",
};

const STATUS_META: Record<
  TaskStatus,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  failed: {
    label: "Failed",
    className: "border-red-200 bg-red-50 text-red-700",
    icon: AlertTriangle,
  },
  pending: {
    label: "Pending",
    className: "border-amber/20 bg-amber/10 text-amber",
    icon: Clock3,
  },
  retryable: {
    label: "Retryable",
    className: "border-amber/20 bg-amber/10 text-amber",
    icon: RotateCcw,
  },
  running: {
    label: "Running",
    className: "border-cyan/20 bg-cyan/10 text-cyan",
    icon: RefreshCcw,
  },
  success: {
    label: "Success",
    className: "border-emerald/20 bg-emerald/10 text-emerald",
    icon: CheckCircle2,
  },
};

export function TaskCenterPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);

  const tasksQuery = useQuery({
    queryKey: ["tasks", submittedProjectId],
    queryFn: () => listTasks(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const tasks = useMemo(() => tasksQuery.data?.items ?? [], [tasksQuery.data]);
  const summary = useMemo(() => summarizeTasks(tasks), [tasks]);
  const retryMutation = useMutation({
    mutationFn: retryTask,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["tasks", submittedProjectId],
      });
    },
  });

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">Task center</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            Workflow task visibility
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Track imports, cleaning execution, SQL materialization, and saved
            chart or report actions from the project workflow.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor="task-project-id">
            Project ID
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="task-project-id"
              className="h-10 w-full rounded-md border border-line bg-panel pl-9 pr-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              placeholder="Project ID"
            />
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            type="submit"
          >
            <RefreshCcw className="h-4 w-4" />
            Load
          </button>
        </form>
      </div>

      <TaskSummary summary={summary} />

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <TaskFlowPanel tasks={tasks} isLoading={tasksQuery.isLoading} />
        <TaskTable
          tasks={tasks}
          isLoading={tasksQuery.isLoading || tasksQuery.isFetching}
          error={tasksQuery.error}
          retryingTaskId={
            retryMutation.isPending ? retryMutation.variables : undefined
          }
          retryError={retryMutation.error}
          retryTaskId={retryMutation.data?.retry_task.id}
          onRetry={(taskId) => retryMutation.mutate(taskId)}
        />
      </div>
    </section>
  );
}

function TaskSummary({ summary }: { summary: TaskSummaryStats }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric
        label="Total"
        value={summary.total.toLocaleString()}
        tone="brand"
      />
      <Metric
        label="Succeeded"
        value={summary.success.toLocaleString()}
        tone="emerald"
      />
      <Metric
        label="Running"
        value={summary.running.toLocaleString()}
        tone="cyan"
      />
      <Metric
        label="Needs attention"
        value={(summary.failed + summary.retryable).toLocaleString()}
        tone="amber"
      />
    </div>
  );
}

function TaskFlowPanel({
  tasks,
  isLoading,
}: {
  tasks: TaskItem[];
  isLoading: boolean;
}) {
  const typeCounts = useMemo(() => countTaskTypes(tasks), [tasks]);
  const flowItems = [
    {
      type: "file_preview_parse",
      label: "Import preview",
      icon: FileSpreadsheet,
      tone: "brand" as const,
    },
    {
      type: "dataset_materialization",
      label: "Dataset",
      icon: DatabaseZap,
      tone: "emerald" as const,
    },
    {
      type: "cleaning_recipe_execution",
      label: "Cleaning",
      icon: ListChecks,
      tone: "cyan" as const,
    },
    {
      type: "sql_data_view_materialization",
      label: "SQL view",
      icon: SquareTerminal,
      tone: "amber" as const,
    },
    {
      type: "dashboard_save",
      label: "Report",
      icon: CheckCircle2,
      tone: "brand" as const,
    },
  ];

  return (
    <aside className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader title="Workflow coverage" />
      {isLoading ? (
        <StateMessage title="Loading task coverage" />
      ) : tasks.length === 0 ? (
        <StateMessage title="No workflow tasks yet" />
      ) : (
        <div className="space-y-3 p-4">
          {flowItems.map((item) => (
            <FlowItem
              key={item.type}
              count={typeCounts[item.type] ?? 0}
              icon={item.icon}
              label={item.label}
              tone={item.tone}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function TaskTable({
  tasks,
  isLoading,
  error,
  retryingTaskId,
  retryError,
  retryTaskId,
  onRetry,
}: {
  tasks: TaskItem[];
  isLoading: boolean;
  error: Error | null;
  retryingTaskId?: string;
  retryError: Error | null;
  retryTaskId?: string;
  onRetry: (taskId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader title="Recent tasks" />
      {isLoading ? (
        <StateMessage title="Loading tasks" />
      ) : error ? (
        <StateMessage title="Could not load tasks" tone="error" />
      ) : tasks.length === 0 ? (
        <StateMessage title="No tasks found for this project" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Task
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Type
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Progress
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Related resource
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Finished
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  onRetry={onRetry}
                  retryingTaskId={retryingTaskId}
                  task={task}
                />
              ))}
            </tbody>
          </table>
          {retryTaskId ? (
            <div className="border-t border-line bg-emerald/10 px-4 py-3 text-sm text-emerald">
              Retry finished as {retryTaskId}
            </div>
          ) : null}
          {retryError ? (
            <div className="border-t border-line bg-red-50 px-4 py-3 text-sm text-red-700">
              {retryError.message}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  retryingTaskId,
  onRetry,
}: {
  task: TaskItem;
  retryingTaskId?: string;
  onRetry: (taskId: string) => void;
}) {
  const isRetrying = retryingTaskId === task.id;

  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="border-b border-line px-4 py-3">
        <p className="max-w-xs truncate font-semibold text-ink">{task.name}</p>
        <p className="mt-1 font-mono text-xs text-muted">{task.id}</p>
        {task.error_message ? (
          <p className="mt-2 max-w-sm rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {task.error_message}
          </p>
        ) : null}
      </td>
      <td className="border-b border-line px-4 py-3 text-muted">
        {TASK_TYPE_LABELS[task.task_type] ?? task.task_type}
      </td>
      <td className="border-b border-line px-4 py-3">
        <StatusChip status={task.status} />
      </td>
      <td className="border-b border-line px-4 py-3">
        <ProgressBar progress={task.progress} />
      </td>
      <td className="border-b border-line px-4 py-3">
        <RelatedResourceLink task={task} />
      </td>
      <td className="border-b border-line px-4 py-3 text-xs text-muted">
        {formatDate(task.finished_at ?? task.created_at)}
      </td>
      <td className="border-b border-line px-4 py-3">
        {task.can_retry ? (
          <button
            className="inline-flex h-8 items-center gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 text-xs font-semibold text-amber transition hover:bg-amber/20 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isRetrying}
            onClick={() => onRetry(task.id)}
            type="button"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {isRetrying ? "Retrying" : "Retry"}
          </button>
        ) : (
          <span className="text-xs text-muted">-</span>
        )}
      </td>
    </tr>
  );
}

function RelatedResourceLink({ task }: { task: TaskItem }) {
  const href = buildResourceHref(task);

  return (
    <div>
      <p className="text-xs font-semibold uppercase text-muted">
        {task.related_resource_type ?? "Resource"}
      </p>
      <p className="mt-1 max-w-[220px] truncate font-mono text-xs text-ink">
        {task.related_resource_id ?? "-"}
      </p>
      {href ? (
        <Link
          className="mt-2 inline-flex h-8 items-center rounded-md border border-brand/20 bg-blue-50 px-3 text-xs font-semibold text-brand transition hover:bg-blue-100"
          to={href}
        >
          Open resource
        </Link>
      ) : null}
    </div>
  );
}

function FlowItem({
  icon: Icon,
  label,
  count,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  count: number;
  tone: "brand" | "cyan" | "emerald" | "amber";
}) {
  const toneClass = {
    amber: "border-amber/20 bg-amber/10 text-amber",
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];

  return (
    <div
      className={`flex items-center gap-3 rounded-md border p-3 ${toneClass}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="mt-1 text-xs opacity-80">{count} tasks</p>
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  const normalized = Math.min(100, Math.max(0, progress));
  return (
    <div className="w-36">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${normalized}%` }}
        />
      </div>
      <p className="mt-1 text-xs font-semibold text-muted">{normalized}%</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "cyan" | "amber" | "emerald";
}) {
  const toneClass = {
    amber: "border-amber/20 bg-amber/10 text-amber",
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];

  return (
    <div className={`rounded-md border px-4 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 truncate text-lg font-semibold">{value}</p>
    </div>
  );
}

function PanelHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <span className="rounded-full bg-cyan/10 px-2 py-1 text-xs font-semibold text-cyan">
        MVP
      </span>
    </div>
  );
}

function StateMessage({
  title,
  tone = "muted",
}: {
  title: string;
  tone?: "muted" | "error";
}) {
  return (
    <div
      className={[
        "m-4 rounded-md border px-4 py-6 text-center text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-line bg-slate-50 text-muted",
      ].join(" ")}
    >
      {title}
    </div>
  );
}

interface TaskSummaryStats {
  failed: number;
  retryable: number;
  running: number;
  success: number;
  total: number;
}

function summarizeTasks(tasks: TaskItem[]): TaskSummaryStats {
  return tasks.reduce(
    (summary, task) => {
      summary.total += 1;
      if (task.status === "success") {
        summary.success += 1;
      }
      if (task.status === "running" || task.status === "pending") {
        summary.running += 1;
      }
      if (task.status === "failed") {
        summary.failed += 1;
      }
      if (task.status === "retryable") {
        summary.retryable += 1;
      }
      return summary;
    },
    { failed: 0, retryable: 0, running: 0, success: 0, total: 0 },
  );
}

function countTaskTypes(tasks: TaskItem[]): Record<string, number> {
  return tasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.task_type] = (counts[task.task_type] ?? 0) + 1;
    return counts;
  }, {});
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function buildResourceHref(task: TaskItem): string | null {
  if (!task.project_id || !task.related_resource_id) {
    return null;
  }

  const projectParam = `project_id=${encodeURIComponent(task.project_id)}`;
  const resourceParam = encodeURIComponent(task.related_resource_id);

  if (task.related_resource_type === "dataset") {
    return `/datasets?${projectParam}&dataset_id=${resourceParam}`;
  }
  if (task.related_resource_type === "data_view") {
    return `/charts?${projectParam}&data_view_id=${resourceParam}`;
  }
  if (task.related_resource_type === "chart") {
    return `/charts?${projectParam}&chart_id=${resourceParam}`;
  }
  if (task.related_resource_type === "dashboard") {
    return `/dashboards?${projectParam}&dashboard_id=${resourceParam}`;
  }

  return null;
}
