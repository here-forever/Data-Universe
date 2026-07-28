import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  FileJson,
  FileSpreadsheet,
  FileText,
  Plus,
  RefreshCw,
  Rows3,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useCollaboration } from "../collaboration/collaborationState";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { type TranslationKey, useI18n } from "../../i18n";
import {
  type CleaningAction,
  type CleaningResultStep,
  type CleaningStep,
  type ColumnProfile,
  queryKeys,
  vibeApi,
} from "../../lib/vibeApi";

type DataTab = "preview" | "profile" | "clean";

interface EditableStep extends CleaningStep {
  key: string;
}

const actionLabelKeys: Record<CleaningAction, TranslationKey> = {
  drop_duplicates: "data.action.drop_duplicates",
  drop_missing: "data.action.drop_missing",
  fill_missing: "data.action.fill_missing",
  flag_outliers: "data.action.flag_outliers",
};

const kindLabelKeys: Record<ColumnProfile["kind"], TranslationKey> = {
  numeric: "data.kind.numeric",
  categorical: "data.kind.categorical",
  boolean: "data.kind.boolean",
  datetime: "data.kind.datetime",
  text: "data.kind.text",
};

function makeStep(
  action: CleaningAction = "drop_duplicates",
  column = "",
): EditableStep {
  return {
    key: crypto.randomUUID(),
    action,
    ...(action === "drop_missing" ? { columns: column ? [column] : [] } : {}),
    ...(action === "fill_missing" ? { column, strategy: "mean" } : {}),
    ...(action === "flag_outliers" ? { column } : {}),
  };
}

