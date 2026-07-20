import { apiClient } from "../../lib/apiClient";
import type { Dataset } from "../datasets/api";
import type { TaskItem } from "../tasks/api";

export type DatabaseType = "postgresql" | "mysql";
export type ExternalConnectionStatus = "untested" | "available" | "failed";
export type FieldType =
  "integer" | "decimal" | "date" | "datetime" | "boolean" | "text";

export interface ExternalDatabaseConnection {
  id: string;
  project_id: string;
  name: string;
  database_type: DatabaseType;
  host: string;
  port: number;
  database_name: string;
  username: string;
  read_only: boolean;
  status: ExternalConnectionStatus;
  last_error: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalDatabaseConnectionCreatePayload {
  project_id: string;
  name: string;
  database_type: DatabaseType;
  host: string;
  port?: number;
  database_name: string;
  username: string;
  password: string;
  read_only: boolean;
}

export interface ExternalDatabaseConnectionListResponse {
  items: ExternalDatabaseConnection[];
}

export interface ExternalDatabaseConnectionUpdatePayload {
  project_id: string;
  name: string;
  database_type: DatabaseType;
  host: string;
  port: number;
  database_name: string;
  username: string;
  password?: string;
  read_only: boolean;
}

export interface ExternalDatabaseConnectionTestResponse {
  connection: ExternalDatabaseConnection;
  ok: boolean;
  message: string;
}

export interface ExternalTableColumn {
  name: string;
  data_type: string;
  inferred_type: FieldType;
  nullable: boolean;
  order: number;
}

export interface ExternalTable {
  schema_name: string;
  table_name: string;
  columns: ExternalTableColumn[];
}

export interface ExternalDatabaseSchemaResponse {
  connection: ExternalDatabaseConnection;
  tables: ExternalTable[];
}

export interface ImportFieldPreview {
  name: string;
  inferred_type: FieldType;
  nullable: boolean;
  order: number;
}

export interface ExternalTablePreviewPayload {
  project_id: string;
  schema_name: string;
  table_name: string;
  limit: number;
}

export interface ExternalSqlPreviewPayload {
  project_id: string;
  sql: string;
  limit: number;
}

export interface ExternalImportPreviewResponse {
  source_type: "external_table" | "external_sql";
  fields: ImportFieldPreview[];
  sample_rows: Record<string, unknown>[];
  row_count: number;
  limit: number;
}

export interface ExternalTableImportPayload {
  project_id: string;
  dataset_name: string;
  schema_name: string;
  table_name: string;
  limit: number;
  fields?: ImportFieldPreview[];
}

export interface ExternalSqlImportPayload {
  project_id: string;
  dataset_name: string;
  sql: string;
  limit: number;
  fields?: ImportFieldPreview[];
}

export interface ExternalDatasetImportResponse {
  dataset: Dataset;
  source_type: "external_table" | "external_sql";
  row_count: number;
}

export interface ExternalImportHistoryItem {
  task: TaskItem;
  source_type: "external_table" | "external_sql";
  connection_id: string | null;
  dataset_name: string | null;
  schema_name: string | null;
  table_name: string | null;
  sql: string | null;
  limit: number | null;
  field_count: number | null;
}

export interface ExternalImportHistoryResponse {
  items: ExternalImportHistoryItem[];
}

export interface ExternalImportDetailResponse {
  item: ExternalImportHistoryItem;
  fields: ImportFieldPreview[];
}

export async function createExternalDatabaseConnection(
  payload: ExternalDatabaseConnectionCreatePayload,
): Promise<ExternalDatabaseConnection> {
  return apiClient.post<ExternalDatabaseConnection>(
    "/data-sources/external-databases",
    payload,
  );
}

export async function listExternalDatabaseConnections(
  projectId: string,
  includeArchived = false,
): Promise<ExternalDatabaseConnectionListResponse> {
  return apiClient.get<ExternalDatabaseConnectionListResponse>(
    "/data-sources/external-databases",
    {
      project_id: projectId,
      include_archived: includeArchived,
    },
  );
}

export async function updateExternalDatabaseConnection(
  connectionId: string,
  payload: ExternalDatabaseConnectionUpdatePayload,
): Promise<ExternalDatabaseConnection> {
  return apiClient.patch<ExternalDatabaseConnection>(
    `/data-sources/external-databases/${connectionId}`,
    payload,
  );
}

export async function archiveExternalDatabaseConnection(
  connectionId: string,
  projectId: string,
): Promise<ExternalDatabaseConnection> {
  return apiClient.post<ExternalDatabaseConnection>(
    `/data-sources/external-databases/${connectionId}/archive`,
    { project_id: projectId },
  );
}

export async function restoreExternalDatabaseConnection(
  connectionId: string,
  projectId: string,
): Promise<ExternalDatabaseConnection> {
  return apiClient.post<ExternalDatabaseConnection>(
    `/data-sources/external-databases/${connectionId}/restore`,
    { project_id: projectId },
  );
}

export async function testExternalDatabaseConnection(
  connectionId: string,
): Promise<ExternalDatabaseConnectionTestResponse> {
  return apiClient.post<ExternalDatabaseConnectionTestResponse>(
    `/data-sources/external-databases/${connectionId}/test`,
  );
}

export async function inspectExternalDatabaseSchema(
  connectionId: string,
): Promise<ExternalDatabaseSchemaResponse> {
  return apiClient.get<ExternalDatabaseSchemaResponse>(
    `/data-sources/external-databases/${connectionId}/schema`,
  );
}

export async function listExternalImportHistory(
  projectId: string,
): Promise<ExternalImportHistoryResponse> {
  return apiClient.get<ExternalImportHistoryResponse>(
    "/data-sources/external-imports",
    {
      project_id: projectId,
    },
  );
}

export async function getExternalImportDetail(
  taskId: string,
): Promise<ExternalImportDetailResponse> {
  return apiClient.get<ExternalImportDetailResponse>(
    `/data-sources/external-imports/${taskId}`,
  );
}

export async function previewExternalTable(
  connectionId: string,
  payload: ExternalTablePreviewPayload,
): Promise<ExternalImportPreviewResponse> {
  return apiClient.post<ExternalImportPreviewResponse>(
    `/data-sources/external-databases/${connectionId}/preview-table`,
    payload,
  );
}

export async function previewExternalSql(
  connectionId: string,
  payload: ExternalSqlPreviewPayload,
): Promise<ExternalImportPreviewResponse> {
  return apiClient.post<ExternalImportPreviewResponse>(
    `/data-sources/external-databases/${connectionId}/preview-sql`,
    payload,
  );
}

export async function importExternalTable(
  connectionId: string,
  payload: ExternalTableImportPayload,
): Promise<ExternalDatasetImportResponse> {
  return apiClient.post<ExternalDatasetImportResponse>(
    `/data-sources/external-databases/${connectionId}/import-table`,
    payload,
  );
}

export async function importExternalSql(
  connectionId: string,
  payload: ExternalSqlImportPayload,
): Promise<ExternalDatasetImportResponse> {
  return apiClient.post<ExternalDatasetImportResponse>(
    `/data-sources/external-databases/${connectionId}/import-sql`,
    payload,
  );
}
