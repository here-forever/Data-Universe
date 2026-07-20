import { apiClient } from "../../lib/apiClient";
import type { DatasetField } from "../datasets/api";

export interface DataView {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_id: string | null;
  source_sql: string | null;
  physical_table_name: string;
  row_count: number;
  fields: DatasetField[];
}

export interface DataViewListResponse {
  items: DataView[];
}

export interface DataViewPreviewResponse {
  data_view: DataView;
  page: number;
  page_size: number;
  total_rows: number;
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface ChartDefinition {
  id: string;
  project_id: string;
  data_view_id: string;
  name: string;
  chart_type: string;
  config: Record<string, unknown>;
}

export interface ChartListResponse {
  items: ChartDefinition[];
}

export interface ChartCreatePayload {
  project_id: string;
  data_view_id: string;
  name: string;
  chart_type: string;
  config: Record<string, unknown>;
}

export interface DashboardDefinition {
  id: string;
  project_id: string;
  name: string;
  layout: Record<string, unknown>;
}

export interface DashboardListResponse {
  items: DashboardDefinition[];
}

export interface DashboardCreatePayload {
  project_id: string;
  name: string;
  layout: Record<string, unknown>;
}

export async function listDataViews(
  projectId: string,
): Promise<DataViewListResponse> {
  return apiClient.get<DataViewListResponse>("/data-views", {
    project_id: projectId,
  });
}

export async function getDataViewPreview(
  dataViewId: string,
  page: number,
  pageSize: number,
): Promise<DataViewPreviewResponse> {
  return apiClient.get<DataViewPreviewResponse>(
    `/data-views/${dataViewId}/preview`,
    {
      page,
      page_size: pageSize,
    },
  );
}

export async function listCharts(
  projectId: string,
): Promise<ChartListResponse> {
  return apiClient.get<ChartListResponse>("/charts", { project_id: projectId });
}

export async function createChart(
  payload: ChartCreatePayload,
): Promise<ChartDefinition> {
  return apiClient.post<ChartDefinition>("/charts", payload);
}

export async function listDashboards(
  projectId: string,
): Promise<DashboardListResponse> {
  return apiClient.get<DashboardListResponse>("/dashboards", {
    project_id: projectId,
  });
}

export async function createDashboard(
  payload: DashboardCreatePayload,
): Promise<DashboardDefinition> {
  return apiClient.post<DashboardDefinition>("/dashboards", payload);
}
