import { apiClient } from "../../lib/apiClient";
import type { Dataset, DatasetField } from "../datasets/api";

export interface FilePreview {
  id: string;
  project_id: string;
  uploaded_file_id: string | null;
  upload_status: string;
  file_name: string;
  file_type: string;
  row_count: number;
  fields: DatasetField[];
  sample_rows: Array<Record<string, string | number | boolean | null>>;
}

export type UploadStatus = "pending" | "parsed" | "failed";

export interface UploadRecord {
  id: string;
  project_id: string;
  uploader_id: string;
  file_name: string;
  file_type: string;
  size_bytes: number;
  status: UploadStatus;
  error_message: string | null;
  preview_id: string | null;
  preview_row_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface UploadListResponse {
  items: UploadRecord[];
}

export interface DatasetCreatePayload {
  project_id: string;
  preview_id: string;
  name: string;
  fields: DatasetField[];
}

export async function createFilePreview(
  projectId: string,
  file: File,
): Promise<FilePreview> {
  const body = new FormData();
  body.set("project_id", projectId);
  body.set("file", file);

  return apiClient.postForm<FilePreview>("/imports/file-previews", body);
}

export async function getFilePreview(previewId: string): Promise<FilePreview> {
  return apiClient.get<FilePreview>(`/imports/file-previews/${previewId}`);
}

export async function listUploads(
  projectId: string,
): Promise<UploadListResponse> {
  return apiClient.get<UploadListResponse>("/imports/uploads", {
    project_id: projectId,
  });
}

export async function createDataset(
  payload: DatasetCreatePayload,
): Promise<Dataset> {
  return apiClient.post<Dataset>("/datasets", payload);
}
