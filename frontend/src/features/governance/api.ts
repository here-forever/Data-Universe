import { apiClient } from "../../lib/apiClient";

export type GovernedResourceType =
  | "dataset"
  | "data_view"
  | "analysis_definition"
  | "cleaning_recipe"
  | "chart"
  | "dashboard";
export type ResourceStatus = "active" | "archived";
export type ProjectRole = "owner" | "editor" | "viewer";
export type ManagedProjectRole = "editor" | "viewer";
export type LineageDirection = "upstream" | "downstream" | "both";

export interface ProjectDefinition {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  role: ProjectRole;
}

export interface ProjectMember {
  user_id: string;
  email: string;
  display_name: string;
  role: ProjectRole;
}

export interface GovernedResource {
  resource_type: GovernedResourceType;
  resource_id: string;
  project_id: string;
  name: string;
  status: ResourceStatus;
  archived_at: string | null;
  archived_by_id: string | null;
  created_at: string;
  updated_at: string;
  direct_dependency_count: number;
}

export interface GovernedResourceListResponse {
  items: GovernedResource[];
  summary: {
    total: number;
    active: number;
    archived: number;
    with_dependents: number;
  };
}

export interface OperationLog {
  id: string;
  project_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}

export interface OperationLogListResponse {
  items: OperationLog[];
  total: number;
}

export interface LineageNode {
  resource_type: string;
  resource_id: string;
  label: string;
  status: ResourceStatus | "reference";
  depth: number;
}

export interface LineageEdge {
  id: string;
  source_type: string;
  source_id: string;
  target_type: string;
  target_id: string;
  transform_type: string | null;
  transform_id: string | null;
  created_at: string;
}

export interface FocusedLineageResponse {
  root: LineageNode;
  nodes: LineageNode[];
  edges: LineageEdge[];
  direction: LineageDirection;
  max_depth: number;
}

export function listProjects(): Promise<ProjectDefinition[]> {
  return apiClient.get<ProjectDefinition[]>("/projects");
}

export function listProjectMembers(
  projectId: string,
): Promise<ProjectMember[]> {
  return apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
}

export function addProjectMember(
  projectId: string,
  email: string,
  role: ManagedProjectRole,
): Promise<ProjectMember> {
  return apiClient.post<ProjectMember>(`/projects/${projectId}/members`, {
    email,
    role,
  });
}

export function updateProjectMember(
  projectId: string,
  userId: string,
  role: ManagedProjectRole,
): Promise<ProjectMember> {
  return apiClient.patch<ProjectMember>(
    `/projects/${projectId}/members/${userId}`,
    { role },
  );
}

export function removeProjectMember(
  projectId: string,
  userId: string,
): Promise<{ user_id: string; removed: boolean }> {
  return apiClient.delete<{ user_id: string; removed: boolean }>(
    `/projects/${projectId}/members/${userId}`,
  );
}

export function listGovernedResources(
  projectId: string,
): Promise<GovernedResourceListResponse> {
  return apiClient.get<GovernedResourceListResponse>("/governance/resources", {
    project_id: projectId,
  });
}

export function archiveGovernedResource(
  projectId: string,
  resource: GovernedResource,
): Promise<GovernedResource> {
  return apiClient.post<GovernedResource>(
    `/governance/resources/${resource.resource_type}/${resource.resource_id}/archive?project_id=${encodeURIComponent(projectId)}`,
  );
}

export function restoreGovernedResource(
  projectId: string,
  resource: GovernedResource,
): Promise<GovernedResource> {
  return apiClient.post<GovernedResource>(
    `/governance/resources/${resource.resource_type}/${resource.resource_id}/restore?project_id=${encodeURIComponent(projectId)}`,
  );
}

export function listOperationLogs(
  projectId: string,
): Promise<OperationLogListResponse> {
  return apiClient.get<OperationLogListResponse>("/governance/operations", {
    project_id: projectId,
    limit: 100,
  });
}

export function getFocusedLineage(
  projectId: string,
  resource: GovernedResource,
  direction: LineageDirection,
): Promise<FocusedLineageResponse> {
  return apiClient.get<FocusedLineageResponse>("/governance/lineage", {
    project_id: projectId,
    resource_type: resource.resource_type,
    resource_id: resource.resource_id,
    direction,
    max_depth: 4,
  });
}
