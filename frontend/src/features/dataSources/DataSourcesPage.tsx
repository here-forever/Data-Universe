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

import { listDatasets, type Dataset } from "../datasets/api";
import {
  listUploads,
  type UploadRecord,
  type UploadStatus,
} from "../imports/api";

const DEFAULT_PROJECT_ID = "prj_demo";

export function DataSourcesPage() {
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
          <h1 id="local-source-title">本地数据源</h1>
          <span>
            统一接入 CSV 与 Excel，保留原始文件、解析预览和完整导入记录。
          </span>
        </div>
        <form onSubmit={submitProject}>
          <label className="sr-only" htmlFor="data-source-project-id">
            项目 ID
          </label>
          <Search size={15} aria-hidden="true" />
          <input
            id="data-source-project-id"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder="项目 ID"
          />
          <button
            aria-label="刷新数据源"
            disabled={!projectId.trim()}
            type="submit"
          >
            <RefreshCcw size={15} />
          </button>
        </form>
      </header>

      <section className="local-source-metrics" aria-label="数据源摘要">
        <SourceMetric
          icon={FileArchive}
          label="原始文件"
          tone="sky"
          value={uploads.length}
        />
        <SourceMetric
          icon={CheckCircle2}
          label="解析成功"
          tone="mint"
          value={parsedCount}
        />
        <SourceMetric
          icon={AlertTriangle}
          label="失败记录"
          tone="rose"
          value={failedCount}
        />
        <SourceMetric
          icon={Database}
          label="正式数据集"
          tone="lilac"
          value={datasets.length}
        />
      </section>

      <div className="local-source-layout">
        <aside className="local-source-rail">
          <div className="source-rail-heading">
            <HardDrive size={18} />
            <div>
              <strong>文件接入</strong>
              <span>当前阶段唯一数据源</span>
            </div>
          </div>
          <div className="file-format-list">
            <div>
              <span className="format-icon csv">CSV</span>
              <div>
                <strong>CSV 文件</strong>
                <small>UTF-8 / 常用分隔符</small>
              </div>
              <CheckCircle2 size={15} />
            </div>
            <div>
              <span className="format-icon xls">XLS</span>
              <div>
                <strong>Excel 工作簿</strong>
                <small>.xlsx / .xls</small>
              </div>
              <CheckCircle2 size={15} />
            </div>
          </div>
          <div className="source-policy">
            <ShieldCheck size={17} />
            <div>
              <strong>可追溯导入</strong>
              <span>原文件不会被正式数据集覆盖，失败解析也会保留记录。</span>
            </div>
          </div>
          <div className="source-flow-mini" aria-label="本地数据流程">
            <span>文件</span>
            <ArrowRight size={13} />
            <span>预览</span>
            <ArrowRight size={13} />
            <span>数据集</span>
          </div>
        </aside>

        <main className="local-source-main">
          <section className="local-upload-zone">
            <div className="upload-zone-art">
              <FileUp size={27} />
              <i />
            </div>
            <div>
              <h2>导入 CSV 或 Excel</h2>
              <p>
                上传后先确认字段类型与样例数据，再生成可用于清洗、分析和报表的正式数据集。
              </p>
            </div>
            <div className="upload-zone-actions">
              <Link
                className="analysis-button primary"
                to={`/import?project_id=${submittedProjectId}`}
              >
                <FileUp size={16} />
                上传文件
              </Link>
              {latestParsedUpload ? (
                <Link
                  className="analysis-button secondary"
                  to={`/import?project_id=${submittedProjectId}&preview_id=${latestParsedUpload.preview_id}`}
                >
                  <FolderClock size={16} />
                  继续最近预览
                </Link>
              ) : null}
            </div>
          </section>

          {uploadsQuery.error || datasetsQuery.error ? (
            <SourceState
              title="无法读取本地数据源"
              detail={String(
                (uploadsQuery.error ?? datasetsQuery.error) instanceof Error
                  ? (uploadsQuery.error ?? datasetsQuery.error)?.message
                  : "请检查后端服务。 ",
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
  return (
    <article className={`source-metric tone-${tone}`}>
      <div>
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <strong>{value.toLocaleString("zh-CN")}</strong>
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
  return (
    <section className="source-table-section">
      <div className="source-section-heading">
        <div>
          <p>IMPORT HISTORY</p>
          <h2>上传与解析记录</h2>
        </div>
        <span>{uploads.length} 条记录</span>
      </div>
      {isLoading ? (
        <SourceState
          title="正在读取上传历史"
          detail="正在检查原始文件与解析结果。"
          loading
        />
      ) : null}
      {!isLoading && uploads.length === 0 ? (
        <SourceState
          title="还没有上传记录"
          detail="从上方入口导入第一份业务数据。"
        />
      ) : null}
      {uploads.length ? (
        <div className="source-table-wrap">
          <table>
            <thead>
              <tr>
                <th>文件</th>
                <th>格式</th>
                <th>状态</th>
                <th>解析行数</th>
                <th>更新时间</th>
                <th>下一步</th>
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
                    {upload.preview_row_count?.toLocaleString("zh-CN") ?? "-"}
                  </td>
                  <td>{formatDate(upload.updated_at)}</td>
                  <td>
                    {upload.preview_id ? (
                      <Link
                        className="source-row-link"
                        to={`/import?project_id=${projectId}&preview_id=${upload.preview_id}`}
                      >
                        打开预览
                        <ArrowRight size={14} />
                      </Link>
                    ) : (
                      <Link
                        className="source-row-link"
                        to={`/tasks?project_id=${projectId}`}
                      >
                        查看任务
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
  return (
    <section className="source-table-section dataset-bridge-section">
      <div className="source-section-heading">
        <div>
          <p>DATASET BRIDGE</p>
          <h2>已生成的正式数据集</h2>
        </div>
        <Link to={`/datasets?project_id=${projectId}`}>
          全部数据集
          <ArrowRight size={14} />
        </Link>
      </div>
      {isLoading ? (
        <SourceState
          title="正在读取数据集"
          detail="正在连接已物化的数据表。"
          loading
        />
      ) : null}
      {!isLoading && datasets.length === 0 ? (
        <SourceState
          title="暂无正式数据集"
          detail="上传并确认字段后，正式数据集会出现在这里。"
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
                  {dataset.row_count.toLocaleString("zh-CN")} 行 ·{" "}
                  {dataset.fields.length} 字段
                </small>
              </div>
              <div className="dataset-bridge-actions">
                <Link
                  to={`/datasets?project_id=${projectId}&dataset_id=${dataset.id}`}
                >
                  查看
                </Link>
                <Link
                  to={`/analytics?project_id=${projectId}&dataset_id=${dataset.id}`}
                >
                  分析
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
  const labels: Record<UploadStatus, string> = {
    failed: "解析失败",
    parsed: "已解析",
    pending: "待解析",
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