export default function DataWorkbenchPage() {
  const queryClient = useQueryClient();
  const activeDatasetId = useWorkspaceStore((state) => state.activeDatasetId);
  const setActiveDataset = useWorkspaceStore((state) => state.setActiveDataset);
  const { formatNumber, t } = useI18n();
  const { send } = useCollaboration();
  const [tab, setTab] = useState<DataTab>("preview");
  const [pagination, setPagination] = useState<{
    datasetId: string | null;
    offset: number;
  }>({
    datasetId: activeDatasetId,
    offset: 0,
  });
  const offset =
    pagination.datasetId === activeDatasetId ? pagination.offset : 0;
  const [uploadOpen, setUploadOpen] = useState(false);

  const datasets = useQuery({
    queryKey: queryKeys.datasets,
    queryFn: vibeApi.listDatasets,
  });
  const detail = useQuery({
    queryKey: queryKeys.dataset(activeDatasetId),
    queryFn: () => vibeApi.getDataset(activeDatasetId!),
    enabled: Boolean(activeDatasetId),
  });
  const rows = useQuery({
    queryKey: queryKeys.rows(activeDatasetId, offset),
    queryFn: () => vibeApi.getRows(activeDatasetId!, offset, 50),
    enabled: Boolean(activeDatasetId),
  });

  const createDemo = useMutation({
    mutationFn: vibeApi.createDemo,
    onSuccess: (dataset) => {
      setActiveDataset(dataset.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.datasets });
    },
  });
  const removeDataset = useMutation({
    mutationFn: vibeApi.deleteDataset,
    onSuccess: async () => {
      setActiveDataset(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.datasets });
    },
  });

  const invalidateDataset = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.datasets }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.dataset(activeDatasetId),
      }),
      queryClient.invalidateQueries({
        queryKey: ["datasets", activeDatasetId, "rows"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["datasets", activeDatasetId, "particles"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["insights", activeDatasetId],
      }),
    ]);
  };

  return (
    <section className="workbench-page data-workbench">
      <header className="page-heading compact-heading">
        <div>
          <span className="eyebrow">
            <Rows3 size={14} /> {t("data.eyebrow")}
          </span>
          <h1>{t("data.title")}</h1>
          <p>{t("data.subtitle")}</p>
        </div>
        <div className="heading-actions">
          <button
            className="secondary-button"
            onClick={() => createDemo.mutate()}
            type="button"
          >
            <Sparkles size={16} /> {t("data.demo")}
          </button>
          <button
            className="command-button"
            onClick={() => setUploadOpen(true)}
            type="button"
          >
            <Upload size={17} /> {t("data.import")}
          </button>
        </div>
      </header>

      <div className="data-workspace-grid">
        <aside className="dataset-browser">
          <div className="section-label">
            <span>{t("data.datasets")}</span>
            <strong>{datasets.data?.length ?? 0}</strong>
          </div>
          <div className="dataset-list">
            {datasets.data?.map((dataset) => (
              <button
                className={`dataset-row${dataset.id === activeDatasetId ? " is-active" : ""}`}
                key={dataset.id}
                onClick={() => setActiveDataset(dataset.id)}
                type="button"
              >
                <span className={`file-badge type-${dataset.file_type}`}>
                  {dataset.file_type === "json" ? (
                    <FileJson />
                  ) : dataset.file_type.includes("xls") ? (
                    <FileSpreadsheet />
                  ) : (
                    <FileText />
                  )}
                </span>
                <span className="dataset-row-copy">
                  <strong>{dataset.name}</strong>
                  <small>
                    {t("data.datasetMeta", {
                      count: formatNumber(dataset.row_count),
                      version: dataset.active_revision,
                    })}
                  </small>
                </span>
                <span className="quality-mini">{dataset.quality_score}</span>
              </button>
            ))}
            {!datasets.isLoading && !datasets.data?.length && (
              <button
                className="empty-dataset-row"
                onClick={() => setUploadOpen(true)}
                type="button"
              >
                <Plus size={18} /> {t("data.importFirst")}
              </button>
            )}
          </div>
          {activeDatasetId && (
            <button
              className="danger-link"
              disabled={removeDataset.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    t("data.deleteConfirm", {
                      name: detail.data?.name ?? t("data.currentDataset"),
                    }),
                  )
                ) {
                  removeDataset.mutate(activeDatasetId);
                }
              }}
              type="button"
            >
              <Trash2 size={15} /> {t("data.deleteCurrent")}
            </button>
          )}
        </aside>

        <div className="data-main-surface">
          {!activeDatasetId ? (
            <EmptyDataState
              onDemo={() => createDemo.mutate()}
              onUpload={() => setUploadOpen(true)}
            />
          ) : detail.isLoading ? (
            <div className="surface-loading">
              <RefreshCw className="spin" />
              {t("data.loadingProfile")}
            </div>
          ) : detail.isError ? (
            <div className="surface-error">
              <AlertTriangle />
              {detail.error.message}
            </div>
          ) : detail.data ? (
            <>
              <div className="dataset-header">
                <div>
                  <span className="source-name">
                    {detail.data.source_filename}
                  </span>
                  <h2>{detail.data.name}</h2>
                </div>
                <div className="dataset-vitals">
                  <span>
                    <strong>{formatNumber(detail.data.row_count)}</strong>{" "}
                    {t("data.metricRows")}
                  </span>
                  <span>
                    <strong>{detail.data.column_count}</strong>{" "}
                    {t("data.metricColumns")}
                  </span>
                  <span>
                    <strong>{detail.data.quality_score}</strong>{" "}
                    {t("data.metricQuality")}
                  </span>
                  <span>
                    <strong>v{detail.data.active_revision}</strong>{" "}
                    {t("data.metricVersion")}
                  </span>
                </div>
              </div>
              <div
                className="segmented-tabs"
                role="tablist"
                aria-label={t("data.views")}
              >
                {(
                  [
                    ["preview", t("data.preview")],
                    ["profile", t("data.profile")],
                    ["clean", t("data.clean")],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    aria-selected={tab === value}
                    className={tab === value ? "is-active" : ""}
                    key={value}
                    onClick={() => setTab(value)}
                    role="tab"
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === "preview" && (
                <PreviewTable
                  onNext={() =>
                    setPagination({
                      datasetId: activeDatasetId,
                      offset: offset + 50,
                    })
                  }
                  onPrevious={() =>
                    setPagination({
                      datasetId: activeDatasetId,
                      offset: Math.max(0, offset - 50),
                    })
                  }
                  page={rows.data}
                />
              )}
              {tab === "profile" && (
                <ProfileView columns={detail.data.profile.columns} />
              )}
              {tab === "clean" && (
                <CleaningPanel
                  columns={detail.data.profile.columns}
                  datasetId={detail.data.id}
                  history={detail.data.transformations}
                  onApplied={async (stepCount) => {
                    send("cleaning_revision", {
                      datasetId: detail.data.id,
                      stepCount,
                    });
                    await invalidateDataset();
                  }}
                />
              )}
            </>
          ) : null}
        </div>

        {detail.data && <QualityInspector profile={detail.data.profile} />}
      </div>

      {uploadOpen && (
        <UploadDialog
          onClose={() => setUploadOpen(false)}
          onUploaded={async (datasetId) => {
            setActiveDataset(datasetId);
            setUploadOpen(false);
            await queryClient.invalidateQueries({
              queryKey: queryKeys.datasets,
            });
          }}
        />
      )}
    </section>
  );
}

