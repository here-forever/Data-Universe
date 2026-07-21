import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Database,
  FileArchive,
  FileSpreadsheet,
  FileUp,
  FolderClock,
  HardDrive,
  RefreshCcw,
  Search,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useI18n } from "../../i18n";
import { listDatasets, type Dataset } from "../datasets/api";
import {
  listUploads,
  type UploadRecord,
  type UploadStatus,
} from "../imports/api";

const DEFAULT_PROJECT_ID = "prj_demo";

export function DataSourcesPage() {
  const { t } = useI18n();
  const [projectId, setProjectId] = useState(DEFAULT_PROJECT_ID);
  const [submittedProjectId, setSubmittedProjectId] =
    useState(DEFAULT_PROJECT_ID);
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
                <small>.xlsx / .xls</small>
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
          <section className="local-upload-zone">
            <div className="upload-zone-art">
              <FileUp size={27} />
              <i />
            </div>
            <div>
              <h2>{t("导入 CSV 或 Excel", "Import CSV or Excel")}</h2>
              <p>
                {t(
                  "上传后先确认字段类型与样例数据，再生成可用于清洗、分析和报表的正式数据集。",
                  "Confirm field types and sample data before creating a dataset for cleaning, analysis, and reporting.",
                )}
              </p>
            </div>
            <div className="upload-zone-actions">
              <Link
                className="analysis-button primary"
                to={`/import?project_id=${submittedProjectId}`}
              >
                <FileUp size={16} />
                {t("上传文件", "Upload file")}
              </Link>
              {latestParsedUpload ? (
                <Link
                  className="analysis-button secondary"
                  to={`/import?project_id=${submittedProjectId}&preview_id=${latestParsedUpload.preview_id}`}
                >
                  <FolderClock size={16} />
                  {t("继续最近预览", "Continue latest preview")}
                </Link>
              ) : null}
            </div>
          </section>

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
  return (
    <section className="source-table-section">
      <div className="source-section-heading">
        <div>
          <p>IMPORT HISTORY</p>
          <h2>{t("上传与解析记录", "Upload and parse history")}</h2>
        </div>
        <span>
          {t(
            `${uploads.length} 条记录`,
            `${formatNumber(uploads.length)} records`,
          )}
        </span>
      </div>
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
      {uploads.length ? (
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
              {uploads.map((upload) => (
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
  return (
    <span className={`upload-status status-${status}`}>
      {status === "parsed" ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}
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
