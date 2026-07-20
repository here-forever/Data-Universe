from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.datasets.schemas import DatasetResponse
from app.imports.schemas import ImportFieldPreview
from app.tasks.schemas import TaskResponse

DatabaseType = Literal["postgresql", "mysql"]
ConnectionStatus = Literal["untested", "available", "failed"]


class ExternalDatabaseConnectionCreateRequest(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    database_type: DatabaseType
    host: str = Field(min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=1)
    read_only: bool = True


class ExternalDatabaseConnectionUpdateRequest(BaseModel):
    project_id: str
    name: str | None = Field(default=None, min_length=1, max_length=120)
    database_type: DatabaseType | None = None
    host: str | None = Field(default=None, min_length=1, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, min_length=1, max_length=120)
    username: str | None = Field(default=None, min_length=1, max_length=120)
    password: str | None = Field(default=None, min_length=1)
    read_only: bool | None = None

    @model_validator(mode="after")
    def require_update_field(self) -> "ExternalDatabaseConnectionUpdateRequest":
        values = self.model_dump(exclude={"project_id"}, exclude_none=True)
        if not values:
            raise ValueError("At least one connection field must be provided")
        return self


class ExternalDatabaseConnectionActionRequest(BaseModel):
    project_id: str


class ExternalDatabaseConnectionResponse(BaseModel):
    id: str
    project_id: str
    name: str
    database_type: DatabaseType
    host: str
    port: int
    database_name: str
    username: str
    read_only: bool
    status: ConnectionStatus
    last_error: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ExternalDatabaseConnectionListResponse(BaseModel):
    items: list[ExternalDatabaseConnectionResponse]


class ExternalDatabaseConnectionTestResponse(BaseModel):
    connection: ExternalDatabaseConnectionResponse
    ok: bool
    message: str


class ExternalTableColumnResponse(BaseModel):
    name: str
    data_type: str
    inferred_type: str
    nullable: bool
    order: int


class ExternalTableResponse(BaseModel):
    schema_name: str
    table_name: str
    columns: list[ExternalTableColumnResponse]


class ExternalDatabaseSchemaResponse(BaseModel):
    connection: ExternalDatabaseConnectionResponse
    tables: list[ExternalTableResponse]


class ExternalTablePreviewRequest(BaseModel):
    project_id: str
    schema_name: str = ""
    table_name: str = Field(min_length=1, max_length=255)
    limit: int = Field(default=100, ge=1, le=10000)


class ExternalSqlPreviewRequest(BaseModel):
    project_id: str
    sql: str = Field(min_length=1)
    limit: int = Field(default=100, ge=1, le=10000)


class ExternalImportPreviewResponse(BaseModel):
    source_type: Literal["external_table", "external_sql"]
    fields: list[ImportFieldPreview]
    sample_rows: list[dict[str, object | None]]
    row_count: int
    limit: int


class ExternalTableImportRequest(BaseModel):
    project_id: str
    dataset_name: str = Field(min_length=1, max_length=120)
    schema_name: str = ""
    table_name: str = Field(min_length=1, max_length=255)
    limit: int = Field(default=1000, ge=1, le=10000)
    fields: list[ImportFieldPreview] | None = None


class ExternalSqlImportRequest(BaseModel):
    project_id: str
    dataset_name: str = Field(min_length=1, max_length=120)
    sql: str = Field(min_length=1)
    limit: int = Field(default=1000, ge=1, le=10000)
    fields: list[ImportFieldPreview] | None = None


class ExternalDatasetImportResponse(BaseModel):
    dataset: DatasetResponse
    source_type: Literal["external_table", "external_sql"]
    row_count: int


class ExternalImportHistoryItemResponse(BaseModel):
    task: TaskResponse
    source_type: Literal["external_table", "external_sql"]
    connection_id: str | None
    dataset_name: str | None
    schema_name: str | None
    table_name: str | None
    sql: str | None
    limit: int | None
    field_count: int | None


class ExternalImportHistoryResponse(BaseModel):
    items: list[ExternalImportHistoryItemResponse]


class ExternalImportDetailResponse(BaseModel):
    item: ExternalImportHistoryItemResponse
    fields: list[ImportFieldPreview]
