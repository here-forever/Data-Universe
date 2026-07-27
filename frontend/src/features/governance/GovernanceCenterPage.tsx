import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  Boxes,
  Clock3,
  GitBranch,
  Link2,
  Network,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { useCurrentUser } from "../auth/useCurrentUser";
import { useWorkspaceStore } from "../workspace/workspaceStore";
import { useI18n } from "../../i18n";
import {
  addProjectMember,
  archiveGovernedResource,
  getFocusedLineage,
  listGovernedResources,
  listOperationLogs,
  listProjectMembers,
  listProjects,
  removeProjectMember,
  restoreGovernedResource,
  updateProjectMember,
  type FocusedLineageResponse,
  type GovernedResource,
  type GovernedResourceListResponse,
  type GovernedResourceType,
  type LineageDirection,
  type ManagedProjectRole,
  type OperationLog,
  type ProjectMember,
  type ProjectRole,
  type ResourceStatus,
} from "./api";

type Translate = (zh: string, en: string) => string;
type GovernanceTab = "resources" | "lineage" | "activity" | "members";

const EMPTY_RESOURCE_RESPONSE: GovernedResourceListResponse = {
  items: [],
  summary: { total: 0, active: 0, archived: 0, with_dependents: 0 },
};

const RESOURCE_TYPES: GovernedResourceType[] = [
  "dataset",
  "data_view",
  "analysis_definition",
  "cleaning_recipe",
  "chart",
  "dashboard",
];

