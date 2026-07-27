from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

FilterOperator = Literal[
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "contains",
    "in",
    "is_null",
    "not_null",
]
Aggregation = Literal["count", "sum", "avg", "min", "max", "distinct_count"]
SortDirection = Literal["asc", "desc"]


class AnalysisFilter(BaseModel):
    field: str = Field(min_length=1, max_length=120)
    operator: FilterOperator
    value: object | None = None


class AnalysisMetric(BaseModel):
    field: str | None = Field(default=None, max_length=120)
    aggregation: Aggregation
    alias: str | None = Field(default=None, min_length=1, max_length=120)

    @model_validator(mode="after")
    def validate_metric_field(self):
        if self.aggregation != "count" and not self.field:
            raise ValueError(f"{self.aggregation} requires a field")
        return self


class AnalysisRequest(BaseModel):
    dimensions: list[str] = Field(default_factory=list, max_length=3)
    metrics: list[AnalysisMetric] = Field(min_length=1, max_length=8)
    filters: list[AnalysisFilter] = Field(default_factory=list, max_length=12)
    sort_by: str | None = Field(default=None, max_length=120)
    sort_direction: SortDirection = "desc"
    limit: int = Field(default=100, ge=1, le=500)


class AnalysisResponse(BaseModel):
    dataset_id: str
    dataset_name: str
    source_row_count: int
    filtered_row_count: int
    total_groups: int
    columns: list[str]
    rows: list[dict[str, object | None]]


class StatisticsRequest(BaseModel):
    fields: list[str] = Field(default_factory=list, max_length=20)
    filters: list[AnalysisFilter] = Field(default_factory=list, max_length=12)


class NumericStatistics(BaseModel):
    field: str
    count: int
    null_count: int
    sum: float
    mean: float
    median: float
    minimum: float
    maximum: float
    standard_deviation: float
    percentile_25: float
    percentile_75: float


class CategoryValueCount(BaseModel):
    value: str
    count: int
    ratio: float


class CategoricalStatistics(BaseModel):
    field: str
    count: int
    null_count: int
    distinct_count: int
    top_values: list[CategoryValueCount]


class StatisticsResponse(BaseModel):
    dataset_id: str
    source_row_count: int
    filtered_row_count: int
    numeric_fields: list[NumericStatistics]
    categorical_fields: list[CategoricalStatistics]


class CorrelationRequest(BaseModel):
    fields: list[str] = Field(min_length=2, max_length=8)
    filters: list[AnalysisFilter] = Field(default_factory=list, max_length=12)


class CorrelationResponse(BaseModel):
    dataset_id: str
    fields: list[str]
    observations: int
    matrix: list[list[float | None]]


class RegressionRequest(BaseModel):
    feature: str = Field(min_length=1, max_length=120)
    target: str = Field(min_length=1, max_length=120)
    filters: list[AnalysisFilter] = Field(default_factory=list, max_length=12)


class RegressionPoint(BaseModel):
    feature: float
    actual: float
    predicted: float


class RegressionResponse(BaseModel):
    dataset_id: str
    feature: str
    target: str
    observations: int
    slope: float
    intercept: float
    r_squared: float
    rmse: float
    points: list[RegressionPoint]


AnalysisViewMode = Literal["dimension", "statistics", "correlation", "regression"]
AnalysisChartType = Literal["bar", "line"]
AnalysisResultType = Literal[
    "aggregate",
    "statistics_numeric",
    "statistics_categorical",
    "correlation",
    "regression",
]


class AnalysisPresentation(BaseModel):
    view_mode: AnalysisViewMode = "dimension"
    chart_type: AnalysisChartType = "bar"


class AnalysisWorkspaceConfiguration(BaseModel):
    aggregate: AnalysisRequest
    statistics: StatisticsRequest = Field(default_factory=StatisticsRequest)
    correlation: CorrelationRequest | None = None
    regression: RegressionRequest | None = None
    presentation: AnalysisPresentation = Field(default_factory=AnalysisPresentation)


class AnalysisDefinitionCreateRequest(BaseModel):
    project_id: str = Field(min_length=1, max_length=64)
    source_dataset_id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    configuration: AnalysisWorkspaceConfiguration


class AnalysisDefinitionResponse(BaseModel):
    id: str
    project_id: str
    source_dataset_id: str
    name: str
    description: str | None
    configuration_version: int
    configuration: AnalysisWorkspaceConfiguration
    last_run_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AnalysisDefinitionListResponse(BaseModel):
    items: list[AnalysisDefinitionResponse]


class AnalysisDefinitionRunResponse(BaseModel):
    definition: AnalysisDefinitionResponse
    aggregate: AnalysisResponse
    statistics: StatisticsResponse
    correlation: CorrelationResponse | None
    regression: RegressionResponse | None


class AnalysisMaterializeRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    result_type: AnalysisResultType = "aggregate"
