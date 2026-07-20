from pydantic import BaseModel, Field

from app.imports.schemas import ImportFieldPreview


class SqlDatasetReference(BaseModel):
    id: str
    name: str
    table_alias: str
    row_count: int
    fields: list[ImportFieldPreview]


class SqlWorkspaceMetadataResponse(BaseModel):
    project_id: str
    datasets: list[SqlDatasetReference]


class SqlRunRequest(BaseModel):
    project_id: str
    sql: str = Field(min_length=1, max_length=20_000)
    limit: int = Field(default=100, ge=1, le=500)


class SqlRunResponse(BaseModel):
    project_id: str
    executed_sql: str
    columns: list[str]
    rows: list[dict[str, object | None]]
    row_count: int
    limit: int


class SqlSaveDataViewRequest(BaseModel):
    project_id: str
    sql: str = Field(min_length=1, max_length=20_000)
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    limit: int = Field(default=500, ge=1, le=5000)