export function GovernanceCenterPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId);
  const setActiveProject = useWorkspaceStore((state) => state.setActiveProject);
  const initialProjectId =
    searchParams.get("project_id") ?? activeProjectId ?? "prj_demo";
  const [projectIdInput, setProjectIdInput] = useState(initialProjectId);
  const [projectId, setProjectId] = useState(initialProjectId);
  const [activeTab, setActiveTab] = useState<GovernanceTab>("resources");
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceType, setResourceType] = useState<
    GovernedResourceType | "all"
  >("all");
  const [resourceStatus, setResourceStatus] = useState<ResourceStatus | "all">(
    "all",
  );
  const [activitySearch, setActivitySearch] = useState("");
  const [focusResourceKey, setFocusResourceKey] = useState("");
  const [lineageDirection, setLineageDirection] =
    useState<LineageDirection>("both");
  const [feedback, setFeedback] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    staleTime: 30_000,
  });
  const resourcesQuery = useQuery({
    queryKey: ["governance", "resources", projectId],
    queryFn: () => listGovernedResources(projectId),
    enabled: Boolean(projectId),
  });
  const operationsQuery = useQuery({
    queryKey: ["governance", "operations", projectId],
    queryFn: () => listOperationLogs(projectId),
    enabled: Boolean(projectId),
  });
  const membersQuery = useQuery({
    queryKey: ["projects", projectId, "members"],
    queryFn: () => listProjectMembers(projectId),
    enabled: Boolean(projectId),
  });

  const resources = resourcesQuery.data ?? EMPTY_RESOURCE_RESPONSE;
  const selectedFocusResource = useMemo(() => {
    const selected = resources.items.find(
      (item) => resourceKey(item) === focusResourceKey,
    );
    return selected ?? resources.items[0] ?? null;
  }, [focusResourceKey, resources.items]);

  const lineageQuery = useQuery({
    queryKey: [
      "governance",
      "lineage",
      projectId,
      selectedFocusResource?.resource_type,
      selectedFocusResource?.resource_id,
      lineageDirection,
    ],
    queryFn: () =>
      getFocusedLineage(projectId, selectedFocusResource!, lineageDirection),
    enabled: Boolean(projectId && selectedFocusResource),
  });

  const filteredResources = useMemo(() => {
    const search = resourceSearch.trim().toLowerCase();
    return resources.items.filter(
      (item) =>
        (resourceType === "all" || item.resource_type === resourceType) &&
        (resourceStatus === "all" || item.status === resourceStatus) &&
        (!search ||
          item.name.toLowerCase().includes(search) ||
          item.resource_id.toLowerCase().includes(search)),
    );
  }, [resourceSearch, resourceStatus, resourceType, resources.items]);

  const filteredOperations = useMemo(() => {
    const search = activitySearch.trim().toLowerCase();
    return (operationsQuery.data?.items ?? []).filter(
      (item) =>
        !search ||
        item.action.toLowerCase().includes(search) ||
        item.resource_id?.toLowerCase().includes(search) ||
        item.actor_name?.toLowerCase().includes(search),
    );
  }, [activitySearch, operationsQuery.data?.items]);

  function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextProjectId = projectIdInput.trim();
    if (!nextProjectId) return;
    setProjectId(nextProjectId);
    setActiveProject(nextProjectId);
    setSearchParams({ project_id: nextProjectId });
    setFeedback(null);
  }

  async function refreshGovernance() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["governance", "resources", projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["governance", "operations", projectId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["projects", projectId, "members"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["governance", "lineage", projectId],
      }),
    ]);
  }

  return (
    <div className="governance-page">
      <section className="governance-hero">
        <div className="governance-hero-copy">
          <span className="governance-sticker">
            <Sparkles size={14} /> PHASE 5
          </span>
          <p className="eyebrow">GOVERNANCE & RECOVERY</p>
          <h1>{t("治理中心", "Governance center")}</h1>
          <p>
            {t(
              "集中查看重要资产、操作轨迹和上下游依赖，让归档可恢复、协作有边界、每份报表都有来路。",
              "Keep critical assets recoverable, collaboration bounded, and every report connected to its origin.",
            )}
          </p>
        </div>
        <form
          className="governance-project-picker"
          onSubmit={handleProjectSubmit}
        >
          <label htmlFor="governance-project">
            {t("治理项目", "Governed project")}
          </label>
          <div>
            <input
              id="governance-project"
              list="governance-project-options"
              onChange={(event) => setProjectIdInput(event.target.value)}
              value={projectIdInput}
            />
            <datalist id="governance-project-options">
              {(projectsQuery.data ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </datalist>
            <button type="submit">{t("载入", "Load")}</button>
            <button
              aria-label={t("刷新治理数据", "Refresh governance data")}
              className="governance-refresh"
              onClick={() => void refreshGovernance()}
              type="button"
            >
              <RefreshCw size={17} />
            </button>
          </div>
          <small>{projectId}</small>
        </form>
      </section>

      <GovernanceMetrics
        formatNumber={formatNumber}
        memberCount={membersQuery.data?.length ?? 0}
        summary={resources.summary}
        t={t}
      />

      {feedback ? (
        <div className="governance-feedback" role="status">
          <ShieldCheck size={17} />
          {feedback}
        </div>
      ) : null}

      <nav
        className="governance-tabs"
        aria-label={t("治理视图", "Governance views")}
      >
        <GovernanceTabButton
          activeTab={activeTab}
          icon={Boxes}
          id="resources"
          label={t("资源保险箱", "Resource vault")}
          onSelect={setActiveTab}
        />
        <GovernanceTabButton
          activeTab={activeTab}
          icon={Network}
          id="lineage"
          label={t("依赖关系", "Dependencies")}
          onSelect={setActiveTab}
        />
        <GovernanceTabButton
          activeTab={activeTab}
          icon={Clock3}
          id="activity"
          label={t("操作轨迹", "Activity")}
          onSelect={setActiveTab}
        />
        <GovernanceTabButton
          activeTab={activeTab}
          icon={UsersRound}
          id="members"
          label={t("成员协作", "Members")}
          onSelect={setActiveTab}
        />
      </nav>

      {activeTab === "resources" ? (
        <ResourceVault
          formatDate={formatDate}
          isLoading={resourcesQuery.isPending}
          items={filteredResources}
          onChanged={async (message) => {
            setFeedback(message);
            await refreshGovernance();
          }}
          projectId={projectId}
          resourceSearch={resourceSearch}
          resourceStatus={resourceStatus}
          resourceType={resourceType}
          setResourceSearch={setResourceSearch}
          setResourceStatus={setResourceStatus}
          setResourceType={setResourceType}
          t={t}
        />
      ) : null}

      {activeTab === "lineage" ? (
        <LineagePanel
          direction={lineageDirection}
          focusResource={selectedFocusResource}
          focusResourceKey={focusResourceKey}
          isLoading={lineageQuery.isPending}
          lineage={lineageQuery.data}
          resources={resources.items}
          setDirection={setLineageDirection}
          setFocusResourceKey={setFocusResourceKey}
          t={t}
        />
      ) : null}

      {activeTab === "activity" ? (
        <ActivityPanel
          activitySearch={activitySearch}
          formatDate={formatDate}
          isLoading={operationsQuery.isPending}
          items={filteredOperations}
          setActivitySearch={setActivitySearch}
          t={t}
          total={operationsQuery.data?.total ?? 0}
        />
      ) : null}

      {activeTab === "members" ? (
        <MembersPanel
          currentUserId={currentUser?.id ?? null}
          isLoading={membersQuery.isPending}
          items={membersQuery.data ?? []}
          onChanged={async (message) => {
            setFeedback(message);
            await refreshGovernance();
          }}
          projectId={projectId}
          t={t}
        />
      ) : null}
    </div>
  );
}

function GovernanceMetrics({
  formatNumber,
  memberCount,
  summary,
  t,
}: {
  formatNumber: (value: number) => string;
  memberCount: number;
  summary: GovernedResourceListResponse["summary"];
  t: Translate;
}) {
  const metrics = [
    {
      label: t("活跃资产", "Active assets"),
      value: summary.active,
      note: t("当前工作流可见", "Visible in workflows"),
      tone: "sky",
    },
    {
      label: t("已归档", "Archived"),
      value: summary.archived,
      note: t("可随时恢复", "Ready to restore"),
      tone: "rose",
    },
    {
      label: t("存在下游", "With dependents"),
      value: summary.with_dependents,
      note: t("归档前需知影响", "Review before archiving"),
      tone: "lilac",
    },
    {
      label: t("协作成员", "Collaborators"),
      value: memberCount,
      note: t("项目级角色边界", "Project role boundary"),
      tone: "mint",
    },
  ];

  return (
    <section
      className="governance-metrics"
      aria-label={t("治理摘要", "Governance summary")}
    >
      {metrics.map((metric) => (
        <article
          className={`governance-metric tone-${metric.tone}`}
          key={metric.label}
        >
          <span>{metric.label}</span>
          <strong>{formatNumber(metric.value)}</strong>
          <small>{metric.note}</small>
        </article>
      ))}
    </section>
  );
}

function GovernanceTabButton({
  activeTab,
  icon: Icon,
  id,
  label,
  onSelect,
}: {
  activeTab: GovernanceTab;
  icon: typeof Boxes;
  id: GovernanceTab;
  label: string;
  onSelect: (tab: GovernanceTab) => void;
}) {
  return (
    <button
      aria-pressed={activeTab === id}
      className={activeTab === id ? "is-active" : undefined}
      onClick={() => onSelect(id)}
      type="button"
    >
      <Icon size={17} />
      {label}
    </button>
  );
}

function ResourceVault({
  formatDate,
  isLoading,
  items,
  onChanged,
  projectId,
  resourceSearch,
  resourceStatus,
  resourceType,
  setResourceSearch,
  setResourceStatus,
  setResourceType,
  t,
}: {
  formatDate: (
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  isLoading: boolean;
  items: GovernedResource[];
  onChanged: (message: string) => Promise<void>;
  projectId: string;
  resourceSearch: string;
  resourceStatus: ResourceStatus | "all";
  resourceType: GovernedResourceType | "all";
  setResourceSearch: (value: string) => void;
  setResourceStatus: (value: ResourceStatus | "all") => void;
  setResourceType: (value: GovernedResourceType | "all") => void;
  t: Translate;
}) {
  const [pendingResource, setPendingResource] =
    useState<GovernedResource | null>(null);
  const queryClient = useQueryClient();
  const archiveMutation = useMutation({
    mutationFn: (resource: GovernedResource) =>
      archiveGovernedResource(projectId, resource),
    onSuccess: async (resource) => {
      setPendingResource(null);
      queryClient.setQueryData<GovernedResourceListResponse>(
        ["governance", "resources", projectId],
        (current) => replaceResource(current, resource),
      );
      await onChanged(
        t(
          "资源已安全归档，可随时恢复。",
          "Resource archived and ready to restore.",
        ),
      );
    },
  });
  const restoreMutation = useMutation({
    mutationFn: (resource: GovernedResource) =>
      restoreGovernedResource(projectId, resource),
    onSuccess: async (resource) => {
      setPendingResource(null);
      queryClient.setQueryData<GovernedResourceListResponse>(
        ["governance", "resources", projectId],
        (current) => replaceResource(current, resource),
      );
      await onChanged(
        t("资源已恢复到工作流。", "Resource restored to the workflow."),
      );
    },
  });
  const isMutating = archiveMutation.isPending || restoreMutation.isPending;

  function confirmResourceAction() {
    if (!pendingResource) return;
    if (pendingResource.status === "active") {
      archiveMutation.mutate(pendingResource);
    } else {
      restoreMutation.mutate(pendingResource);
    }
  }

  return (
    <section className="governance-panel resource-vault">
      <PanelHeader
        description={t(
          "六类核心分析资产采用可恢复归档，原始数据与物化表不会被静默删除。",
          "Six core asset types use recoverable archiving without silently deleting source data or materialized tables.",
        )}
        icon={ArchiveRestore}
        title={t("资源保险箱", "Resource vault")}
      />
      <div className="governance-filterbar">
        <label className="governance-search">
          <Search size={16} />
          <input
            aria-label={t("搜索治理资源", "Search governed resources")}
            onChange={(event) => setResourceSearch(event.target.value)}
            placeholder={t("搜索名称或资源 ID", "Search name or resource ID")}
            value={resourceSearch}
          />
        </label>
        <select
          aria-label={t("资源类型", "Resource type")}
          onChange={(event) =>
            setResourceType(event.target.value as GovernedResourceType | "all")
          }
          value={resourceType}
        >
          <option value="all">{t("全部类型", "All types")}</option>
          {RESOURCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {resourceTypeLabel(type, t)}
            </option>
          ))}
        </select>
        <select
          aria-label={t("归档状态", "Archive status")}
          onChange={(event) =>
            setResourceStatus(event.target.value as ResourceStatus | "all")
          }
          value={resourceStatus}
        >
          <option value="all">{t("全部状态", "All statuses")}</option>
          <option value="active">{t("活跃", "Active")}</option>
          <option value="archived">{t("已归档", "Archived")}</option>
        </select>
      </div>

      {isLoading ? (
        <LoadingState label={t("正在整理资源…", "Organizing resources…")} />
      ) : null}
      {!isLoading && items.length === 0 ? (
        <EmptyState
          description={t(
            "调整筛选条件或先创建分析资产。",
            "Adjust filters or create an analysis asset first.",
          )}
          title={t("暂无匹配资源", "No matching resources")}
        />
      ) : null}
      <div className="resource-vault-list">
        {items.map((item) => (
          <article className="governed-resource-row" key={resourceKey(item)}>
            <span className={`resource-type-icon type-${item.resource_type}`}>
              {resourceTypeIcon(item.resource_type)}
            </span>
            <div className="governed-resource-main">
              <div>
                <strong>{item.name}</strong>
                <StatusBadge status={item.status} t={t} />
              </div>
              <p>
                {resourceTypeLabel(item.resource_type, t)} · {item.resource_id}
              </p>
            </div>
            <div className="resource-dependency-count">
              <Link2 size={15} />
              <strong>{item.direct_dependency_count}</strong>
              <span>{t("个直接下游", "direct dependents")}</span>
            </div>
            <time dateTime={item.updated_at}>
              {formatDate(item.updated_at, { month: "short", day: "numeric" })}
            </time>
            <button
              className={
                item.status === "active" ? "archive-action" : "restore-action"
              }
              onClick={() => setPendingResource(item)}
              type="button"
            >
              {item.status === "active" ? (
                <Archive size={15} />
              ) : (
                <RotateCcw size={15} />
              )}
              {item.status === "active"
                ? t("归档", "Archive")
                : t("恢复", "Restore")}
            </button>
          </article>
        ))}
      </div>

      {pendingResource ? (
        <ConfirmationDialog
          confirmLabel={
            pendingResource.status === "active"
              ? t("确认归档", "Archive resource")
              : t("确认恢复", "Restore resource")
          }
          description={
            pendingResource.status === "active"
              ? t(
                  `归档后，“${pendingResource.name}”将从日常工作流隐藏，但数据和血缘记录会完整保留。`,
                  `“${pendingResource.name}” will be hidden from daily workflows while its data and lineage remain intact.`,
                )
              : t(
                  `“${pendingResource.name}”将重新出现在日常工作流。`,
                  `“${pendingResource.name}” will return to daily workflows.`,
                )
          }
          isPending={isMutating}
          onCancel={() => setPendingResource(null)}
          onConfirm={confirmResourceAction}
          title={
            pendingResource.status === "active"
              ? t("安全归档资源？", "Archive this resource?")
              : t("恢复资源？", "Restore this resource?")
          }
        />
      ) : null}
    </section>
  );
}

