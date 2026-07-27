from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

from app.audit.service import AuditService
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.ids import new_id
from app.imports.parser import (
    ImportGuardrails,
    ParsedTabularFile,
    open_parsed_tabular_path,
    parse_tabular_file,
    parse_tabular_path,
)
from app.imports.repository import ImportRepository
from app.imports.schemas import FilePreviewResponse, ImportFieldPreview, UploadedFileResponse
from app.imports.storage import LocalFileStorage
from app.models.imports import FileImportPreview as FileImportPreviewModel
from app.models.imports import UploadedFile as UploadedFileModel
from app.tasks.service import TaskService


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
        guardrails: ImportGuardrails | None = None,
    ) -> None:
        self.repository = repository
        self.uploader_id = uploader_id
        self.storage = storage
        self.audit = audit
        self.tasks = tasks
        self.guardrails = guardrails or import_guardrails_from_settings()
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
            if self.repository is not None:
                uploaded_file = self._stage_uploaded_file(
                    project_id=project_id,
                    file_name=file_name,
                    content=content,
                )
                return self._run_staged_preview(uploaded_file)
            return self._create_memory_preview(
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

    def create_file_preview_from_stream(
        self,
        *,
        project_id: str,
        file_name: str,
        stream: BinaryIO,
    ) -> FilePreview:
        if self.repository is None:
            return self.create_file_preview(
                project_id=project_id,
                file_name=file_name,
                content=stream.read(),
            )
        uploaded_file = self._stage_uploaded_file_stream(
            project_id=project_id,
            file_name=file_name,
            stream=stream,
        )
        try:
            return self._run_staged_preview(uploaded_file)
        except AppError:
            raise
        except Exception as error:
            raise AppError(
                "File could not be parsed. Check the file encoding or format and retry.",
                "file_parse_failed",
                400,
            ) from error

    def _create_memory_preview(
        self,
        *,
        project_id: str,
        file_name: str,
        content: bytes,
    ) -> FilePreview:
        parsed_file = parse_tabular_file(file_name, content, self.guardrails)
        preview = FilePreview(
            id=f"preview_{len(self._previews) + 1}",
            project_id=project_id,
            file_name=file_name,
            file_type=parsed_file.file_type,
            row_count=parsed_file.row_count,
            fields=parsed_file.fields,
            sample_rows=parsed_file.sample_rows,
            upload_status="parsed",
        )
        self._previews[preview.id] = preview
        return preview

    def create_preview_from_uploaded_file(
        self,
        uploaded_file_id: str,
        *,
        task_id: str | None = None,
    ) -> FilePreview:
        if self.repository is None:
            raise AppError("Uploaded file storage is not configured", "upload_storage_missing", 500)

        uploaded_file = self.repository.get_uploaded_file(uploaded_file_id)
        if uploaded_file is None:
            raise AppError("Uploaded file not found", "uploaded_file_not_found", 404)
        return self._run_staged_preview(uploaded_file, task_id=task_id)

    def _run_staged_preview(
        self,
        uploaded_file: UploadedFileModel,
        *,
        task_id: str | None = None,
    ) -> FilePreview:
        owns_task = self.tasks is not None and task_id is None
        if owns_task:
            task = self.tasks.create_task(
                project_id=uploaded_file.project_id,
                name=f"Parse file preview: {uploaded_file.file_name}",
                task_type="file_preview_parse",
                related_resource_type="uploaded_file",
                related_resource_id=uploaded_file.id,
            )
            task_id = task.id
            self.tasks.mark_running(task_id, progress=10)
        try:
            preview = self._create_preview_from_uploaded_file(uploaded_file, task_id=task_id)
        except Exception as error:
            self._mark_uploaded_file_failed(uploaded_file, error, record_task=task_id is None)
            if owns_task and task_id is not None:
                retry_payload = (
                    None
                    if isinstance(error, AppError)
                    else {
                        "operation": "file_preview_parse",
                        "uploaded_file_id": uploaded_file.id,
                    }
                )
                self.tasks.mark_exception(task_id, error, retry_payload=retry_payload)
            raise
        if owns_task and task_id is not None:
            self.tasks.mark_success(
                task_id,
                related_resource_type="file_import_preview",
                related_resource_id=preview.id,
            )
        return preview

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

    def _stage_uploaded_file_stream(
        self,
        *,
        project_id: str,
        file_name: str,
        stream: BinaryIO,
    ) -> UploadedFileModel:
        uploaded_file_id = new_id("file")
        storage = self.storage or default_local_file_storage()
        storage_path, size_bytes = storage.save_upload_stream(
            project_id=project_id,
            uploaded_file_id=uploaded_file_id,
            file_name=file_name,
            stream=stream,
        )
        return self.repository.save_uploaded_file(
            UploadedFileModel(
                id=uploaded_file_id,
                project_id=project_id,
                uploader_id=self.uploader_id or "usr_unknown",
                file_name=file_name,
                file_type=file_type_from_name(file_name),
                storage_path=storage_path,
                size_bytes=size_bytes,
                status="pending",
                error_message=None,
            )
        )

    def _create_preview_from_uploaded_file(
        self,
        uploaded_file: UploadedFileModel,
        *,
        task_id: str | None = None,
    ) -> FilePreview:
        storage_path = Path(uploaded_file.storage_path)
        if not storage_path.exists():
            raise AppError(
                message="Uploaded source file not found in storage",
                code="uploaded_source_file_missing",
                status_code=409,
            )

        self._update_task_progress(task_id, 25)
        parsed_file = parse_tabular_path(
            uploaded_file.file_name,
            storage_path,
            self.guardrails,
        )
        self._update_task_progress(task_id, 75)
        preview_id = new_id("preview")
        preview = FilePreview(
            id=preview_id,
            project_id=uploaded_file.project_id,
            file_name=uploaded_file.file_name,
            file_type=parsed_file.file_type,
            row_count=parsed_file.row_count,
            fields=parsed_file.fields,
            sample_rows=parsed_file.sample_rows,
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
        self._update_task_progress(task_id, 90)
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
                row_count=preview.row_count,
                sample_rows=preview.sample_rows,
                row_iterator_factory=lambda: iter(preview.sample_rows),
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

        return open_parsed_tabular_path(
            file_name=uploaded_file.file_name,
            path=storage_path,
            fields=preview.fields,
            row_count=preview.row_count,
            sample_rows=preview.sample_rows,
            guardrails=self.guardrails,
        )

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
        storage = self.storage or default_local_file_storage()
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
        *,
        record_task: bool = True,
    ) -> None:
        uploaded_file.status = "failed"
        uploaded_file.error_message = str(error) or error.__class__.__name__
        self.repository.update_uploaded_file(uploaded_file)
        if record_task:
            self._record_staged_preview_failure(
                project_id=uploaded_file.project_id,
                file_name=uploaded_file.file_name,
                uploaded_file_id=uploaded_file.id,
                error=error,
            )

    def _update_task_progress(self, task_id: str | None, progress: int) -> None:
        if self.tasks is not None and task_id is not None:
            self.tasks.update_progress(task_id, progress)


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


def import_guardrails_from_settings() -> ImportGuardrails:
    settings = get_settings()
    return ImportGuardrails(
        max_file_size_bytes=settings.import_max_file_size_bytes,
        max_rows=settings.import_max_rows,
        parse_timeout_seconds=settings.import_parse_timeout_seconds,
        inference_sample_size=settings.import_inference_sample_size,
        preview_sample_size=settings.import_preview_sample_size,
    )


def default_local_file_storage() -> LocalFileStorage:
    settings = get_settings()
    return LocalFileStorage(
        settings.upload_storage_root,
        chunk_size_bytes=settings.import_storage_chunk_size_bytes,
    )


import_service = ImportService()
