import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  History,
  Info,
  RefreshCcw,
  Search,
  XCircle,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import type { DatasetField } from "../datasets/api";
import {
  createDataset,
  createFilePreview,
  getFilePreview,
  listUploads,
  type FilePreview,
  type UploadRecord,
  type UploadStatus,
} from "./api";

const DEFAULT_PROJECT_ID = "prj_demo";
const FIELD_TYPES: DatasetField["inferred_type"][] = [
  "integer",
  "decimal",
  "date",
  "datetime",
  "boolean",
  "text",
];

export function ImportWizardPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const initialPreviewId = searchParams.get("preview_id");
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const [datasetName, setDatasetName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [fields, setFields] = useState<DatasetField[]>([]);
  const autoOpenedPreviewIdRef = useRef<string | null>(null);

  const uploadsQuery = useQuery({
    queryKey: ["import-uploads", submittedProjectId],
    queryFn: () => listUploads(submittedProjectId),
    enabled: submittedProjectId.trim().length > 0,
  });

  const previewMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) {
        throw new Error("Select a CSV or Excel file first");
      }
      return createFilePreview(projectId.trim(), selectedFile);
    },
    onSuccess: (result) => {
      setSubmittedProjectId(result.project_id);
      setPreview(result);
      setFields(result.fields);
      setDatasetName(
        (current) => current || cleanDatasetName(result.file_name),
      );
      void queryClient.invalidateQueries({
        queryKey: ["import-uploads", result.project_id],
      });
    },
    onError: () => {
      const nextProjectId = projectId.trim();
      setSubmittedProjectId(nextProjectId);
      void queryClient.invalidateQueries({
        queryKey: ["import-uploads", nextProjectId],
      });
    },
  });

  const datasetMutation = useMutation({
    mutationFn: () => {
      if (!preview) {
        throw new Error("Create a file preview first");
      }
      return createDataset({
        fields,
        name: datasetName.trim(),
        preview_id: preview.id,
        project_id: preview.project_id,
      });
    },
  });

  const savedPreviewMutation = useMutation({
    mutationFn: getFilePreview,
    onSuccess: (result) => {
      setProjectId(result.project_id);
      setSubmittedProjectId(result.project_id);
      setSelectedFile(null);
      setPreview(result);
      setFields(result.fields);
      setDatasetName(cleanDatasetName(result.file_name));
      datasetMutation.reset();
      previewMutation.reset();
    },
  });

  useEffect(() => {
    if (
      initialPreviewId &&
      autoOpenedPreviewIdRef.current !== initialPreviewId
    ) {
      autoOpenedPreviewIdRef.current = initialPreviewId;
      savedPreviewMutation.mutate(initialPreviewId);
    }
  }, [initialPreviewId, savedPreviewMutation]);

  const canPreview = projectId.trim().length > 0 && selectedFile !== null;
  const canCreateDataset =
    preview !== null &&
    datasetName.trim().length > 0 &&
    fields.length > 0 &&
    !datasetMutation.isPending;
  const sampleColumns = useMemo(
    () =>
      fields.map((field) => ({
        label: field.name,
        order: field.order,
        sourceName:
          preview?.fields.find(
            (sourceField) => sourceField.order === field.order,
          )?.name ?? field.name,
      })),
    [fields, preview?.fields],
  );

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProjectId = projectId.trim();
    setSubmittedProjectId(nextProjectId);
    setPreview(null);
    setFields([]);
    datasetMutation.reset();
    previewMutation.reset();
  }

  function updateField(index: number, patch: Partial<DatasetField>) {
    setFields((current) =>
      current.map((field, fieldIndex) =>
        fieldIndex === index
          ? {
              ...field,
              ...patch,
            }
          : field,
      ),
    );
  }

  return (
    <section className="space-y-5">
      <div className="border-b border-line pb-5">
        <p className="text-sm font-medium text-cyan">Import</p>
        <h2 className="mt-1 text-2xl font-semibold text-ink">Import wizard</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Upload CSV or Excel files, inspect inferred fields, and create
          materialized datasets.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <Panel title="Upload source">
            <div className="space-y-4">
              <form className="space-y-2" onSubmit={submitProject}>
                <label
                  className="text-xs font-semibold uppercase text-muted"
                  htmlFor="import-project-id"
                >
                  Project ID
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      id="import-project-id"
                      className="h-10 w-full rounded-md border border-line bg-white pl-9 pr-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                      value={projectId}
                      onChange={(event) => setProjectId(event.target.value)}
                    />
                  </div>
                  <button
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-brand/20 bg-blue-50 px-3 text-sm font-semibold text-brand transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={projectId.trim().length === 0}
                    type="submit"
                  >
                    Load
                  </button>
                </div>
              </form>

              <label className="block">
                <span className="text-xs font-semibold uppercase text-muted">
                  Source file
                </span>
                <div className="mt-2 rounded-md border border-dashed border-line bg-slate-50 p-4">
                  <div className="flex items-start gap-3">
                    <UploadCloud className="mt-1 h-5 w-5 text-brand" />
                    <div className="min-w-0 flex-1">
                      <input
                        aria-label="Source file"
                        className="block w-full text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
                        type="file"
                        accept=".csv,.xlsx,.xlsm"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setSelectedFile(file);
                          setPreview(null);
                          setFields([]);
                          setDatasetName(
                            file ? cleanDatasetName(file.name) : "",
                          );
                          datasetMutation.reset();
                          previewMutation.reset();
                        }}
                      />
                      <p className="mt-2 truncate text-xs text-muted">
                        {selectedFile
                          ? selectedFile.name
                          : "CSV, XLSX, or XLSM"}
                      </p>
                    </div>
                  </div>
                </div>
              </label>

              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canPreview || previewMutation.isPending}
                onClick={() => previewMutation.mutate()}
                type="button"
              >
                <RefreshCcw className="h-4 w-4" />
                {previewMutation.isPending ? "Parsing..." : "Create preview"}
              </button>

              {previewMutation.error ? (
                <ImportFailureHint message={previewMutation.error.message} />
              ) : null}
            </div>
          </Panel>

          <Panel title="Dataset target">
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase text-muted">
                  Dataset name
                </span>
                <input
                  aria-label="Dataset name"
                  className="mt-2 h-10 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                  value={datasetName}
                  onChange={(event) => setDatasetName(event.target.value)}
                  placeholder="Sales Orders"
                />
              </label>

              <button
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!canCreateDataset}
                onClick={() => datasetMutation.mutate()}
                type="button"
              >
                <CheckCircle2 className="h-4 w-4" />
                {datasetMutation.isPending ? "Creating..." : "Create dataset"}
              </button>

              {datasetMutation.data ? (
                <div className="space-y-3">
                  <Alert
                    tone="success"
                    message={`Created ${datasetMutation.data.name} (${datasetMutation.data.row_count} rows)`}
                  />
                  <Link
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-emerald/30 bg-white px-4 text-sm font-semibold text-emerald transition hover:bg-emerald/10"
                    to={`/datasets?project_id=${encodeURIComponent(datasetMutation.data.project_id)}&dataset_id=${encodeURIComponent(datasetMutation.data.id)}`}
                  >
                    Open dataset workspace
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              ) : null}
              {datasetMutation.error ? (
                <DatasetCreateFailureHint
                  message={datasetMutation.error.message}
                />
              ) : null}
            </div>
          </Panel>
        </aside>

        <div className="space-y-5">
          <PreviewSummary preview={preview} />
          <FieldEditor fields={fields} onChange={updateField} />
          <SampleRows preview={preview} columns={sampleColumns} />
        </div>
      </div>

      <UploadHistoryPanel
        error={uploadsQuery.error}
        isLoading={uploadsQuery.isLoading || uploadsQuery.isFetching}
        projectId={submittedProjectId}
        loadingPreviewId={
          savedPreviewMutation.isPending
            ? savedPreviewMutation.variables
            : undefined
        }
        openPreviewError={savedPreviewMutation.error}
        uploads={uploadsQuery.data?.items ?? []}
        onOpenPreview={(previewId) => savedPreviewMutation.mutate(previewId)}
        onRefresh={() =>
          void queryClient.invalidateQueries({
            queryKey: ["import-uploads", submittedProjectId],
          })
        }
      />
    </section>
  );
}