function LineagePanel({
  direction,
  focusResource,
  focusResourceKey,
  isLoading,
  lineage,
  resources,
  setDirection,
  setFocusResourceKey,
  t,
}: {
  direction: LineageDirection;
  focusResource: GovernedResource | null;
  focusResourceKey: string;
  isLoading: boolean;
  lineage: FocusedLineageResponse | undefined;
  resources: GovernedResource[];
  setDirection: (value: LineageDirection) => void;
  setFocusResourceKey: (value: string) => void;
  t: Translate;
}) {
  return (
    <section className="governance-panel lineage-panel">
      <PanelHeader
        description={t(
          "以一个资源为焦点查看四层上下游，回答“它从哪里来、影响哪些资产”。",
          "Trace four levels around one resource to understand its origin and downstream impact.",
        )}
        icon={Network}
        title={t("聚焦依赖关系", "Focused dependencies")}
      />
      <div className="lineage-controls">
        <label>
          {t("焦点资源", "Focus resource")}
          <select
            onChange={(event) => setFocusResourceKey(event.target.value)}
            value={
              focusResource ? resourceKey(focusResource) : focusResourceKey
            }
          >
            {resources.map((item) => (
              <option key={resourceKey(item)} value={resourceKey(item)}>
                {resourceTypeLabel(item.resource_type, t)} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("查看方向", "Direction")}
          <select
            onChange={(event) =>
              setDirection(event.target.value as LineageDirection)
            }
            value={direction}
          >
            <option value="both">{t("上下游", "Both")}</option>
            <option value="upstream">{t("仅上游", "Upstream")}</option>
            <option value="downstream">{t("仅下游", "Downstream")}</option>
          </select>
        </label>
      </div>
      {isLoading ? (
        <LoadingState label={t("正在梳理依赖…", "Tracing dependencies…")} />
      ) : null}
      {!isLoading && lineage && lineage.nodes.length === 1 ? (
        <EmptyState
          description={t(
            "该资源目前没有已记录的上下游关系。",
            "No recorded upstream or downstream relationships yet.",
          )}
          title={t("仅有焦点资源", "Focus resource only")}
        />
      ) : null}
      {lineage ? (
        <div className="lineage-workspace">
          <div className="lineage-node-grid">
            {lineage.nodes.map((node) => (
              <article
                className={
                  node.depth === 0 ? "lineage-node is-root" : "lineage-node"
                }
                key={`${node.resource_type}:${node.resource_id}`}
              >
                <span>
                  {node.depth === 0 ? t("焦点", "Focus") : `L${node.depth}`}
                </span>
                <strong>{node.label}</strong>
                <small>{resourceTypeLabel(node.resource_type, t)}</small>
                <StatusBadge status={node.status} t={t} />
              </article>
            ))}
          </div>
          <div className="lineage-edge-list">
            <h3>
              <GitBranch size={17} />
              {t("转换链路", "Transformation chain")}
            </h3>
            {lineage.edges.map((edge) => (
              <div className="lineage-edge" key={edge.id}>
                <span>{resourceTypeLabel(edge.source_type, t)}</span>
                <code>{shortId(edge.source_id)}</code>
                <ArrowRight size={16} />
                <strong>
                  {edge.transform_type?.replaceAll("_", " ") ??
                    t("直接引用", "direct reference")}
                </strong>
                <ArrowRight size={16} />
                <span>{resourceTypeLabel(edge.target_type, t)}</span>
                <code>{shortId(edge.target_id)}</code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ActivityPanel({
  activitySearch,
  formatDate,
  isLoading,
  items,
  setActivitySearch,
  t,
  total,
}: {
  activitySearch: string;
  formatDate: (
    value: string | number | Date,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  isLoading: boolean;
  items: OperationLog[];
  setActivitySearch: (value: string) => void;
  t: Translate;
  total: number;
}) {
  return (
    <section className="governance-panel activity-panel">
      <PanelHeader
        description={t(
          `当前项目保留 ${total} 条可查询操作记录，按最新时间展示。`,
          `${total} queryable project operations are retained, newest first.`,
        )}
        icon={Clock3}
        title={t("操作轨迹", "Activity trail")}
      />
      <label className="governance-search activity-search">
        <Search size={16} />
        <input
          aria-label={t("搜索操作轨迹", "Search activity trail")}
          onChange={(event) => setActivitySearch(event.target.value)}
          placeholder={t(
            "搜索动作、资源或操作者",
            "Search action, resource, or actor",
          )}
          value={activitySearch}
        />
      </label>
      {isLoading ? (
        <LoadingState label={t("正在读取日志…", "Loading activity…")} />
      ) : null}
      <div className="activity-timeline">
        {items.map((item) => (
          <article key={item.id}>
            <span className="activity-dot" />
            <div className="activity-copy">
              <div>
                <strong>{actionLabel(item.action, t)}</strong>
                <time dateTime={item.created_at}>
                  {formatDate(item.created_at, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <p>
                {item.actor_name ?? t("系统任务", "System task")} ·{" "}
                {item.resource_type ?? "-"} · {item.resource_id ?? "-"}
              </p>
              {item.detail ? <code>{compactDetail(item.detail)}</code> : null}
            </div>
          </article>
        ))}
      </div>
      {!isLoading && items.length === 0 ? (
        <EmptyState
          description={t(
            "调整搜索词查看其他操作。",
            "Adjust the search to find other operations.",
          )}
          title={t("暂无匹配操作", "No matching activity")}
        />
      ) : null}
    </section>
  );
}

function MembersPanel({
  currentUserId,
  isLoading,
  items,
  onChanged,
  projectId,
  t,
}: {
  currentUserId: string | null;
  isLoading: boolean;
  items: ProjectMember[];
  onChanged: (message: string) => Promise<void>;
  projectId: string;
  t: Translate;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ManagedProjectRole>("editor");
  const [pendingMember, setPendingMember] = useState<ProjectMember | null>(
    null,
  );
  const addMutation = useMutation({
    mutationFn: () => addProjectMember(projectId, email, role),
    onSuccess: async () => {
      setEmail("");
      await onChanged(t("成员已加入项目。", "Member added to the project."));
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({
      member,
      nextRole,
    }: {
      member: ProjectMember;
      nextRole: ManagedProjectRole;
    }) => updateProjectMember(projectId, member.user_id, nextRole),
    onSuccess: async () => {
      await onChanged(t("成员角色已更新。", "Member role updated."));
    },
  });
  const removeMutation = useMutation({
    mutationFn: (member: ProjectMember) =>
      removeProjectMember(projectId, member.user_id),
    onSuccess: async () => {
      setPendingMember(null);
      await onChanged(
        t("成员已安全移出项目。", "Member removed from the project."),
      );
    },
  });

  function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim()) addMutation.mutate();
  }

  return (
    <section className="governance-panel members-panel">
      <PanelHeader
        description={t(
          "所有者负责成员治理，编辑者可维护分析资产，查看者仅使用和导出已授权内容。",
          "Owners govern membership, editors maintain assets, and viewers consume authorized results.",
        )}
        icon={UsersRound}
        title={t("成员协作", "Project members")}
      />
      <form className="member-invite" onSubmit={handleInvite}>
        <label>
          {t("成员邮箱", "Member email")}
          <input
            onChange={(event) => setEmail(event.target.value)}
            placeholder="analyst@example.com"
            required
            type="email"
            value={email}
          />
        </label>
        <label>
          {t("初始角色", "Initial role")}
          <select
            onChange={(event) =>
              setRole(event.target.value as ManagedProjectRole)
            }
            value={role}
          >
            <option value="editor">{t("编辑者", "Editor")}</option>
            <option value="viewer">{t("查看者", "Viewer")}</option>
          </select>
        </label>
        <button disabled={addMutation.isPending} type="submit">
          <UserPlus size={16} />
          {addMutation.isPending
            ? t("正在邀请…", "Inviting…")
            : t("添加成员", "Add member")}
        </button>
      </form>
      {addMutation.isError ? (
        <p className="form-error" role="alert">
          {addMutation.error.message}
        </p>
      ) : null}
      {isLoading ? (
        <LoadingState label={t("正在读取成员…", "Loading members…")} />
      ) : null}
      <div className="member-grid">
        {items.map((member) => (
          <article key={member.user_id}>
            <span className="member-avatar">
              {member.display_name.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>
                {member.display_name}
                {member.user_id === currentUserId ? (
                  <small>{t("你", "You")}</small>
                ) : null}
              </strong>
              <p>{member.email}</p>
            </div>
            {member.role === "owner" ? (
              <RoleBadge role={member.role} t={t} />
            ) : (
              <select
                aria-label={t(
                  `调整 ${member.display_name} 的角色`,
                  `Change ${member.display_name}'s role`,
                )}
                disabled={updateMutation.isPending}
                onChange={(event) =>
                  updateMutation.mutate({
                    member,
                    nextRole: event.target.value as ManagedProjectRole,
                  })
                }
                value={member.role}
              >
                <option value="editor">{t("编辑者", "Editor")}</option>
                <option value="viewer">{t("查看者", "Viewer")}</option>
              </select>
            )}
            <button
              aria-label={t(
                `移除 ${member.display_name}`,
                `Remove ${member.display_name}`,
              )}
              className="member-remove"
              disabled={
                member.role === "owner" || member.user_id === currentUserId
              }
              onClick={() => setPendingMember(member)}
              type="button"
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>

      {pendingMember ? (
        <ConfirmationDialog
          confirmLabel={t("确认移除", "Remove member")}
          description={t(
            `“${pendingMember.display_name}”将失去当前项目的访问权限，历史操作记录仍会保留。`,
            `“${pendingMember.display_name}” will lose project access while historical activity remains retained.`,
          )}
          isPending={removeMutation.isPending}
          onCancel={() => setPendingMember(null)}
          onConfirm={() => removeMutation.mutate(pendingMember)}
          title={t("移出项目？", "Remove from project?")}
        />
      ) : null}
    </section>
  );
}

function PanelHeader({
  description,
  icon: Icon,
  title,
}: {
  description: string;
  icon: typeof Boxes;
  title: string;
}) {
  return (
    <header className="governance-panel-header">
      <span>
        <Icon size={19} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </header>
  );
}

function ConfirmationDialog({
  confirmLabel,
  description,
  isPending,
  onCancel,
  onConfirm,
  title,
}: {
  confirmLabel: string;
  description: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
}) {
  return (
    <div className="governance-dialog-backdrop" role="presentation">
      <div
        aria-labelledby="governance-dialog-title"
        aria-modal="true"
        className="governance-dialog"
        role="dialog"
      >
        <span>
          <ShieldCheck size={21} />
        </span>
        <h3 id="governance-dialog-title">{title}</h3>
        <p>{description}</p>
        <div>
          <button disabled={isPending} onClick={onCancel} type="button">
            取消 / Cancel
          </button>
          <button
            className="is-primary"
            disabled={isPending}
            onClick={onConfirm}
            type="button"
          >
            {isPending ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="governance-loading" role="status">
      <RefreshCw className="spin" size={17} />
      {label}
    </div>
  );
}

function EmptyState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="governance-empty">
      <span>
        <Boxes size={22} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

function StatusBadge({ status, t }: { status: string; t: Translate }) {
  const label =
    status === "active"
      ? t("活跃", "Active")
      : status === "archived"
        ? t("已归档", "Archived")
        : t("引用", "Reference");
  return <span className={`governance-status status-${status}`}>{label}</span>;
}

function RoleBadge({ role, t }: { role: ProjectRole; t: Translate }) {
  const label =
    role === "owner"
      ? t("所有者", "Owner")
      : role === "editor"
        ? t("编辑者", "Editor")
        : t("查看者", "Viewer");
  return <span className={`member-role role-${role}`}>{label}</span>;
}

function replaceResource(
  current: GovernedResourceListResponse | undefined,
  resource: GovernedResource,
): GovernedResourceListResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    items: current.items.map((item) =>
      resourceKey(item) === resourceKey(resource) ? resource : item,
    ),
  };
}

function resourceKey(resource: GovernedResource): string {
  return `${resource.resource_type}:${resource.resource_id}`;
}

function shortId(resourceId: string): string {
  return resourceId.length > 18
    ? `${resourceId.slice(0, 8)}…${resourceId.slice(-6)}`
    : resourceId;
}

function resourceTypeLabel(resourceType: string, t: Translate): string {
  const labels: Record<string, [string, string]> = {
    uploaded_file: ["原始文件", "Source file"],
    file_import_preview: ["导入预览", "Import preview"],
    dataset: ["数据集", "Dataset"],
    data_view: ["数据视图", "Data view"],
    analysis_definition: ["分析定义", "Analysis"],
    cleaning_recipe: ["清洗配方", "Cleaning recipe"],
    sql_query: ["SQL 查询", "SQL query"],
    chart: ["图表", "Chart"],
    dashboard: ["报表", "Dashboard"],
    report_export: ["导出文件", "Report export"],
  };
  const label = labels[resourceType];
  return label ? t(label[0], label[1]) : resourceType.replaceAll("_", " ");
}

function resourceTypeIcon(resourceType: GovernedResourceType) {
  if (resourceType === "dashboard") return <ShieldCheck size={17} />;
  if (resourceType === "chart") return <GitBranch size={17} />;
  if (resourceType === "dataset" || resourceType === "data_view")
    return <Boxes size={17} />;
  return <Sparkles size={17} />;
}

function actionLabel(action: string, t: Translate): string {
  const labels: Record<string, [string, string]> = {
    "resource.archived": ["资源已归档", "Resource archived"],
    "resource.restored": ["资源已恢复", "Resource restored"],
    "project.created": ["项目已创建", "Project created"],
    "project.member_added": ["成员已添加", "Member added"],
    "project.member_role_updated": ["成员角色已更新", "Member role updated"],
    "project.member_removed": ["成员已移除", "Member removed"],
    "report.exported": ["报表已导出", "Report exported"],
  };
  const label = labels[action];
  return label
    ? t(label[0], label[1])
    : action.replaceAll("_", " ").replaceAll(".", " · ");
}

function compactDetail(detail: Record<string, unknown>): string {
  const entries = Object.entries(detail).slice(0, 3);
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ");
}
