from datetime import datetime
from typing import Literal

from pydantic import BaseModel

FieldType = Literal["integer", "decimal", "date", "datetime", "boolean", "text"]
UploadStatus = Literal["pending", "parsed", "failed"]


class ImportFieldPreview(BaseModel):
    name: str
    inferred_type: FieldType
    nullable: bool
    order: int


class FilePreviewResponse(BaseModel):
    id: str
    project_id: str
    uploaded_file_id: str | None
    upload_status: str
    file_name: str
    file_type: str
    row_count: int
    fields: list[ImportFieldPreview]
    sample_rows: list[dict[str, object | None]]


class UploadedFileResponse(BaseModel):
    id: str
    project_id: str
    uploader_id: str
    file_name: str
    file_type: str
    size_bytes: int
    status: UploadStatus
    error_message: str | None
    preview_id: str | None
    preview_row_count: int | None
    created_at: datetime
    updated_at: datetime


class UploadedFileListResponse(BaseModel):
    items: list[UploadedFileResponse]
