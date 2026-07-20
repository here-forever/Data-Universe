from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from app.audit.service import AuditService
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.ids import new_id
from app.imports.parser import ParsedTabularFile, parse_tabular_file
from app.imports.repository import ImportRepository
from app.imports.schemas import FilePreviewResponse, ImportFieldPreview, UploadedFileResponse
from app.imports.storage import LocalFileStorage
from app.models.imports import FileImportPreview as FileImportPreviewModel
from app.models.imports import UploadedFile as UploadedFileModel
from app.tasks.service import TaskService

SAMPLE_ROW_LIMIT = 20


@dataclass(frozen=True)
class FilePreview:
    id: str
    project_id: str
    file_name: str
    file_type: str
    row_count: int
    fields: list[ImportFieldPreview]
    sample_rows: list[dict[str, object | None]]
    uploaded_file_id: str | None = None
    storage_path: str | None = None
    upload_status: str = "parsed"


@dataclass(frozen=True)
class UploadedFileRecord:
    id: str
    project_id: str
    uploader_id: str
    file_name: str
    file_type: str
    size_bytes: int
    status: str
    error_message: str | None
    preview_id: str | None
    preview_row_count: int | None
    created_at: datetime
    updated_at: datetime


class ImportService:
    def __init__(
        self,
        repository: ImportRepository | None = None,
        uploader_id: str | None = None,
        storage: LocalFileStorage | None = None,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
    ) -> None:
        self.repository = repository
        self.uploader_id = uploader_id
        self.storage = storage
        self.audit = audit
        self.tasks = tasks
        self._previews: dict[str, FilePreview] = {}

    def reset(self) -> None:
        self._previews = {}

    def create_file_preview(
        self,
        *,
        project_id: str,
        file_name: str,
        content: bytes,
    ) -> FilePreview:
        try:
            return self._create_file_preview(
                project_id=project_id,
                file_name=file_name,
                content=content,
            )
        except Exception as error:
            if self.repository is None:
                self._record_preview_failure(
                    project_id=project_id,
                    file_name=file_name,
                    error=error,
                )
            if isinstance(error, AppError):
                raise
            raise AppError(
                "File could not be parsed. Check the file encoding or format and retry.",
                "file_parse_failed",
                400,
            ) from error

    def _create_file_preview(
        self,
        *,
        project_id: str,
        file_name: str,
        content: bytes,
    ) -> FilePreview:
        if self.repository is not None:
            uploaded_file = self._stage_uploaded_file(
                project_id=project_id,
                file_name=file_name,
                content=content,
            )
            try:
                return self._create_preview_from_uploaded_file(uploaded_file)
            except Exception as error:
                self._mark_uploaded_file_failed(uploaded_file, error)
                raise

        parsed_file = parse_tabular_file(file_name, content)
        preview_id = (
            new_id("preview")
            if self.repository is not None
            else f"preview_{len(self._previews) + 1}"
        )
        uploaded_file_id = new_id("file") if self.repository is not None else None
        storage_path = (
            self._save_uploaded_file(
                project_id=project_id,
                uploaded_file_id=uploaded_file_id,
                file_name=file_name,
                content=content,
            )
            if uploaded_file_id is not None
            else None
        )
        preview = FilePreview(
            id=preview_id,
            project_id=project_id,
            file_name=file_name,
            file_type=parsed_file.file_type,
            row_count=len(parsed_file.rows),
            fields=parsed_file.fields,
            sample_rows=parsed_file.rows[:SAMPLE_ROW_LIMIT],
            uploaded_file_id=uploaded_file_id,
            storage_path=storage_path,
            upload_status="parsed",
        )

        if self.repository is not None:
            saved_preview = self.repository.save_preview(
                uploaded_file=UploadedFileModel(
                    id=uploaded_file_id,
                    project_id=project_id,
                    uploader_id=self.uploader_id or "usr_unknown",
                    file_name=file_name,
                    file_type=parsed_file.file_type,
                    storage_path=storage_path or "",
                    size_bytes=len(content),
                ),
                preview=FileImportPreviewModel(
                    id=preview.id,
                    project_id=project_id,
                    uploaded_file_id=uploaded_file_id,
                    file_name=file_name,
                    file_type=parsed_file.file_type,
                    row_count=preview.row_count,
                    fields=[field.model_dump() for field in preview.fields],
                    sample_rows=preview.sample_rows,
                ),
            )
            self._record_preview_audit(
                preview=preview,
                uploaded_file_id=uploaded_file_id,
            )
            self._record_preview_task(preview)
            return model_to_preview(saved_preview)

        self._previews[preview.id] = preview
        return preview

    def create_preview_from_uploaded_file(self, uploaded_file_id: str) -> FilePreview:
        if self.repository is None:
            raise AppError("Uploaded file storage is not configured", "upload_storage_missing", 500)

        uploaded_file = self.repository.get_uploaded_file(uploaded_file_id)
        if uploaded_file is None:
            raise AppError("Uploaded file not found", "uploaded_file_not_found", 404)
        try:
            return self._create_preview_from_uploaded_file(uploaded_file)
        except Exception as error:
            self._mark_uploaded_file_failed(uploaded_file, error)
            raise

    def _stage_uploaded_file(
        self,
        *,
        project_id: str,
        file_name: str,
        content: bytes,
    ) -> UploadedFileModel:
        uploaded_file_id = new_id("file")
        storage_path = self._save_uploaded_file(
            project_id=project_id,
            uploaded_file_id=uploaded_file_id,
            file_name=file_name,
            content=content,
        )
        return self.repository.save_uploaded_file(
            UploadedFileModel(
                id=uploaded_file_id,
                project_id=project_id,
                uploader_id=self.uploader_id or "usr_unknown",
                file_name=file_name,
                file_type=file_type_from_name(file_name),
                storage_path=storage_path,
                size_bytes=len(content),
                status="pending",
                error_message=None,
            )
        )

    def _create_preview_from_uploaded_file(
        self,
        uploaded_file: UploadedFileModel,
    ) -> FilePreview:
        storage_path = Path(uploaded_file.storage_path)
        if not storage_path.exists():
            raise AppError(
                message="Uploaded source file not found in storage",
                code="uploaded_source_file_missing",
                status_code=409,
            )

        parsed_file = parse_tabular_file(uploaded_file.file_name, storage_path.read_bytes())
        preview_id = new_id("preview")
        preview = FilePreview(
            id=preview_id,
            project_id=uploaded_file.project_id,
            file_name=uploaded_file.file_name,
            file_type=parsed_file.file_type,
            row_count=len(parsed_file.rows),
            fields=parsed_file.fields,
            sample_rows=parsed_file.rows[:SAMPLE_ROW_LIMIT],
            uploaded_file_id=uploaded_file.id,
            storage_path=uploaded_file.storage_path,
            upload_status="parsed",
        )
        uploaded_file.file_type = parsed_file.file_type
        uploaded_file.status = "parsed"
        uploaded_file.error_message = None
        saved_preview = self.repository.save_parsed_preview(
            uploaded_file=uploaded_file,
            preview=FileImportPreviewModel(
                id=preview.id,
                project_id=preview.project_id,
                uploaded_file_id=uploaded_file.id,
                file_name=preview.file_name,
                file_type=preview.file_type,
                row_count=preview.row_count,
                fields=[field.model_dump() for field in preview.fields],
                sample_rows=preview.sample_rows,
            ),
        )
        self._record_preview_audit(
            preview=preview,
            uploaded_file_id=uploaded_file.id,
        )
        self._record_preview_task(preview)
        return model_to_preview(saved_preview, upload_status="parsed")

    def get_preview(self, preview_id: str) -> FilePreview | None:
        if self.repository is not None:
            preview = self.repository.get_preview(preview_id)
            return model_to_preview(preview) if preview is not None else None

        return self._previews.get(preview_id)

    def require_preview(self, preview_id: str) -> FilePreview:
        preview = self.get_preview(preview_id)
        if preview is None:
            raise AppError(message="Preview not found", code="preview_not_found", status_code=404)
        return preview

    def list_uploaded_files(self, project_id: str) -> list[UploadedFileRecord]:
        if self.repository is None:
            return []

        return [
            model_to_uploaded_file_record(uploaded_file, preview)
            for uploaded_file, preview in self.repository.list_uploaded_files(project_id)
        ]

    def parse_preview_source(self, preview_id: str) -> ParsedTabularFile:
        preview = self.get_preview(preview_id)
        if preview is None:
            raise AppError(message="Preview not found", code="preview_not_found", status_code=404)

        if self.repository is None:
            return ParsedTabularFile(
                file_type=preview.file_type,
                fields=preview.fields,
                rows=preview.sample_rows,
            )

        if preview.uploaded_file_id is None:
            raise AppError(
                message="Preview is not linked to an uploaded file",
                code="preview_source_missing",
                status_code=409,
            )

        uploaded_file = self.repository.get_uploaded_file(preview.uploaded_file_id)
        if uploaded_file is None:
            raise AppError(
                message="Uploaded file metadata not found",
                code="uploaded_file_not_found",
                status_code=404,
            )

        storage_path = Path(uploaded_file.storage_path)
        if not storage_path.exists():
            raise AppError(
                message="Uploaded source file not found in storage",
                code="uploaded_source_file_missing",
                status_code=409,
            )

        return parse_tabular_file(uploaded_file.file_name, storage_path.read_bytes())

    def _save_uploaded_file(
        self,
        *,
        project_id: str,
        uploaded_file_id: str | None,
        file_name: str,
        content: bytes,
    ) -> str:
        if uploaded_file_id is None:
            raise ValueError("uploaded_file_id is required for persisted uploads")
        storage = self.storage or LocalFileStorage(get_settings().upload_storage_root)
        return storage.save_upload(
            project_id=project_id,
            uploaded_file_id=uploaded_file_id,
            file_name=file_name,
            content=content,
        )

    def _record_preview_audit(self, *, preview: FilePreview, uploaded_file_id: str) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="import.file_preview_created",
            project_id=preview.project_id,
            resource_type="file_import_preview",
            resource_id=preview.id,
            detail={
                "uploaded_file_id": uploaded_file_id,
                "file_name": preview.file_name,
                "file_type": preview.file_type,
                "row_count": preview.row_count,
                "field_count": len(preview.fields),
                "storage_path": preview.storage_path,
            },
        )
        self.audit.record_lineage(
            project_id=preview.project_id,
            source_type="uploaded_file",
            source_id=uploaded_file_id,
            target_type="file_import_preview",
            target_id=preview.id,
            transform_type="file_parse_preview",
            transform_id=preview.id,
        )

    def _record_preview_task(self, preview: FilePreview) -> None:
        if self.tasks is None:
            return

        self.tasks.record_success(
            project_id=preview.project_id,
            name=f"Parsed file preview: {preview.file_name}",
            task_type="file_preview_parse",
            related_resource_type="file_import_preview",
            related_resource_id=preview.id,
        )

    def _record_preview_failure(
        self,
        *,
        project_id: str,
        file_name: str,
        error: Exception,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_exception(
            project_id=project_id,
            name=f"Parse file preview failed: {file_name}",
            task_type="file_preview_parse",
            error=error,
            related_resource_type="uploaded_file",
            related_resource_id=None,
        )

    def _record_staged_preview_failure(
        self,
        *,
        project_id: str,
        file_name: str,
        uploaded_file_id: str,
        error: Exception,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_exception(
            project_id=project_id,
            name=f"Parse file preview failed: {file_name}",
            task_type="file_preview_parse",
            error=error,
            related_resource_type="uploaded_file",
            related_resource_id=uploaded_file_id,
            retry_payload=(
                None
                if isinstance(error, AppError)
                else {
                    "operation": "file_preview_parse",
                    "uploaded_file_id": uploaded_file_id,
                }
            ),
        )

    def _mark_uploaded_file_failed(
        self,
        uploaded_file: UploadedFileModel,
        error: Exception,
    ) -> None:
        uploaded_file.status = "failed"
        uploaded_file.error_message = str(error) or error.__class__.__name__
        self.repository.update_uploaded_file(uploaded_file)
        self._record_staged_preview_failure(
            project_id=uploaded_file.project_id,
            file_name=uploaded_file.file_name,
            uploaded_file_id=uploaded_file.id,
            error=error,
        )


def model_to_preview(
    preview: FileImportPreviewModel,
    *,
    upload_status: str = "parsed",
) -> FilePreview:
    return FilePreview(
        id=preview.id,
        project_id=preview.project_id,
        file_name=preview.file_name,
        file_type=preview.file_type,
        row_count=preview.row_count,
        fields=[ImportFieldPreview.model_validate(field) for field in preview.fields],
        sample_rows=preview.sample_rows,
        uploaded_file_id=preview.uploaded_file_id,
        storage_path=None,
        upload_status=upload_status,
    )


def to_file_preview_response(preview: FilePreview) -> FilePreviewResponse:
    return FilePreviewResponse(
        id=preview.id,
        project_id=preview.project_id,
        uploaded_file_id=preview.uploaded_file_id,
        upload_status=preview.upload_status,
        file_name=preview.file_name,
        file_type=preview.file_type,
        row_count=preview.row_count,
        fields=preview.fields,
        sample_rows=preview.sample_rows,
    )


def model_to_uploaded_file_record(
    uploaded_file: UploadedFileModel,
    preview: FileImportPreviewModel | None,
) -> UploadedFileRecord:
    return UploadedFileRecord(
        id=uploaded_file.id,
        project_id=uploaded_file.project_id,
        uploader_id=uploaded_file.uploader_id,
        file_name=uploaded_file.file_name,
        file_type=uploaded_file.file_type,
        size_bytes=uploaded_file.size_bytes,
        status=uploaded_file.status,
        error_message=uploaded_file.error_message,
        preview_id=preview.id if preview is not None else None,
        preview_row_count=preview.row_count if preview is not None else None,
        created_at=uploaded_file.created_at,
        updated_at=uploaded_file.updated_at,
    )


def to_uploaded_file_response(uploaded_file: UploadedFileRecord) -> UploadedFileResponse:
    return UploadedFileResponse(
        id=uploaded_file.id,
        project_id=uploaded_file.project_id,
        uploader_id=uploaded_file.uploader_id,
        file_name=uploaded_file.file_name,
        file_type=uploaded_file.file_type,
        size_bytes=uploaded_file.size_bytes,
        status=uploaded_file.status,
        error_message=uploaded_file.error_message,
        preview_id=uploaded_file.preview_id,
        preview_row_count=uploaded_file.preview_row_count,
        created_at=uploaded_file.created_at,
        updated_at=uploaded_file.updated_at,
    )


def file_type_from_name(file_name: str) -> str:
    suffix = Path(file_name).suffix.lower().removeprefix(".")
    return suffix or "unknown"


import_service = ImportService()
