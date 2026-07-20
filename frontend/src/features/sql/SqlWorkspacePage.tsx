import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Database,
  Play,
  RefreshCcw,
  Save,
  SquareTerminal,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  getSqlMetadata,
  runSql,
  saveSqlDataView,
  type SqlDatasetReference,
  type SqlRunResult,
} from "./api";

const DEFAULT_PROJECT_ID = "prj_demo";
const DEFAULT_LIMIT = 100;

export function SqlWorkspacePage() {
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [sql, setSql] = useState("SELECT * FROM dataset_id_here");
  const [dataViewName, setDataViewName] = useState("SQL data view");
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const [latestResult, setLatestResult] = useState<SqlRunResult | null>(null);

  const metadataQuery = useQuery({
    queryKey: ["sql-metadata", submittedProjectId],
    queryFn: () => getSqlMetadata(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const datasets = useMemo(
    () => metadataQuery.data?.datasets ?? [],
    [metadataQuery.data],
  );
  const firstDataset = datasets[0] ?? null;

  const runMutation = useMutation({
    mutationFn: () =>
      runSql({
        project_id: submittedProjectId,
        sql,
        limit,
      }),
    onSuccess: (result) => setLatestResult(result),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSqlDataView({
        project_id: submittedProjectId,
        sql,
        name: dataViewName.trim(),
        description: null,
        limit,
      }),
  });

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
    setLatestResult(null);
  }

  function useDatasetAlias(alias: string) {
    setSql(`SELECT * FROM ${alias} LIMIT 50`);
    setLatestResult(null);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">SQL</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            SQL workspace
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Query project datasets with read-only SQL and prepare reusable
            analytical results.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor="sql-project-id">
            Project ID
          </label>
          <input
            id="sql-project-id"
            className="h-10 flex-1 rounded-md border border-line bg-panel px-3 text-sm text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="Project ID"
          />
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            type="submit"
          >
            <RefreshCcw className="h-4 w-4" />
            Load
          </button>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <DatasetCatalog
          datasets={datasets}
          isLoading={metadataQuery.isLoading}
          error={metadataQuery.error}
          onUseAlias={useDatasetAlias}
        />

        <div className="space-y-5">
          <QueryEditor
            sql={sql}
            dataViewName={dataViewName}
            limit={limit}
            firstDatasetAlias={firstDataset?.table_alias}
            isRunning={runMutation.isPending}
            error={runMutation.error}
            saveError={saveMutation.error}
            savedDataView={saveMutation.data}
            onSqlChange={(value) => {
              setSql(value);
              setLatestResult(null);
              saveMutation.reset();
            }}
            onDataViewNameChange={(value) => {
              setDataViewName(value);
              saveMutation.reset();
            }}
            onLimitChange={setLimit}
            onRun={() => runMutation.mutate()}
            onSave={() => saveMutation.mutate()}
            isSaving={saveMutation.isPending}
          />
          <ResultPanel
            result={latestResult}
            isLoading={runMutation.isPending}
          />
        </div>
      </div>
    </section>
  );
}

function DatasetCatalog({
  datasets,
  isLoading,
  error,
  onUseAlias,
}: {
  datasets: SqlDatasetReference[];
  isLoading: boolean;
  error: Error | null;
  onUseAlias: (alias: string) => void;
}) {
  return (
    <aside className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<Database className="h-4 w-4 text-brand" />}
        title="Project datasets"
      />
      <div className="p-3">
        {isLoading ? (
          <StateMessage title="Loading datasets" />
        ) : error ? (
          <StateMessage title="Could not load SQL metadata" tone="error" />
        ) : datasets.length === 0 ? (
          <StateMessage title="No datasets found" />
        ) : (
          <div className="space-y-3">
            {datasets.map((dataset) => (
              <button
                key={dataset.id}
                className="w-full rounded-md border border-line bg-white px-3 py-3 text-left transition hover:border-cyan hover:bg-slate-50"
                onClick={() => onUseAlias(dataset.table_alias)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {dataset.name}
                    </p>
                    <p className="mt-1 truncate font-mono text-xs text-brand">
                      {dataset.table_alias}
                    </p>
                  </div>
                  <span className="rounded bg-emerald/10 px-2 py-1 text-xs font-semibold text-emerald">
                    {dataset.row_count.toLocaleString()}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {dataset.fields.slice(0, 5).map((field) => (
                    <span
                      key={field.name}
                      className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-medium text-brand"
                    >
                      {field.name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function QueryEditor({
  sql,
  dataViewName,
  limit,
  firstDatasetAlias,
  isRunning,
  error,
  saveError,
  savedDataView,
  onSqlChange,
  onDataViewNameChange,
  onLimitChange,
  onRun,
  onSave,
  isSaving,
}: {
  sql: string;
  dataViewName: string;
  limit: number;
  firstDatasetAlias?: string;
  isRunning: boolean;
  error: Error | null;
  saveError: Error | null;
  savedDataView?: { id: string; name: string; row_count: number };
  onSqlChange: (value: string) => void;
  onDataViewNameChange: (value: string) => void;
  onLimitChange: (value: number) => void;
  onRun: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<SquareTerminal className="h-4 w-4 text-brand" />}
        title="Query editor"
      />
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-cyan/20 bg-cyan/10 px-3 py-3 text-sm text-cyan">
          Use dataset IDs as table names. Example:
          <code className="ml-2 font-mono">
            SELECT * FROM {firstDatasetAlias ?? "dataset_xxx"} LIMIT 50
          </code>
        </div>

        <textarea
          aria-label="SQL query"
          className="min-h-52 w-full resize-y rounded-md border border-line bg-slate-950 px-4 py-3 font-mono text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan focus:ring-2 focus:ring-cyan/20"
          value={sql}
          onChange={(event) => onSqlChange(event.target.value)}
          spellCheck={false}
        />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <label className="flex items-center gap-2 text-sm text-muted">
            Result limit
            <input
              aria-label="Result limit"
              className="h-9 w-24 rounded-md border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-blue-100"
              min={1}
              max={500}
              type="number"
              value={limit}
              onChange={(event) => onLimitChange(Number(event.target.value))}
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={isRunning || sql.trim().length === 0}
              onClick={onRun}
              type="button"
            >
              <Play className="h-4 w-4" />
              {isRunning ? "Running..." : "Run query"}
            </button>
          </div>
        </div>

        <div className="rounded-md border border-emerald/20 bg-emerald/10 p-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="flex-1">
              <span className="text-xs font-semibold uppercase text-emerald">
                Data view name
              </span>
              <input
                aria-label="Data view name"
                className="mt-2 h-10 w-full rounded-md border border-emerald/20 bg-white px-3 text-sm text-ink outline-none transition focus:border-emerald focus:ring-2 focus:ring-emerald/20"
                value={dataViewName}
                onChange={(event) => onDataViewNameChange(event.target.value)}
              />
            </label>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-emerald px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-45 md:mt-6"
              disabled={isSaving || sql.trim().length === 0 || dataViewName.trim().length === 0}
              onClick={onSave}
              type="button"
            >
              <Save className="h-4 w-4" />
              {isSaving ? "Saving..." : "Save as data view"}
            </button>
          </div>
        </div>

        {error ? <Alert message={error.message} /> : null}
        {saveError ? <Alert message={saveError.message} /> : null}
        {savedDataView ? (
          <div className="rounded-md border border-emerald/20 bg-emerald/10 px-3 py-3 text-sm text-emerald">
            Saved {savedDataView.name} ({savedDataView.row_count} rows). It is now available for
            charts and dashboards.
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  isLoading,
}: {
  result: SqlRunResult | null;
  isLoading: boolean;
}) {
  const columns = result?.columns ?? [];
  const rows = result?.rows ?? [];

  return (
    <div className="rounded-md border border-line bg-panel shadow-panel">
      <PanelHeader
        icon={<Table2 className="h-4 w-4 text-brand" />}
        title="Query result"
      />
      {isLoading ? (
        <StateMessage title="Running query" />
      ) : !result ? (
        <StateMessage title="Run a query to inspect rows" />
      ) : rows.length === 0 ? (
        <StateMessage title="Query returned no rows" />
      ) : (
        <>
          <div className="grid gap-3 border-b border-line p-4 md:grid-cols-3">
            <Metric
              label="Rows"
              value={result.row_count.toLocaleString()}
              tone="brand"
            />
            <Metric
              label="Columns"
              value={columns.length.toLocaleString()}
              tone="cyan"
            />
            <Metric
              label="Limit"
              value={result.limit.toLocaleString()}
              tone="emerald"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-muted">
                <tr>
                  {columns.map((column) => (
                    <th
                      key={column}
                      className="border-b border-line px-4 py-3 font-semibold"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-slate-50">
                    {columns.map((column) => (
                      <td
                        key={column}
                        className="border-b border-line px-4 py-3 text-ink"
                      >
                        {formatCell(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function PanelHeader({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-line px-4 py-3">
      {icon}
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
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
  tone: "brand" | "cyan" | "emerald";
}) {
  const toneClass = {
    brand: "border-brand/20 bg-blue-50 text-brand",
    cyan: "border-cyan/20 bg-cyan/10 text-cyan",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-3 ${toneClass}`}>
      <p className="text-xs font-semibold uppercase">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold">{value}</p>
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

function Alert({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function formatCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted">NULL</span>;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}
