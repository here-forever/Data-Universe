import { apiClient } from "../../lib/apiClient";

export type TaskStatus =
  "pending" | "running" | "success" | "failed" | "retryable";

export interface TaskItem {
  id: string;
  project_id: string | null;
  initiator_id: string | null;
  name: string;
  task_type: string;
  status: TaskStatus;
  progress: number;
  error_message: string | null;
  related_resource_type: string | null;
  related_resource_id: string | null;
  can_retry: boolean;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskListResponse {
  items: TaskItem[];
}

export interface TaskRetryResponse {
  original_task: TaskItem;
  retry_task: TaskItem;
}

export async function listTasks(projectId: string): Promise<TaskListResponse> {
  return apiClient.get<TaskListResponse>("/tasks", {
    project_id: projectId,
  });
}

export async function retryTask(taskId: string): Promise<TaskRetryResponse> {
  return apiClient.post<TaskRetryResponse>(`/tasks/${taskId}/retry`);
}
