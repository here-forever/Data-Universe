from pydantic import BaseModel, Field

from app.imports.schemas import ImportFieldPreview


class DatasetCreateRequest(BaseModel):
    project_id: str
    preview_id: str
    name: str = Field(min_length=1, max_length=120)
    fields: list[ImportFieldPreview] = Field(min_length=1)


class DatasetResponse(BaseModel):
    id: str
    project_id: str
    name: str
    source_preview_id: str
    physical_table_name: str
    row_count: int
    fields: list[ImportFieldPreview]


class DatasetListResponse(BaseModel):
    items: list[DatasetResponse]


class DatasetPreviewResponse(BaseModel):
    dataset: DatasetResponse
    page: int
    page_size: int
    total_rows: int
    rows: list[dict[str, object | None]]


class DatasetFieldQuality(BaseModel):
    name: str
    inferred_type: str
    nullable: bool
    null_count: int
    null_ratio: float
    distinct_count: int
    duplicate_count: int
    sample_values: list[object]
    warnings: list[str]


class DatasetQualityResponse(BaseModel):
    dataset: DatasetResponse
    row_count: int
    field_count: int
    null_cell_count: int
    null_cell_ratio: float
    duplicate_row_count: int
    field_profiles: list[DatasetFieldQuality]
    warnings: list[str]
