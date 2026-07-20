import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCcw,
  Search,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  getDatasetPreview,
  getDatasetQuality,
  listDatasets,
  type Dataset,
  type DatasetQuality,
} from "./api";

const DEFAULT_PROJECT_ID = "prj_demo";
const PAGE_SIZE = 20;

export function DatasetPage() {
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const initialDatasetId = searchParams.get("dataset_id");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(
    initialDatasetId,
  );
  const [page, setPage] = useState(1);

  const datasetsQuery = useQuery({
    queryKey: ["datasets", submittedProjectId],
    queryFn: () => listDatasets(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data?.items],
  );

  const selectedDataset = useMemo(
    () =>
      datasets.find((dataset) => dataset.id === selectedDatasetId) ??
      datasets[0] ??
      null,
    [datasets, selectedDatasetId],
  );
  const activeDatasetId = selectedDataset?.id ?? null;

  const previewQuery = useQuery({
    queryKey: ["dataset-preview", activeDatasetId, page, PAGE_SIZE],
    queryFn: () => getDatasetPreview(activeDatasetId ?? "", page, PAGE_SIZE),
    enabled: Boolean(activeDatasetId),
  });

  const qualityQuery = useQuery({
    queryKey: ["dataset-quality", activeDatasetId],
    queryFn: () => getDatasetQuality(activeDatasetId ?? ""),
    enabled: Boolean(activeDatasetId),
  });

  const preview = previewQuery.data;
  const activeDataset = preview?.dataset ?? selectedDataset;
  const totalRows = preview?.total_rows ?? activeDataset?.row_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const rows = preview?.rows ?? [];

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
    setSelectedDatasetId(null);
    setPage(1);
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 border-b border-line pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-cyan">Datasets</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            Dataset workspace
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Browse formal datasets, inspect schema, and preview materialized
            PostgreSQL rows.
          </p>
        </div>

        <form className="flex w-full max-w-xl gap-2" onSubmit={submitProject}>
          <label className="sr-only" htmlFor="project-id">
            Project ID
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="project-id"
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

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <DatasetList
          datasets={datasets}
          isLoading={datasetsQuery.isLoading}
          error={datasetsQuery.error}
          selectedDatasetId={activeDatasetId}
          onSelect={(datasetId) => {
            setSelectedDatasetId(datasetId);
            setPage(1);
          }}
        />

        <div className="space-y-5">
          <DatasetSummary dataset={activeDataset} />
          <DatasetQualityPanel
            quality={qualityQuery.data ?? null}
            isLoading={qualityQuery.isLoading || qualityQuery.isFetching}
            error={qualityQuery.error}
          />
          <DatasetPreviewTable
            dataset={activeDataset}
            rows={rows}
            isLoading={previewQuery.isLoading || previewQuery.isFetching}
            error={previewQuery.error}
            page={page}
            totalPages={totalPages}
            pageSize={PAGE_SIZE}
            totalRows={totalRows}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
          />
        </div>
      </div>
    </section>
  );
}

