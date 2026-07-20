import { apiClient } from "../../lib/apiClient";

export type CleaningOperation =
  "rename_field" | "fill_null" | "drop_null_rows" | "deduplicate";

export interface CleaningStepPayload {
  operation: CleaningOperation;
  order: number;
  config: Record<string, unknown>;
}

export interface CleaningRecipe {
  id: string;
  project_id: string;
  source_dataset_id: string;
  name: string;
  description: string | null;
  steps: Array<CleaningStepPayload & { id: string }>;
}

export interface CleaningRecipeCreatePayload {
  project_id: string;
  source_dataset_id: string;
  name: string;
  description?: string | null;
  steps: CleaningStepPayload[];
}

export interface CleaningExecutePayload {
  output_name: string;
}

export interface CleaningExecution {
  recipe_id: string;
  source_dataset_id: string;
  derived_dataset_id: string;
  derived_dataset_name: string;
  row_count: number;
}

export interface CleaningPreviewPayload {
  project_id: string;
  source_dataset_id: string;
  steps: CleaningStepPayload[];
  page: number;
  page_size: number;
}

export interface CleaningPreview {
  source_dataset_id: string;
  page: number;
  page_size: number;
  total_rows: number;
  fields: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export async function previewCleaning(
  payload: CleaningPreviewPayload,
): Promise<CleaningPreview> {
  return apiClient.post<CleaningPreview>("/cleaning/preview", payload);
}

export async function createCleaningRecipe(
  payload: CleaningRecipeCreatePayload,
): Promise<CleaningRecipe> {
  return apiClient.post<CleaningRecipe>("/cleaning/recipes", payload);
}

export async function executeCleaningRecipe(
  recipeId: string,
  payload: CleaningExecutePayload,
): Promise<CleaningExecution> {
  return apiClient.post<CleaningExecution>(
    `/cleaning/recipes/${recipeId}/execute`,
    payload,
  );
}
