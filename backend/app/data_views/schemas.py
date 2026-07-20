from pydantic import BaseModel, Field

from app.imports.schemas import ImportFieldPreview


class DataViewCreateRequest(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    source_type: str = Field(min_length=1, max_length=64)
    source_id: str | None = None
    source_sql: str | None = None
    fields: list[ImportFieldPreview] = Field(min_length=1)
    rows: list[dict[str, object | None]]


class DataViewResponse(BaseModel):
    id: str
    project_id: str
    name: str
    description: str | None
    source_type: str
    source_id: str | None
    source_sql: str | None
    physical_table_name: str
    row_count: int
    fields: list[ImportFieldPreview]


class DataViewListResponse(BaseModel):
    items: list[DataViewResponse]


class DataViewPreviewResponse(BaseModel):
    data_view: DataViewResponse
    page: int
    page_size: int
    total_rows: int
    rows: list[dict[str, object | None]]
