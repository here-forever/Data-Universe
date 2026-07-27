import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleX,
  Clock3,
  Database,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileUp,
  Filter,
  FolderClock,
  HardDrive,
  LoaderCircle,
  RefreshCcw,
  Search,
  ShieldCheck,
  Table2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { useI18n } from "../../i18n";
import { listDatasets, type Dataset } from "../datasets/api";
import {
  createFilePreview,
  listUploads,
  type UploadRecord,
  type UploadStatus,
} from "../imports/api";

const DEFAULT_PROJECT_ID = "prj_demo";

export function DataSourcesPage() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const initialProjectId = searchParams.get("project_id") ?? DEFAULT_PROJECT_ID;
  const [projectId, setProjectId] = useState(initialProjectId);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(initialProjectId);
  const uploadsQuery = useQuery({
    queryKey: ["import-uploads", submittedProjectId],
    queryFn: () => listUploads(submittedProjectId),
    enabled: submittedProjectId.length > 0,
  });
  const datasetsQuery = useQuery({
    queryKey: ["datasets", submittedProjectId],
    queryFn: () => listDatasets(submittedProjectId),
    enabled: submittedProjectId.length > 0,
  });
  const uploads = useMemo(
    () => uploadsQuery.data?.items ?? [],
    [uploadsQuery.data?.items],
  );
  const datasets = useMemo(
    () => datasetsQuery.data?.items ?? [],
    [datasetsQuery.data?.items],
  );
  const latestParsedUpload = uploads.find(
    (upload) => upload.status === "parsed" && upload.preview_id,
  );
  const parsedCount = uploads.filter(
    (upload) => upload.status === "parsed",
  ).length;
  const failedCount = uploads.filter(
    (upload) => upload.status === "failed",
  ).length;

  function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmittedProjectId(projectId.trim());
  }

  return (
    <section className="local-source-page" aria-labelledby="local-source-title">
      <header className="local-source-header">
        <div>
          <p>LOCAL DATA INTAKE</p>
          <h1 id="local-source-title">
            {t("本地数据源", "Local data sources")}
          </h1>
          <span>
            {t(
              "统一接入 CSV 与 Excel，保留原始文件、解析预览和完整导入记录。",
              "Import CSV and Excel files while retaining originals, previews, and complete import history.",
            )}
          </span>
        </div>
        <form onSubmit={submitProject}>
          <label className="sr-only" htmlFor="data-source-project-id">
            {t("项目 ID", "Project ID")}
          </label>
          <Search size={15} aria-hidden="true" />
          <input
            id="data-source-project-id"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder={t("项目 ID", "Project ID")}
          />
          <button
            aria-label={t("刷新数据源", "Refresh data sources")}
            disabled={!projectId.trim()}
            type="submit"
          >
            <RefreshCcw size={15} />
          </button>
        </form>
      </header>

      <section
        className="local-source-metrics"
        aria-label={t("数据源摘要", "Data source summary")}
      >
        <SourceMetric
          icon={FileArchive}
          label={t("原始文件", "Original files")}
          tone="sky"
          value={uploads.length}
        />
        <SourceMetric
          icon={CheckCircle2}
          label={t("解析成功", "Parsed")}
          tone="mint"
          value={parsedCount}
        />
        <SourceMetric
          icon={AlertTriangle}
          label={t("失败记录", "Failed")}
          tone="rose"
          value={failedCount}
        />
        <SourceMetric
          icon={Database}
          label={t("正式数据集", "Datasets")}
          tone="lilac"
          value={datasets.length}
        />
      </section>

      <div className="local-source-layout">
        <aside className="local-source-rail">
          <div className="source-rail-heading">
            <HardDrive size={18} />
            <div>
              <strong>{t("文件接入", "File intake")}</strong>
              <span>{t("当前阶段唯一数据源", "Current local source")}</span>
            </div>
          </div>
          <div className="file-format-list">
            <div>
              <span className="format-icon csv">CSV</span>
              <div>
                <strong>{t("CSV 文件", "CSV file")}</strong>
                <small>
                  {t("UTF-8 / 常用分隔符", "UTF-8 / common delimiters")}
                </small>
              </div>
              <CheckCircle2 size={15} />
            </div>
            <div>
              <span className="format-icon xls">XLS</span>
              <div>
                <strong>{t("Excel 工作簿", "Excel workbook")}</strong>
                <small>.xlsx / .xlsm</small>
              </div>
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="source-policy">
            <ShieldCheck size={17} />
            <div>
              <strong>{t("可追溯导入", "Traceable imports")}</strong>
              <span>
                {t(
                  "原文件不会被正式数据集覆盖，失败解析也会保留记录。",
                  "Original files are never overwritten, and failed parses remain recorded.",
                )}
              </span>
            </div>
          </div>
          <div
            className="source-flow-mini"
            aria-label={t("本地数据流程", "Local data flow")}
          >
            <span>{t("文件", "File")}</span>
            <ArrowRight size={13} />
            <span>{t("预览", "Preview")}</span>
            <ArrowRight size={13} />
            <span>{t("数据集", "Dataset")}</span>
          </div>
        </aside>

        <main className="local-source-main">
          <LocalUploadDock
            key={submittedProjectId}
            latestParsedUpload={latestParsedUpload}
            projectId={submittedProjectId}
          />

          {uploadsQuery.error || datasetsQuery.error ? (
            <SourceState
              title={t(
                "无法读取本地数据源",
                "Unable to load local data sources",
              )}
              detail={String(
                (uploadsQuery.error ?? datasetsQuery.error) instanceof Error
                  ? (uploadsQuery.error ?? datasetsQuery.error)?.message
                  : t("请检查后端服务。", "Check the backend service."),
              )}
            />
          ) : null}

          <UploadHistory
            isLoading={uploadsQuery.isLoading || uploadsQuery.isFetching}
            projectId={submittedProjectId}
            uploads={uploads}
          />
          <DatasetBridge
            datasets={datasets}
            isLoading={datasetsQuery.isLoading || datasetsQuery.isFetching}
            projectId={submittedProjectId}
          />
        </main>
      </div>
    </section>
  );
}