function EmptyDataState({
  onDemo,
  onUpload,
}: {
  onDemo: () => void;
  onUpload: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="empty-surface">
      <Database size={34} />
      <h2>{t("data.emptyTitle")}</h2>
      <p>{t("data.emptyBody")}</p>
      <div>
        <button className="command-button" onClick={onUpload} type="button">
          <Upload size={16} />
          {t("data.import")}
        </button>
        <button className="secondary-button" onClick={onDemo} type="button">
          <Sparkles size={16} />
          {t("data.useDemo")}
        </button>
      </div>
    </div>
  );
}

function UploadDialog({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (id: string) => Promise<void>;
}) {
  const { formatNumber, t } = useI18n();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: () => vibeApi.uploadDataset(file!, name.trim() || undefined),
    onSuccess: (dataset) => onUploaded(dataset.id),
  });
  const chooseFile = (next: File | null) => {
    if (!next) return;
    const extension = next.name.split(".").pop()?.toLowerCase();
    if (
      !extension ||
      !["csv", "xlsx", "xls", "xlsm", "json", "txt"].includes(extension)
    ) {
      return;
    }
    setFile(next);
    setName(next.name.replace(/\.[^.]+$/, ""));
  };
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        aria-labelledby="upload-title"
        aria-modal="true"
        className="upload-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">{t("data.localFile")}</span>
            <h2 id="upload-title">{t("data.uploadTitle")}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            title={t("common.close")}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className={`file-dropzone${dragging ? " is-dragging" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            chooseFile(event.dataTransfer.files[0] ?? null);
          }}
          type="button"
        >
          <input
            accept=".csv,.xlsx,.xls,.xlsm,.json,.txt"
            hidden
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
            ref={inputRef}
            type="file"
          />
          {file ? (
            <>
              <Check size={28} />
              <strong>{file.name}</strong>
              <span>
                {t("data.changeFile", {
                  size: formatNumber(file.size / 1024, {
                    maximumFractionDigits: 1,
                    minimumFractionDigits: 1,
                  }),
                })}
              </span>
            </>
          ) : (
            <>
              <Upload size={30} />
              <strong>{t("data.dropFile")}</strong>
              <span>{t("data.fileSupport")}</span>
            </>
          )}
        </button>
        <label className="field-label">
          <span>{t("data.datasetName")}</span>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder={t("data.datasetNamePlaceholder")}
            value={name}
          />
        </label>
        {upload.isError && (
          <p className="form-error">
            <AlertTriangle size={15} />
            {upload.error.message}
          </p>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" onClick={onClose} type="button">
            {t("common.cancel")}
          </button>
          <button
            className="command-button"
            disabled={!file || upload.isPending}
            onClick={() => upload.mutate()}
            type="button"
          >
            {upload.isPending ? (
              <RefreshCw className="spin" size={16} />
            ) : (
              <Upload size={16} />
            )}
            {upload.isPending ? t("data.parsing") : t("data.startImport")}
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewTable({
  page,
  onNext,
  onPrevious,
}: {
  page: Awaited<ReturnType<typeof vibeApi.getRows>> | undefined;
  onNext: () => void;
  onPrevious: () => void;
}) {
  const { formatNumber, t } = useI18n();
  if (!page)
    return (
      <div className="surface-loading">
        <RefreshCw className="spin" />
        {t("data.loadingRows")}
      </div>
    );
  const end = Math.min(page.offset + page.rows.length, page.total);
  return (
    <div className="preview-region">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th className="row-number">#</th>
              {page.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {page.rows.map((row, index) => (
              <tr key={page.offset + index}>
                <td className="row-number">{page.offset + index + 1}</td>
                {page.columns.map((column) => (
                  <td key={column}>{formatCell(row[column])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>
          {page.offset + 1}-{end} / {formatNumber(page.total)}
        </span>
        <div>
          <button
            className="icon-button"
            disabled={page.offset === 0}
            onClick={onPrevious}
            title={t("data.previousPage")}
            type="button"
          >
            <ArrowLeft size={17} />
          </button>
          <button
            className="icon-button"
            disabled={end >= page.total}
            onClick={onNext}
            title={t("data.nextPage")}
            type="button"
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileView({ columns }: { columns: ColumnProfile[] }) {
  const { formatNumber, t } = useI18n();
  return (
    <div className="profile-grid">
      {columns.map((column) => (
        <article className="column-profile" key={column.name}>
          <div className="column-profile-heading">
            <div>
              <strong>{column.name}</strong>
              <span className={`kind-badge kind-${column.kind}`}>
                {t(kindLabelKeys[column.kind])}
              </span>
            </div>
            <small>
              {t("data.uniqueValues", {
                count: formatNumber(column.unique_count),
              })}
            </small>
          </div>
          <div className="missing-track">
            <span
              style={{ width: `${Math.max(2, column.missing_ratio * 100)}%` }}
            />
          </div>
          <p>
            {column.missing_count
              ? t("data.missingValues", { count: column.missing_count })
              : t("data.noMissing")}
          </p>
          {column.stats ? (
            <dl className="mini-stats">
              <div>
                <dt>{t("data.mean")}</dt>
                <dd>{column.stats.mean}</dd>
              </div>
              <div>
                <dt>{t("data.median")}</dt>
                <dd>{column.stats.median}</dd>
              </div>
              <div>
                <dt>{t("data.std")}</dt>
                <dd>{column.stats.std}</dd>
              </div>
              <div>
                <dt>{t("data.outliers")}</dt>
                <dd>{column.stats.outlier_count}</dd>
              </div>
            </dl>
          ) : (
            <div className="top-values">
              {column.top_values?.slice(0, 4).map((item) => (
                <span key={item.value}>
                  <i style={{ width: `${Math.max(8, item.ratio * 100)}%` }} />
                  {item.value}
                  <small>{item.count}</small>
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function CleaningPanel({
  columns,
  datasetId,
  history,
  onApplied,
}: {
  columns: ColumnProfile[];
  datasetId: string;
  history: CleaningResultStep[];
  onApplied: (stepCount: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const defaultLabel = t("data.defaultRevisionLabel");
  const previousDefaultLabel = useRef(defaultLabel);
  const [label, setLabel] = useState(defaultLabel);
  const [steps, setSteps] = useState<EditableStep[]>([makeStep()]);
  const actionLabels = useMemo<Record<CleaningAction, string>>(
    () => ({
      drop_duplicates: t(actionLabelKeys.drop_duplicates),
      drop_missing: t(actionLabelKeys.drop_missing),
      fill_missing: t(actionLabelKeys.fill_missing),
      flag_outliers: t(actionLabelKeys.flag_outliers),
    }),
    [t],
  );

  useEffect(() => {
    const previousDefault = previousDefaultLabel.current;
    previousDefaultLabel.current = defaultLabel;
    setLabel((current) =>
      current === previousDefault ? defaultLabel : current,
    );
  }, [defaultLabel]);
  const clean = useMutation({
    mutationFn: () =>
      vibeApi.cleanDataset(
        datasetId,
        label,
        steps.map(
          ({ action, column, columns: selectedColumns, strategy, value }) => ({
            action,
            column,
            columns: selectedColumns,
            strategy,
            value,
          }),
        ),
      ),
    onSuccess: async () => {
      await onApplied(steps.length);
      setSteps([makeStep()]);
    },
  });
  const updateStep = (key: string, action: CleaningAction, column: string) => {
    setSteps((current) =>
      current.map((step) =>
        step.key === key ? makeStep(action, column) : step,
      ),
    );
  };
  const patchStep = (key: string, changes: Partial<EditableStep>) => {
    setSteps((current) =>
      current.map((step) =>
        step.key === key ? { ...step, ...changes, key } : step,
      ),
    );
  };
  return (
    <div className="cleaning-layout">
      <div className="cleaning-builder">
        <label className="field-label">
          <span>{t("data.revisionLabel")}</span>
          <input
            maxLength={160}
            onChange={(event) => setLabel(event.target.value)}
            value={label}
          />
        </label>
        <div className="cleaning-steps">
          {steps.map((step, index) => (
            <div className="cleaning-step" key={step.key}>
              <span className="step-index">{index + 1}</span>
              <select
                onChange={(event) =>
                  updateStep(
                    step.key,
                    event.target.value as CleaningAction,
                    columns[0]?.name ?? "",
                  )
                }
                value={step.action}
              >
                {Object.entries(actionLabels).map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              {step.action !== "drop_duplicates" && (
                <select
                  onChange={(event) =>
                    step.action === "drop_missing"
                      ? patchStep(step.key, { columns: [event.target.value] })
                      : patchStep(step.key, { column: event.target.value })
                  }
                  value={
                    step.action === "drop_missing"
                      ? (step.columns?.[0] ?? "")
                      : (step.column ?? "")
                  }
                >
                  <option value="" disabled>
                    {t("data.chooseField")}
                  </option>
                  {columns.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))}
                </select>
              )}
              {step.action === "fill_missing" && (
                <select
                  onChange={(event) =>
                    patchStep(step.key, {
                      strategy: event.target.value as CleaningStep["strategy"],
                    })
                  }
                  value={step.strategy ?? "mean"}
                >
                  <option value="mean">{t("data.strategyMean")}</option>
                  <option value="median">{t("data.strategyMedian")}</option>
                  <option value="mode">{t("data.strategyMode")}</option>
                  <option value="value">{t("data.strategyValue")}</option>
                </select>
              )}
              {step.action === "fill_missing" && step.strategy === "value" && (
                <input
                  aria-label={t("data.strategyValue")}
                  onChange={(event) =>
                    patchStep(step.key, { value: event.target.value })
                  }
                  placeholder={t("data.fillValue")}
                  value={String(step.value ?? "")}
                />
              )}
              <button
                className="icon-button"
                disabled={steps.length === 1}
                onClick={() =>
                  setSteps((current) =>
                    current.filter((item) => item.key !== step.key),
                  )
                }
                title={t("data.removeStep")}
                type="button"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
        <button
          className="add-step-button"
          onClick={() => setSteps((current) => [...current, makeStep()])}
          type="button"
        >
          <Plus size={16} />
          {t("data.addStep")}
        </button>
        {clean.isError && (
          <p className="form-error">
            <AlertTriangle size={15} />
            {clean.error.message}
          </p>
        )}
        <button
          className="command-button apply-cleaning"
          disabled={
            clean.isPending ||
            steps.some(
              (step) =>
                step.action !== "drop_duplicates" &&
                !(step.column || step.columns?.length),
            )
          }
          onClick={() => clean.mutate()}
          type="button"
        >
          {clean.isPending ? (
            <RefreshCw className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          {clean.isPending
            ? t("data.generatingRevision")
            : t("data.applyRevision")}
        </button>
      </div>
      <div className="revision-history">
        <div className="section-label">
          <span>{t("data.currentRevisionActions")}</span>
          <strong>{history.length}</strong>
        </div>
        {history.length ? (
          history.map((item, index) => (
            <div
              className="revision-row"
              key={`${String(item.action)}-${index}`}
            >
              <span>{index + 1}</span>
              <div>
                <strong>
                  {actionLabels[item.action as CleaningAction] ??
                    String(item.action)}
                </strong>
                <small>
                  {t("data.rowsChanged", {
                    before: String(item.rows_before),
                    after: String(item.rows_after),
                  })}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p>{t("data.noTransformations")}</p>
        )}
      </div>
    </div>
  );
}

function QualityInspector({
  profile,
}: {
  profile: {
    quality_score: number;
    missing_cells: number;
    duplicate_rows: number;
    columns: ColumnProfile[];
  };
}) {
  const { formatNumber, t } = useI18n();
  const problemColumns = useMemo(
    () =>
      profile.columns
        .filter((column) => column.missing_count || column.stats?.outlier_count)
        .slice(0, 8),
    [profile.columns],
  );
  return (
    <aside className="quality-inspector">
      <div className="quality-score">
        <span
          style={
            {
              "--quality": `${profile.quality_score * 3.6}deg`,
            } as React.CSSProperties
          }
        >
          <strong>{profile.quality_score}</strong>
        </span>
        <div>
          <strong>{t("data.qualityTitle")}</strong>
          <small>{t("data.qualityMax")}</small>
        </div>
      </div>
      <dl className="quality-facts">
        <div>
          <dt>{t("data.missingCells")}</dt>
          <dd>{formatNumber(profile.missing_cells)}</dd>
        </div>
        <div>
          <dt>{t("data.duplicateRows")}</dt>
          <dd>{formatNumber(profile.duplicate_rows)}</dd>
        </div>
        <div>
          <dt>{t("data.fieldsToReview")}</dt>
          <dd>{problemColumns.length}</dd>
        </div>
      </dl>
      <div className="quality-issues">
        <span className="section-label">{t("data.fieldHints")}</span>
        {problemColumns.length ? (
          problemColumns.map((column) => (
            <div key={column.name}>
              <span>{column.name}</span>
              <small>
                {column.missing_count
                  ? t("data.missingIssue", { count: column.missing_count })
                  : t("data.outlierIssue", {
                      count: column.stats?.outlier_count ?? 0,
                    })}
              </small>
            </div>
          ))
        ) : (
          <p>
            <Check size={15} />
            {t("data.noQualityIssues")}
          </p>
        )}
      </div>
    </aside>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
