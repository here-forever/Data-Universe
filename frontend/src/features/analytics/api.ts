import { apiClient } from "../../lib/apiClient";

export type Aggregation =
  "count" | "sum" | "avg" | "min" | "max" | "distinct_count";
export type FilterOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "is_null"
  | "not_null";

export interface AnalysisFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | null;
}

export interface AnalysisMetric {
  field: string | null;
  aggregation: Aggregation;
  alias: string;
}

export interface AnalysisRequest {
  dimensions: string[];
  metrics: AnalysisMetric[];
  filters: AnalysisFilter[];
  sort_by: string;
  sort_direction: "asc" | "desc";
  limit: number;
}

export interface AnalysisResponse {
  dataset_id: string;
  dataset_name: string;
  source_row_count: number;
  filtered_row_count: number;
  total_groups: number;
  columns: string[];
  rows: Array<Record<string, string | number | boolean | null>>;
}

export interface NumericStatistics {
  field: string;
  count: number;
  null_count: number;
  sum: number;
  mean: number;
  median: number;
  minimum: number;
  maximum: number;
  standard_deviation: number;
  percentile_25: number;
  percentile_75: number;
}

export interface CategoricalStatistics {
  field: string;
  count: number;
  null_count: number;
  distinct_count: number;
  top_values: Array<{ value: string; count: number; ratio: number }>;
}

export interface StatisticsResponse {
  dataset_id: string;
  source_row_count: number;
  filtered_row_count: number;
  numeric_fields: NumericStatistics[];
  categorical_fields: CategoricalStatistics[];
}

export interface CorrelationResponse {
  dataset_id: string;
  fields: string[];
  observations: number;
  matrix: Array<Array<number | null>>;
}

export interface RegressionResponse {
  dataset_id: string;
  feature: string;
  target: string;
  observations: number;
  slope: number;
  intercept: number;
  r_squared: number;
  rmse: number;
  points: Array<{ feature: number; actual: number; predicted: number }>;
}

export async function aggregateDataset(
  datasetId: string,
  payload: AnalysisRequest,
): Promise<AnalysisResponse> {
  return apiClient.post<AnalysisResponse>(
    `/analytics/datasets/${datasetId}/aggregate`,
    payload,
  );
}

export async function calculateStatistics(
  datasetId: string,
  fields: string[],
  filters: AnalysisFilter[],
): Promise<StatisticsResponse> {
  return apiClient.post<StatisticsResponse>(
    `/analytics/datasets/${datasetId}/statistics`,
    { fields, filters },
  );
}

export async function calculateCorrelation(
  datasetId: string,
  fields: string[],
  filters: AnalysisFilter[],
): Promise<CorrelationResponse> {
  return apiClient.post<CorrelationResponse>(
    `/analytics/datasets/${datasetId}/correlation`,
    { fields, filters },
  );
}

export async function calculateRegression(
  datasetId: string,
  feature: string,
  target: string,
  filters: AnalysisFilter[],
): Promise<RegressionResponse> {
  return apiClient.post<RegressionResponse>(
    `/analytics/datasets/${datasetId}/linear-regression`,
    { feature, target, filters },
  );
}

export async function exportAnalysis(
  datasetId: string,
  payload: AnalysisRequest,
  format: "csv" | "xlsx",
): Promise<void> {
  const result = await apiClient.postBlob(
    `/analytics/datasets/${datasetId}/export`,
    payload,
    { format },
  );
  const url = URL.createObjectURL(result.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName ?? `analysis.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
