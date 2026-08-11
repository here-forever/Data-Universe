import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
} from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "../../app/ConfirmDialog";
import { RecoverableError } from "../../app/RecoverableError";
import { useI18n } from "../../i18n";
import { queryKeys, vibeApi } from "../../lib/vibeApi";
import "../../styles/data.css";
import { useCollaboration } from "../collaboration/collaborationState";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { CleaningPanel } from "./CleaningPanel";
import { PreviewTable } from "./PreviewTable";
import { ProfileView } from "./ProfileView";
import { QualityInspector } from "./QualityInspector";
import { UploadDialog } from "./UploadDialog";

type DataTab = "preview" | "profile" | "clean";
const PREVIEW_PAGE_SIZE = 200;

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
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

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
    queryFn: () => vibeApi.getRows(activeDatasetId!, offset, PREVIEW_PAGE_SIZE),
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
      setDeleteTarget(null);
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
                removeDataset.reset();
                setDeleteTarget({
                  id: activeDatasetId,
                  name: detail.data?.name ?? t("data.currentDataset"),
                });
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
            <RecoverableError
              isRetrying={detail.isFetching}
              message={detail.error.message}
              onRetry={() => void detail.refetch()}
            />
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
                      offset: offset + PREVIEW_PAGE_SIZE,
                    })
                  }
                  onPrevious={() =>
                    setPagination({
                      datasetId: activeDatasetId,
                      offset: Math.max(0, offset - PREVIEW_PAGE_SIZE),
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
      {deleteTarget ? (
        <ConfirmDialog
          cancelLabel={t("common.cancel")}
          confirmLabel={t("data.deleteCurrent")}
          description={t("data.deleteConfirm", { name: deleteTarget.name })}
          error={
            removeDataset.isError ? removeDataset.error.message : undefined
          }
          eyebrow={t("common.destructiveAction")}
          isPending={removeDataset.isPending}
          onCancel={() => {
            if (removeDataset.isPending) return;
            removeDataset.reset();
            setDeleteTarget(null);
          }}
          onConfirm={() => removeDataset.mutate(deleteTarget.id)}
          pendingLabel={t("common.deleting")}
          title={t("data.deleteTitle")}
        />
      ) : null}
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