function PreviewSummary({ preview }: { preview: FilePreview | null }) {
  if (!preview) {
    return (
      <div className="rounded-md border border-dashed border-line bg-panel p-6 text-sm text-muted">
        Create a preview to inspect fields and sample rows before materializing
        a dataset.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric label="File" value={preview.file_name} tone="brand" />
      <Metric
        label="Type"
        value={preview.file_type.toUpperCase()}
        tone="cyan"
      />
      <Metric
        label="Rows"
        value={preview.row_count.toLocaleString()}
        tone="emerald"
      />
      <Metric
        label="Fields"
        value={preview.fields.length.toLocaleString()}
        tone="amber"
      />
      <div className="rounded-md border border-line bg-panel px-4 py-3 md:col-span-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald/20 bg-emerald/10 px-2.5 py-1 font-semibold text-emerald">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {preview.upload_status}
          </span>
          <span className="font-mono">
            upload {preview.uploaded_file_id ?? "-"}
          </span>
          <span>
            Original file is retained for reprocessing and dataset
            materialization.
          </span>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  fields,
  onChange,
}: {
  fields: DatasetField[];
  onChange: (index: number, patch: Partial<DatasetField>) => void;
}) {
  return (
    <Panel title="Field confirmation">
      {fields.length === 0 ? (
        <StateMessage title="No fields to confirm yet" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Order
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Field name
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Type
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Nullable
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => (
                <tr
                  key={`${field.order}-${index}`}
                  className="hover:bg-slate-50"
                >
                  <td className="border-b border-line px-4 py-3 text-muted">
                    {field.order + 1}
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <input
                      className="h-9 min-w-48 rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                      value={field.name}
                      onChange={(event) =>
                        onChange(index, { name: event.target.value })
                      }
                    />
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <select
                      className="h-9 rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-blue-100"
                      value={field.inferred_type}
                      onChange={(event) =>
                        onChange(index, {
                          inferred_type: event.target
                            .value as DatasetField["inferred_type"],
                        })
                      }
                    >
                      {FIELD_TYPES.map((fieldType) => (
                        <option key={fieldType} value={fieldType}>
                          {fieldType}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="border-b border-line px-4 py-3">
                    <label className="inline-flex items-center gap-2 text-sm text-muted">
                      <input
                        className="h-4 w-4 rounded border-line text-brand"
                        type="checkbox"
                        checked={field.nullable}
                        onChange={(event) =>
                          onChange(index, { nullable: event.target.checked })
                        }
                      />
                      nullable
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SampleRows({
  preview,
  columns,
}: {
  preview: FilePreview | null;
  columns: Array<{ label: string; order: number; sourceName: string }>;
}) {
  return (
    <Panel title="Sample rows">
      {!preview ? (
        <StateMessage title="No sample rows yet" />
      ) : preview.sample_rows.length === 0 ? (
        <StateMessage title="The preview has no sample rows" />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                {columns.map((column) => (
                  <th
                    key={`${column.order}-${column.label}`}
                    className="border-b border-line px-4 py-3 font-semibold"
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.sample_rows.map((row, rowIndex) => (
                <tr key={rowIndex} className="hover:bg-slate-50">
                  {columns.map((column) => (
                    <td
                      key={`${column.order}-${column.sourceName}`}
                      className="border-b border-line px-4 py-3 text-ink"
                    >
                      {formatCell(row[column.sourceName])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function UploadHistoryPanel({
  uploads,
  projectId,
  isLoading,
  error,
  loadingPreviewId,
  openPreviewError,
  onOpenPreview,
  onRefresh,
}: {
  uploads: UploadRecord[];
  projectId: string;
  isLoading: boolean;
  error: Error | null;
  loadingPreviewId?: string;
  openPreviewError: Error | null;
  onOpenPreview: (previewId: string) => void;
  onRefresh: () => void;
}) {
  const summary = useMemo(() => summarizeUploads(uploads), [uploads]);

  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-md border border-cyan/20 bg-cyan/10 p-2 text-cyan">
            <History className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">Upload history</h3>
            <p className="mt-1 text-xs text-muted">
              Project {projectId || "-"} keeps successful and failed file access
              attempts traceable.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <HistoryMetric
            label="Total"
            value={summary.total.toLocaleString()}
            tone="brand"
          />
          <HistoryMetric
            label="Parsed"
            value={summary.parsed.toLocaleString()}
            tone="emerald"
          />
          <HistoryMetric
            label="Failed"
            value={summary.failed.toLocaleString()}
            tone="amber"
          />
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3 text-xs font-semibold text-muted transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
            disabled={isLoading}
            onClick={onRefresh}
            type="button"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>
      {openPreviewError ? (
        <div className="border-b border-line bg-red-50 px-4 py-3 text-sm text-red-700">
          {openPreviewError.message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="p-4">
          <StateMessage title="Loading upload records" />
        </div>
      ) : error ? (
        <div className="p-4">
          <StateMessage title="Could not load upload records" tone="error" />
        </div>
      ) : uploads.length === 0 ? (
        <div className="p-4">
          <StateMessage title="No upload records found for this project" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-muted">
              <tr>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  File
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Status
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Size
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Preview
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Uploaded
                </th>
                <th className="border-b border-line px-4 py-3 font-semibold">
                  Trace
                </th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((upload) => (
                <UploadHistoryRow
                  key={upload.id}
                  loadingPreviewId={loadingPreviewId}
                  onOpenPreview={onOpenPreview}
                  upload={upload}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UploadHistoryRow({
  upload,
  loadingPreviewId,
  onOpenPreview,
}: {
  upload: UploadRecord;
  loadingPreviewId?: string;
  onOpenPreview: (previewId: string) => void;
}) {
  const isOpeningPreview =
    upload.preview_id !== null && upload.preview_id === loadingPreviewId;

  return (
    <tr className="align-top hover:bg-slate-50">
      <td className="border-b border-line px-4 py-3">
        <p className="max-w-xs truncate font-semibold text-ink">
          {upload.file_name}
        </p>
        <p className="mt-1 font-mono text-xs text-muted">{upload.id}</p>
        {upload.error_message ? (
          <p className="mt-2 max-w-md rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs leading-5 text-red-700">
            {upload.error_message}
          </p>
        ) : null}
      </td>
      <td className="border-b border-line px-4 py-3">
        <UploadStatusChip status={upload.status} />
        <p className="mt-2 text-xs uppercase text-muted">
          {upload.file_type || "unknown"}
        </p>
      </td>
      <td className="border-b border-line px-4 py-3 text-muted">
        {formatBytes(upload.size_bytes)}
      </td>
      <td className="border-b border-line px-4 py-3">
        {upload.preview_id ? (
          <div>
            <p className="font-mono text-xs text-ink">{upload.preview_id}</p>
            <p className="mt-1 text-xs text-muted">
              {(upload.preview_row_count ?? 0).toLocaleString()} rows parsed
            </p>
          </div>
        ) : (
          <span className="text-xs text-muted">-</span>
        )}
      </td>
      <td className="border-b border-line px-4 py-3 text-xs text-muted">
        <p>{formatDate(upload.created_at)}</p>
        <p className="mt-1">Updated {formatDate(upload.updated_at)}</p>
      </td>
      <td className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {upload.preview_id ? (
            <button
              className="inline-flex h-8 items-center rounded-md border border-emerald/30 bg-emerald/10 px-3 text-xs font-semibold text-emerald transition hover:bg-emerald/20 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isOpeningPreview}
              onClick={() => {
                if (upload.preview_id) {
                  onOpenPreview(upload.preview_id);
                }
              }}
              type="button"
            >
              {isOpeningPreview ? "Opening" : "Open preview"}
            </button>
          ) : null}
          <Link
            className="inline-flex h-8 items-center rounded-md border border-brand/20 bg-blue-50 px-3 text-xs font-semibold text-brand transition hover:bg-blue-100"
            to={`/tasks?project_id=${encodeURIComponent(upload.project_id)}`}
          >
            Task trace
          </Link>
        </div>
      </td>
    </tr>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-line bg-panel shadow-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <FileSpreadsheet className="h-4 w-4 text-brand" />
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function UploadStatusChip({ status }: { status: UploadStatus }) {
  const meta = {
    failed: {
      label: "Failed",
      icon: XCircle,
      className: "border-red-200 bg-red-50 text-red-700",
    },
    parsed: {
      label: "Parsed",
      icon: CheckCircle2,
      className: "border-emerald/20 bg-emerald/10 text-emerald",
    },
    pending: {
      label: "Pending",
      icon: Clock3,
      className: "border-amber/20 bg-amber/10 text-amber",
    },
  }[status];
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

function HistoryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "brand" | "amber" | "emerald";
}) {
  const toneClass = {
    amber: "border-amber/20 bg-amber/10 text-amber",
    brand: "border-brand/20 bg-blue-50 text-brand",
    emerald: "border-emerald/20 bg-emerald/10 text-emerald",
  }[tone];

  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
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

function Alert({
  tone,
  message,
}: {
  tone: "error" | "success";
  message: string;
}) {
  const className =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-emerald/20 bg-emerald/10 text-emerald";

  return (
    <div className={`rounded-md border px-3 py-3 text-sm ${className}`}>
      {message}
    </div>
  );
}

function ImportFailureHint({ message }: { message: string }) {
  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">{message}</p>
          <p className="mt-1 text-xs leading-5">
            The system keeps upload attempts traceable. Choose a CSV/XLSX file
            with a header row, or open Task Center to inspect retry eligibility.
          </p>
        </div>
      </div>
    </div>
  );
}

function DatasetCreateFailureHint({ message }: { message: string }) {
  const isNameConflict = /already exists|dataset with this name/i.test(message);
  return (
    <div className="space-y-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
      <p className="font-semibold">{message}</p>
      {isNameConflict ? (
        <p className="text-xs leading-5">
          Use a unique dataset name for this project. Existing datasets are kept
          immutable unless you explicitly create a new derived asset.
        </p>
      ) : (
        <p className="text-xs leading-5">
          The original file and preview metadata are retained, so you can adjust
          fields or retry the materialization from Task Center when eligible.
        </p>
      )}
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
        "rounded-md border px-4 py-6 text-center text-sm",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-line bg-slate-50 text-muted",
      ].join(" ")}
    >
      {title}
    </div>
  );
}

function cleanDatasetName(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[_-]+/g, " ")
      .trim() || "Imported Dataset"
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

interface UploadSummary {
  failed: number;
  parsed: number;
  total: number;
}

function summarizeUploads(uploads: UploadRecord[]): UploadSummary {
  return uploads.reduce(
    (summary, upload) => {
      summary.total += 1;
      if (upload.status === "parsed") {
        summary.parsed += 1;
      }
      if (upload.status === "failed") {
        summary.failed += 1;
      }
      return summary;
    },
    { failed: 0, parsed: 0, total: 0 },
  );
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
