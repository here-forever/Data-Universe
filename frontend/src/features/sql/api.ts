import { apiClient } from "../../lib/apiClient";
import type { DataView } from "../dataViews/api";
import type { DatasetField } from "../datasets/api";

export interface SqlDatasetReference {
  id: string;
  name: string;
  table_alias: string;
  row_count: number;
  fields: DatasetField[];
}

export interface SqlMetadata {
  project_id: string;
  datasets: SqlDatasetReference[];
}

export interface SqlRunPayload {
  project_id: string;
  sql: string;
  limit: number;
}

export interface SqlRunResult {
  project_id: string;
  executed_sql: string;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
  row_count: number;
  limit: number;
}

export interface SqlSaveDataViewPayload {
  project_id: string;
  sql: string;
  name: string;
  description?: string | null;
  limit: number;
}

export async function getSqlMetadata(projectId: string): Promise<SqlMetadata> {
  return apiClient.get<SqlMetadata>("/sql/metadata", { project_id: projectId });
}

export async function runSql(payload: SqlRunPayload): Promise<SqlRunResult> {
  return apiClient.post<SqlRunResult>("/sql/run", payload);
}

export async function saveSqlDataView(
  payload: SqlSaveDataViewPayload,
): Promise<DataView> {
  return apiClient.post<DataView>("/sql/save-data-view", payload);
}