const ACCEPTED_FILE_EXTENSIONS = [".csv", ".xlsx", ".xlsm"];

function LocalUploadDock({
  latestParsedUpload,
  projectId,
}: {
  latestParsedUpload: UploadRecord | undefined;
  projectId: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const previewMutation = useMutation({
    mutationFn: (file: File) => createFilePreview(projectId, file),
    onSuccess: (preview) => {
      void queryClient.invalidateQueries({
        queryKey: ["import-uploads", preview.project_id],
      });
      void navigate(
        `/import?project_id=${encodeURIComponent(preview.project_id)}&preview_id=${encodeURIComponent(preview.id)}`,
      );
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: ["import-uploads", projectId],
      });
    },
  });

  function selectFile(file: File | null) {
    previewMutation.reset();
    setValidationError(null);

    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!isAcceptedFile(file)) {
      setSelectedFile(null);
      setValidationError(
        t(
          "仅支持 .csv、.xlsx 或 .xlsm 文件",
          "Only .csv, .xlsx, or .xlsm files are supported",
        ),
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setSelectedFile(file);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (!previewMutation.isPending) setIsDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (!previewMutation.isPending) {
      selectFile(event.dataTransfer.files?.[0] ?? null);
    }
  }

  function clearFile() {
    setSelectedFile(null);
    setValidationError(null);
    previewMutation.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const errorMessage = validationError ?? previewMutation.error?.message;

  return (
    <section
      className={`local-upload-zone${isDragging ? " is-dragging" : ""}${selectedFile ? " is-ready" : ""}${previewMutation.isPending ? " is-uploading" : ""}`}
      data-testid="local-upload-dropzone"
      onDragEnter={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        id="local-source-file"
        className="sr-only"
        aria-label={t("选择本地数据文件", "Choose local data file")}
        accept=".csv,.xlsx,.xlsm"
        disabled={previewMutation.isPending}
        type="file"
        onChange={handleFileChange}
        onClick={(event) => {
          event.currentTarget.value = "";
        }}
      />
      <div className="upload-zone-art" aria-hidden="true">
        {previewMutation.isPending ? (
          <LoaderCircle className="spin" size={27} />
        ) : selectedFile ? (
          <FileCheck2 size={27} />
        ) : (
          <UploadCloud size={27} />
        )}
        <i />
      </div>
      <div className="upload-zone-copy" aria-live="polite">
        <span className="upload-zone-kicker">
          {isDragging
            ? t("松开即可加入", "Drop to add")
            : selectedFile
              ? t("文件已就绪", "File ready")
              : t("拖放或选择文件", "Drop or choose a file")}
        </span>
        <h2>
          {selectedFile
            ? selectedFile.name
            : t("导入 CSV 或 Excel", "Import CSV or Excel")}
        </h2>
        {selectedFile ? (
          <div className="selected-file-meta">
            <span>{fileExtensionLabel(selectedFile)}</span>
            <span>{formatBytes(selectedFile.size)}</span>
            <span>{t("原文件将保留", "Original will be retained")}</span>
          </div>
        ) : (
          <p>
            {t(
              "在这里选择文件并直接创建解析预览，随后确认字段类型，再生成正式数据集。",
              "Choose a file here to create a parse preview, confirm field types, and then materialize a dataset.",
            )}
          </p>
        )}
        {errorMessage ? (
          <div className="upload-dock-error" role="alert">
            <CircleX size={14} />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </div>
      <div className="upload-zone-actions">
        {selectedFile ? (
          <>
            <button
              className="analysis-button primary"
              disabled={previewMutation.isPending}
              onClick={() => previewMutation.mutate(selectedFile)}
              type="button"
            >
              {previewMutation.isPending ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <FileUp size={16} />
              )}
              {previewMutation.isPending
                ? t("正在解析", "Parsing")
                : t("解析并预览", "Parse and preview")}
            </button>
            <button
              className="analysis-button secondary"
              disabled={previewMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {t("更换文件", "Replace file")}
            </button>
            <button
              className="upload-clear-button"
              aria-label={t("清除已选文件", "Clear selected file")}
              disabled={previewMutation.isPending}
              onClick={clearFile}
              title={t("清除已选文件", "Clear selected file")}
              type="button"
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <>
            <button
              className="analysis-button primary"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <FileUp size={16} />
              {t("选择文件", "Choose file")}
            </button>
            {latestParsedUpload?.preview_id ? (
              <Link
                className="analysis-button secondary"
                to={`/import?project_id=${encodeURIComponent(projectId)}&preview_id=${encodeURIComponent(latestParsedUpload.preview_id)}`}
              >
                <FolderClock size={16} />
                {t("继续最近预览", "Continue latest preview")}
              </Link>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function SourceMetric({
  icon: Icon,
  label,
  tone,
  value,
}: {
  icon: typeof FileArchive;
  label: string;
  tone: "sky" | "mint" | "rose" | "lilac";
  value: number;
}) {
  const { formatNumber } = useI18n();
  return (
    <article className={`source-metric tone-${tone}`}>
      <div>
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{formatNumber(value)}</strong>
    </article>
  );
}

function UploadHistory({
  isLoading,
  projectId,
  uploads,
}: {
  isLoading: boolean;
  projectId: string;
  uploads: UploadRecord[];
}) {
  const { formatDate, formatNumber, t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<"all" | UploadStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const filteredUploads = useMemo(
    () =>
      uploads.filter((upload) => {
        const matchesStatus =
          statusFilter === "all" || upload.status === statusFilter;
        const matchesSearch =
          normalizedSearch.length === 0 ||
          upload.file_name.toLocaleLowerCase().includes(normalizedSearch) ||
          upload.file_type.toLocaleLowerCase().includes(normalizedSearch) ||
          upload.error_message?.toLocaleLowerCase().includes(normalizedSearch);
        return matchesStatus && Boolean(matchesSearch);
      }),
    [normalizedSearch, statusFilter, uploads],
  );
  const filters: Array<{
    count: number;
    label: string;
    value: "all" | UploadStatus;
  }> = [
    {
      count: uploads.length,
      label: t("全部", "All"),
      value: "all",
    },
    {
      count: uploads.filter((upload) => upload.status === "parsed").length,
      label: t("已解析", "Parsed"),
      value: "parsed",
    },
    {
      count: uploads.filter((upload) => upload.status === "failed").length,
      label: t("解析失败", "Failed"),
      value: "failed",
    },
    {
      count: uploads.filter((upload) => upload.status === "pending").length,
      label: t("处理中", "Pending"),
      value: "pending",
    },
  ];

  return (
    <section className="source-table-section">
      <div className="source-section-heading">
        <div>
          <p>IMPORT HISTORY</p>
          <h2>{t("上传与解析记录", "Upload and parse history")}</h2>
        </div>
        <span>
          {t(
            `${filteredUploads.length} / ${uploads.length} 条记录`,
            `${formatNumber(filteredUploads.length)} / ${formatNumber(uploads.length)} records`,
          )}
        </span>
      </div>
      {uploads.length ? (
        <div className="source-history-toolbar">
          <div
            className="source-history-filters"
            role="group"
            aria-label={t("按解析状态筛选", "Filter by parse status")}
          >
            <Filter size={14} aria-hidden="true" />
            {filters.map((filter) => (
              <button
                key={filter.value}
                aria-pressed={statusFilter === filter.value}
                className={statusFilter === filter.value ? "is-active" : ""}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
              >
                {filter.label}
                <span>{formatNumber(filter.count)}</span>
              </button>
            ))}
          </div>
          <label className="source-history-search">
            <Search size={14} aria-hidden="true" />
            <span className="sr-only">
              {t("搜索上传记录", "Search upload history")}
            </span>
            <input
              aria-label={t("搜索上传记录", "Search upload history")}
              placeholder={t("搜索文件名或格式", "Search file or format")}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            {searchTerm ? (
              <button
                aria-label={t("清除搜索", "Clear search")}
                onClick={() => setSearchTerm("")}
                type="button"
              >
                <X size={13} />
              </button>
            ) : null}
          </label>
        </div>
      ) : null}
      {isLoading ? (
        <SourceState
          title={t("正在读取上传历史", "Loading upload history")}
          detail={t(
            "正在检查原始文件与解析结果。",
            "Checking original files and parse results.",
          )}
          loading
        />
      ) : null}
      {!isLoading && uploads.length === 0 ? (
        <SourceState
          title={t("还没有上传记录", "No uploads yet")}
          detail={t(
            "从上方入口导入第一份业务数据。",
            "Import your first business data file above.",
          )}
        />
      ) : null}
      {!isLoading && uploads.length > 0 && filteredUploads.length === 0 ? (
        <SourceState
          title={t("没有匹配的导入记录", "No matching imports")}
          detail={t(
            "调整状态筛选或搜索关键词后重试。",
            "Try another status or search term.",
          )}
        />
      ) : null}
      {filteredUploads.length ? (
        <div className="source-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("文件", "File")}</th>
                <th>{t("格式", "Format")}</th>
                <th>{t("状态", "Status")}</th>
                <th>{t("解析行数", "Parsed rows")}</th>
                <th>{t("更新时间", "Updated")}</th>
                <th>{t("下一步", "Next step")}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUploads.map((upload) => (
                <tr key={upload.id}>
                  <td>
                    <div className="file-cell">
                      <FileSpreadsheet size={16} />
                      <div>
                        <strong>{upload.file_name}</strong>
                        <span>{formatBytes(upload.size_bytes)}</span>
                      </div>
                    </div>
                    {upload.error_message ? (
                      <p className="upload-error">{upload.error_message}</p>
                    ) : null}
                  </td>
                  <td>{upload.file_type.toUpperCase()}</td>
                  <td>
                    <UploadStatusChip status={upload.status} />
                  </td>
                  <td>
                    {upload.preview_row_count === null
                      ? "-"
                      : formatNumber(upload.preview_row_count)}
                  </td>
                  <td>
                    {formatDate(upload.updated_at, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td>
                    {upload.preview_id ? (
                      <Link
                        className="source-row-link"
                        to={`/import?project_id=${projectId}&preview_id=${upload.preview_id}`}
                      >
                        {t("打开预览", "Open preview")}
                        <ArrowRight size={14} />
                      </Link>
                    ) : (
                      <Link
                        className="source-row-link"
                        to={`/tasks?project_id=${projectId}`}
                      >
                        {t("查看任务", "View task")}
                        <ArrowRight size={14} />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function DatasetBridge({
  datasets,
  isLoading,
  projectId,
}: {
  datasets: Dataset[];
  isLoading: boolean;
  projectId: string;
}) {
  const { formatNumber, t } = useI18n();
  return (
    <section className="source-table-section dataset-bridge-section">
      <div className="source-section-heading">
        <div>
          <p>DATASET BRIDGE</p>
          <h2>{t("已生成的正式数据集", "Materialized datasets")}</h2>
        </div>
        <Link to={`/datasets?project_id=${projectId}`}>
          {t("全部数据集", "All datasets")}
          <ArrowRight size={14} />
        </Link>
      </div>
      {isLoading ? (
        <SourceState
          title={t("正在读取数据集", "Loading datasets")}
          detail={t(
            "正在连接已物化的数据表。",
            "Connecting to materialized data tables.",
          )}
          loading
        />
      ) : null}
      {!isLoading && datasets.length === 0 ? (
        <SourceState
          title={t("暂无正式数据集", "No datasets yet")}
          detail={t(
            "上传并确认字段后，正式数据集会出现在这里。",
            "Datasets will appear here after fields are confirmed.",
          )}
        />
      ) : null}
      {datasets.length ? (
        <div className="dataset-bridge-list">
          {datasets.slice(0, 6).map((dataset) => (
            <article key={dataset.id}>
              <span className="dataset-icon">
                <Table2 size={17} />
              </span>
              <div>
                <strong>{dataset.name}</strong>
                <small>
                  {formatNumber(dataset.row_count)} {t("行", "rows")} ·{" "}
                  {formatNumber(dataset.fields.length)} {t("字段", "fields")}
                </small>
              </div>
              <div className="dataset-bridge-actions">
                <Link
                  to={`/datasets?project_id=${projectId}&dataset_id=${dataset.id}`}
                >
                  {t("查看", "View")}
                </Link>
                <Link
                  to={`/analytics?project_id=${projectId}&dataset_id=${dataset.id}`}
                >
                  {t("分析", "Analyze")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function UploadStatusChip({ status }: { status: UploadStatus }) {
  const { t } = useI18n();
  const labels: Record<UploadStatus, string> = {
    failed: t("解析失败", "Parse failed"),
    parsed: t("已解析", "Parsed"),
    pending: t("待解析", "Pending"),
  };
  const icon =
    status === "parsed" ? (
      <CheckCircle2 size={13} />
    ) : status === "failed" ? (
      <CircleX size={13} />
    ) : (
      <Clock3 size={13} />
    );
  return (
    <span className={`upload-status status-${status}`}>
      {icon}
      {labels[status]}
    </span>
  );
}

function SourceState({
  detail,
  loading = false,
  title,
}: {
  detail: string;
  loading?: boolean;
  title: string;
}) {
  return (
    <div className="source-state">
      {loading ? (
        <RefreshCcw className="spin" size={20} />
      ) : (
        <HardDrive size={20} />
      )}
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </div>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const lowerName = file.name.toLocaleLowerCase();
  return ACCEPTED_FILE_EXTENSIONS.some((extension) =>
    lowerName.endsWith(extension),
  );
}

function fileExtensionLabel(file: File): string {
  return file.name.split(".").pop()?.toLocaleUpperCase() ?? "FILE";
}
