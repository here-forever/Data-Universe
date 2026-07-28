import { apiClient } from "./apiClient";
import type {
  Language,
  LlmRequestConfig,
} from "../features/workspace/workspaceStore";

export interface ColumnProfile {
  name: string;
  kind: "numeric" | "categorical" | "boolean" | "datetime" | "text";
  missing_count: number;
  missing_ratio: number;
  unique_count: number;
  stats?: {
    mean: number;
    median: number;
    std: number;
    min: number;
    max: number;
    q1: number;
    q3: number;
    outlier_count: number;
  };
  top_values?: Array<{ value: string; count: number; ratio: number }>;
  range?: { start: string; end: string };
}

export interface DatasetProfile {
  row_count: number;
  column_count: number;
  missing_cells: number;
  duplicate_rows: number;
  quality_score: number;
  columns: ColumnProfile[];
  mapping: {
    x: string | null;
    y: string | null;
    z: string | null;
    color: string | null;
    time: string | null;
  };
}

export interface DatasetSummary {
  id: string;
  name: string;
  source_filename: string;
  file_type: string;
  row_count: number;
  column_count: number;
  active_revision: number;
  quality_score: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetDetail extends DatasetSummary {
  profile: DatasetProfile;
  preview: Array<Record<string, unknown>>;
  transformations: CleaningResultStep[];
}

export interface RowPage {
  dataset_id: string;
  revision: number;
  offset: number;
  limit: number;
  total: number;
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type CleaningAction =
  "drop_duplicates" | "drop_missing" | "fill_missing" | "flag_outliers";

export interface CleaningStep {
  action: CleaningAction;
  column?: string | null;
  columns?: string[];
  strategy?: "mean" | "median" | "mode" | "value" | null;
  value?: unknown;
}

export interface CleaningResultStep extends CleaningStep {
  rows_before: number;
  rows_after: number;
}

export interface ParticlePoint {
  id: number;
  x: number;
  y: number;
  z: number;
  color: string;
  label: string;
  values: Record<string, unknown>;
}

export interface ParticleResponse {
  dataset_id: string;
  mapping: Record<string, string | null>;
  points: ParticlePoint[];
}

export interface ChartRecommendation {
  type: "line" | "bar" | "scatter" | "histogram";
  title: string;
  reason: string;
  x_field: string;
  y_field?: string;
  categories?: string[];
  series?: number[];
  points?: [number, number][];
}

export interface ExploreFilter {
  field: string;
  value: string;
}

export interface ExploreResponse {
  dataset_id: string;
  revision: number;
  overview: {
    row_count: number;
    source_row_count: number;
    column_count: number;
    quality_score: number;
    numeric_fields: number;
    categorical_fields: number;
    filters: ExploreFilter[];
  };
  correlations: {
    fields: string[];
    matrix: Array<Array<number | null>>;
    strongest_pairs: Array<{ left: string; right: string; value: number }>;
  };
  distributions: Array<{
    field: string;
    kind: string;
    labels: string[];
    values: number[];
  }>;
  anomalies: Array<{
    row: number;
    field: string;
    value: unknown;
    z_score: number;
  }>;
  charts: ChartRecommendation[];
}

export interface AskResponse {
  analysis_id: string;
  dataset_id: string;
  mode: "statistical_engine" | "external_llm";
  model: string | null;
  answer: string;
  evidence: string[];
  suggested_chart: ChartRecommendation | null;
}

export interface LlmConnectionResponse {
  ok: boolean;
  model: string;
  api_style: "responses" | "chat_completions";
  message: string;
}

export interface AnalysisRun {
  id: string;
  dataset_id: string;
  kind: string;
  request: Record<string, unknown>;
  result: Record<string, unknown>;
  created_at: string;
}

export type StoryBlockKind =
  "cover" | "metric" | "chart" | "narrative" | "quality";

export interface StoryBlock {
  id: string;
  kind: StoryBlockKind;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}

export interface Story {
  id: string;
  dataset_id: string;
  title: string;
  summary: string;
  blocks: StoryBlock[];
  created_at: string;
  updated_at: string;
}

export const queryKeys = {
  datasets: ["datasets"] as const,
  dataset: (id: string | null) => ["datasets", id] as const,
  rows: (id: string | null, offset: number) =>
    ["datasets", id, "rows", offset] as const,
  particles: (id: string | null, mapping: Record<string, unknown>) =>
    ["datasets", id, "particles", mapping] as const,
  explore: (id: string | null, filters: ExploreFilter[], language: Language) =>
    ["insights", id, "explore", filters, language] as const,
  history: (id: string | null) => ["insights", id, "history"] as const,
  stories: ["stories"] as const,
  story: (id: string | null) => ["stories", id] as const,
};

export const vibeApi = {
  listDatasets: () => apiClient.get<DatasetSummary[]>("/datasets"),
  getDataset: (id: string) => apiClient.get<DatasetDetail>(`/datasets/${id}`),
  getRows: (id: string, offset = 0, limit = 50) =>
    apiClient.get<RowPage>(`/datasets/${id}/rows`, { offset, limit }),
  uploadDataset: (file: File, name?: string) => {
    const body = new FormData();
    body.append("file", file);
    if (name) body.append("name", name);
    return apiClient.postForm<DatasetDetail>("/datasets/upload", body);
  },
  createDemo: () => apiClient.post<DatasetDetail>("/datasets/demo"),
  cleanDataset: (id: string, label: string, steps: CleaningStep[]) =>
    apiClient.post<DatasetDetail>(`/datasets/${id}/clean`, { label, steps }),
  deleteDataset: (id: string) => apiClient.delete<void>(`/datasets/${id}`),
  getParticles: (
    id: string,
    mapping: {
      x?: string;
      y?: string;
      z?: string;
      color?: string;
      limit?: number;
    },
  ) => apiClient.post<ParticleResponse>(`/datasets/${id}/particles`, mapping),
  explore: (
    id: string,
    filters: ExploreFilter[] = [],
    language: Language = "zh-CN",
  ) =>
    apiClient.post<ExploreResponse>(`/insights/${id}/explore`, {
      filters,
      locale: language,
    }),
  ask: (
    id: string,
    question: string,
    language: Language = "zh-CN",
    llm?: LlmRequestConfig,
  ) =>
    apiClient.post<AskResponse>(`/insights/${id}/ask`, {
      question,
      locale: language,
      ...(llm ? { llm } : {}),
    }),
  checkLlm: (llm: LlmRequestConfig) =>
    apiClient.post<LlmConnectionResponse>("/insights/llm/check", llm),
  advanced: (id: string, request: Record<string, unknown>) =>
    apiClient.post<AnalysisRun>(`/insights/${id}/advanced`, request),
  history: (id: string) =>
    apiClient.get<AnalysisRun[]>(`/insights/${id}/history`),
  listStories: () => apiClient.get<Story[]>("/stories"),
  getStory: (id: string) => apiClient.get<Story>(`/stories/${id}`),
  createStory: (
    datasetId: string,
    title?: string,
    language: Language = "zh-CN",
  ) =>
    apiClient.post<Story>("/stories", {
      dataset_id: datasetId,
      locale: language,
      title,
    }),
  updateStory: (
    id: string,
    changes: Partial<Pick<Story, "title" | "summary" | "blocks">>,
  ) => apiClient.patch<Story>(`/stories/${id}`, changes),
  deleteStory: (id: string) => apiClient.delete<void>(`/stories/${id}`),
  exportStory: (
    id: string,
    format: "html" | "pdf",
    language: Language = "zh-CN",
  ) =>
    apiClient.download(`/stories/${id}/export`, { format, locale: language }),
};