function DatasetQualityPanel({
  quality,
  isLoading,
  error,
}: {
  quality: DatasetQuality | null;
  isLoading: boolean;
  error: Error | null;
}) {
  if (isLoading) {
    return <StateMessage title="Loading dataset quality profile" />;
  }
  if (error) {
    return (
      <StateMessage
        title="Could not load dataset quality profile"
        tone="error"
      />
    );
  }
  if (!quality) {
    return null;
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Quality overview</h3>
          <p className="mt-1 text-xs text-muted">
            Profiled from the materialized PostgreSQL dataset.
          </p>
        </div>
        {quality.warnings.length ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/20 bg-amber/10 px-2.5 py-1 text-xs font-semibold text-amber">
            <AlertTriangle className="h-3.5 w-3.5" />
            {quality.warnings.length} warnings
          </span>
        ) : (
          <span className="rounded-full border border-emerald/20 bg-emerald/10 px-2.5 py-1 text-xs font-semibold text-emerald">
            No major warnings
          </span>
        )}
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-4">
        <Metric
          label="Null cells"
          value={quality.null_cell_count.toLocaleString()}
          tone="amber"
        />
        <Metric
          label="Null ratio"
          value={`${Math.round(quality.null_cell_ratio * 100)}%`}
          tone="cyan"
        />
        <Metric
          label="Duplicate rows"
          value={quality.duplicate_row_count.toLocaleString()}
          tone="brand"
        />
        <Metric
          label="Profiled fields"
          value={quality.field_count.toLocaleString()}
          tone="emerald"
        />
      </div>

      <div className="overflow-x-auto border-t border-line">
        <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-muted">
            <tr>
              <th className="border-b border-line px-4 py-3 font-semibold">
                Field
              </th>
              <th className="border-b border-line px-4 py-3 font-semibold">
                Nulls
              </th>
              <th className="border-b border-line px-4 py-3 font-semibold">
                Distinct
              </th>
              <th className="border-b border-line px-4 py-3 font-semibold">
                Sample values
              </th>
              <th className="border-b border-line px-4 py-3 font-semibold">
                Warnings
              </th>
            </tr>
          </thead>
          <tbody>
            {quality.field_profiles.map((profile) => (
              <tr key={profile.name} className="hover:bg-slate-50">
                <td className="border-b border-line px-4 py-3">
                  <p className="font-semibold text-ink">{profile.name}</p>
                  <p className="mt-1 text-xs text-muted">
                    {profile.inferred_type}
                  </p>
                </td>
                <td className="border-b border-line px-4 py-3 text-muted">
                  {profile.null_count} ({Math.round(profile.null_ratio * 100)}%)
                </td>
                <td className="border-b border-line px-4 py-3 text-muted">
                  {profile.distinct_count.toLocaleString()}
                </td>
                <td className="border-b border-line px-4 py-3 text-muted">
                  {profile.sample_values.length
                    ? profile.sample_values
                        .map((value) => formatPlainCell(value))
                        .join(", ")
                    : "-"}
                </td>
                <td className="border-b border-line px-4 py-3">
                  {profile.warnings.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {profile.warnings.map((warning) => (
                        <span
                          key={warning}
                          className="rounded-full border border-amber/20 bg-amber/10 px-2 py-1 text-xs font-semibold text-amber"
                        >
                          {formatWarning(warning)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface DatasetListProps {
  datasets: Dataset[];
  isLoading: boolean;
  error: Error | null;
  selectedDatasetId: string | null;
  onSelect: (datasetId: string) => void;
}

function DatasetList({
  datasets,
  isLoading,
  error,
  selectedDatasetId,
  onSelect,
}: DatasetListProps) {
  return (
    <aside className="min-h-[520px] rounded-md border border-line bg-panel shadow-panel">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-brand" />
          <h3 className="text-sm font-semibold text-ink">Project datasets</h3>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-brand">
          {datasets.length}
        </span>
      </div>

      <div className="p-3">
        {isLoading ? (
          <StateMessage title="Loading datasets" />
        ) : error ? (
          <StateMessage title="Could not load datasets" tone="error" />
        ) : datasets.length === 0 ? (
          <StateMessage title="No datasets found" />
        ) : (
          <div className="space-y-2">
            {datasets.map((dataset) => {
              const isActive = dataset.id === selectedDatasetId;

              return (
                <button
                  key={dataset.id}
                  className={[
                    "w-full rounded-md border px-3 py-3 text-left transition",
                    isActive
                      ? "border-brand bg-blue-50 shadow-sm"
                      : "border-line bg-white hover:border-cyan hover:bg-slate-50",
                  ].join(" ")}
                  onClick={() => onSelect(dataset.id)}
                  type="button"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">
                        {dataset.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {dataset.id}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-emerald/10 px-2 py-1 text-xs font-semibold text-emerald">
                      {dataset.row_count}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                    <Table2 className="h-3.5 w-3.5" />
                    <span className="truncate">
                      {dataset.physical_table_name}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

function DatasetSummary({ dataset }: { dataset: Dataset | null }) {
  if (!dataset) {
    return (
      <div className="rounded-md border border-dashed border-line bg-panel p-6 text-sm text-muted">
        Select a dataset to inspect fields and preview rows.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric
        label="Rows"
        value={dataset.row_count.toLocaleString()}
        tone="brand"
      />
      <Metric
        label="Fields"
        value={dataset.fields.length.toLocaleString()}
        tone="cyan"
      />
      <Metric
        label="Source Preview"
        value={compactId(dataset.source_preview_id)}
        tone="amber"
      />
      <Metric
        label="Table"
        value={dataset.physical_table_name}
        tone="emerald"
      />
    </div>
  );
}

interface DatasetPreviewTableProps {
  dataset: Dataset | null;
  rows: Array<Record<string, string | number | boolean | null>>;
  isLoading: boolean;
  error: Error | null;
  page: number;
  totalPages: number;
  pageSize: number;
  totalRows: number;
  onPrevious: () => void;
  onNext: () => void;
}

function DatasetPreviewTable({
  dataset,
  rows,
  isLoading,
  error,
  page,
  totalPages,
  pageSize,
  totalRows,
  onPrevious,
  onNext,
}: DatasetPreviewTableProps) {
  const fields = dataset?.fields ?? [];

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Data preview</h3>
          <p className="mt-1 text-xs text-muted">
            Page {page} of {totalPages}, {pageSize} rows per page
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page <= 1 || isLoading}
            onClick={onPrevious}
            type="button"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-line bg-white text-muted transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page >= totalPages || isLoading}
            onClick={onNext}
            type="button"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <StateMessage title="Loading preview rows" />
      ) : error ? (
        <StateMessage title="Could not load preview rows" tone="error" />
      ) : !dataset ? (
        <StateMessage title="No dataset selected" />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-muted">
                <tr>
                  <th className="sticky left-0 z-10 border-b border-line bg-slate-50 px-4 py-3 font-semibold">
                    Row
                  </th>
                  {fields.map((field) => (
                    <th
                      key={`${field.order}-${field.name}`}
                      className="border-b border-line px-4 py-3 font-semibold"
                    >
                      <div className="flex min-w-32 flex-col gap-1">
                        <span className="normal-case text-ink">
                          {field.name}
                        </span>
                        <span className="text-[11px] font-medium text-muted">
                          {field.inferred_type}
                          {field.nullable ? " nullable" : ""}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={String(row._das_row_id)}
                    className="hover:bg-slate-50"
                  >
                    <td className="sticky left-0 z-10 border-b border-line bg-white px-4 py-3 text-xs font-semibold text-muted">
                      {row._das_row_id}
                    </td>
                    {fields.map((field) => (
                      <td
                        key={field.name}
                        className="border-b border-line px-4 py-3 text-ink"
                      >
                        {formatCell(row[field.name])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? (
            <StateMessage title="This page has no rows" />
          ) : (
            <div className="border-t border-line px-4 py-3 text-xs text-muted">
              Showing rows {(page - 1) * pageSize + 1}-
              {Math.min(page * pageSize, totalRows)} of {totalRows}
            </div>
          )}
        </>
      )}
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

function compactId(value: string) {
  if (value.length <= 18) {
    return value;
  }
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
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

function formatPlainCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function formatWarning(value: string) {
  return value.replace(/_/g, " ");
}
