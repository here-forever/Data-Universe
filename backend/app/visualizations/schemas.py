from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

DashboardMode = Literal["dashboard", "report", "screen"]
DashboardTheme = Literal["aurora", "warm", "minimal"]
DashboardFilterOperator = Literal["eq", "neq", "contains", "gt", "gte", "lt", "lte"]
ReportExportFormat = Literal["csv", "xlsx", "pdf"]
FilterValue = str | int | float | bool | None


class DashboardLayoutItem(BaseModel):
    chart_id: str = Field(min_length=1, max_length=64)
    x: int = Field(default=0, ge=0, le=11)
    y: int = Field(default=0, ge=0)
    w: int = Field(default=6, ge=1, le=12)
    h: int = Field(default=4, ge=2, le=12)


class DashboardGlobalFilter(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    field: str = Field(min_length=1, max_length=120)
    operator: DashboardFilterOperator = "eq"
    value: FilterValue = None
    data_view_id: str | None = Field(default=None, max_length=64)


class DashboardActiveSelection(BaseModel):
    chart_id: str = Field(min_length=1, max_length=64)
    field: str = Field(min_length=1, max_length=120)
    value: FilterValue


class DashboardLayoutDefinition(BaseModel):
    schema_version: Literal[1] = 1
    mode: DashboardMode = "dashboard"
    theme: DashboardTheme = "aurora"
    items: list[DashboardLayoutItem] = Field(default_factory=list, max_length=24)
    global_filters: list[DashboardGlobalFilter] = Field(default_factory=list, max_length=20)
    active_selections: list[DashboardActiveSelection] = Field(default_factory=list, max_length=20)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_layout(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        normalized = dict(value)
        filters = normalized.get("global_filters")
        if isinstance(filters, list):
            normalized["global_filters"] = [
                normalize_legacy_filter(item, index) for index, item in enumerate(filters)
            ]
        return normalized

    @model_validator(mode="after")
    def validate_unique_chart_items(self) -> "DashboardLayoutDefinition":
        chart_ids = [item.chart_id for item in self.items]
        if len(chart_ids) != len(set(chart_ids)):
            raise ValueError("Dashboard layout cannot contain duplicate chart items")
        return self


class ChartCreateRequest(BaseModel):
    project_id: str
    data_view_id: str
    name: str = Field(min_length=1, max_length=120)
    chart_type: str = Field(min_length=1, max_length=64)
    config: dict[str, Any] = Field(default_factory=dict)


class ChartResponse(BaseModel):
    id: str
    project_id: str
    data_view_id: str
    name: str
    chart_type: str
    config: dict[str, Any]


class ChartListResponse(BaseModel):
    items: list[ChartResponse]


class DashboardCreateRequest(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    layout: DashboardLayoutDefinition


class DashboardUpdateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    layout: DashboardLayoutDefinition | None = None

    @model_validator(mode="after")
    def validate_change(self) -> "DashboardUpdateRequest":
        if self.name is None and self.layout is None:
            raise ValueError("Dashboard update must include a name or layout change")
        return self


class DashboardResponse(BaseModel):
    id: str
    project_id: str
    name: str
    configuration_version: int
    layout: DashboardLayoutDefinition
    created_at: datetime
    updated_at: datetime


class DashboardListResponse(BaseModel):
    items: list[DashboardResponse]


class ReportExportResponse(BaseModel):
    id: str
    project_id: str
    dashboard_id: str
    created_by_id: str | None
    export_format: ReportExportFormat
    file_name: str
    content_type: str
    byte_size: int
    source_snapshot: dict[str, Any]
    created_at: datetime


class ReportExportListResponse(BaseModel):
    items: list[ReportExportResponse]


def normalize_legacy_filter(value: Any, index: int) -> Any:
    if not isinstance(value, dict):
        return value
    normalized = dict(value)
    field = normalized.get("field")
    field_slug = str(field or "field").replace(" ", "_")[:32]
    normalized.setdefault("id", f"legacy_{field_slug}_{index + 1}")
    normalized.setdefault("operator", "eq")
    normalized.setdefault("value", None)
    normalized.setdefault("data_view_id", None)
    return normalized
