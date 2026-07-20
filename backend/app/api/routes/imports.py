from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.config import get_settings
from app.core.database import get_db_session
from app.imports.repository import ImportRepository
from app.imports.schemas import FilePreviewResponse, UploadedFileListResponse
from app.imports.service import ImportService, to_file_preview_response, to_uploaded_file_response
from app.imports.storage import LocalFileStorage
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService

router = APIRouter(prefix="/imports", tags=["imports"])


def get_import_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ImportService:
    settings = get_settings()
    return ImportService(
        ImportRepository(session),
        uploader_id=current_user.id,
        storage=LocalFileStorage(settings.upload_storage_root),
        audit=AuditService(AuditRepository(session), actor_id=current_user.id),
        tasks=TaskService(TaskRepository(session), initiator_id=current_user.id),
    )


@router.get("/uploads", response_model=UploadedFileListResponse)
def list_uploaded_files(
    project_id: str,
    imports: Annotated[ImportService, Depends(get_import_service)],
) -> UploadedFileListResponse:
    return UploadedFileListResponse(
        items=[
            to_uploaded_file_response(uploaded_file)
            for uploaded_file in imports.list_uploaded_files(project_id)
        ]
    )


@router.get("/file-previews/{preview_id}", response_model=FilePreviewResponse)
def get_file_preview(
    preview_id: str,
    imports: Annotated[ImportService, Depends(get_import_service)],
) -> FilePreviewResponse:
    return to_file_preview_response(imports.require_preview(preview_id))


@router.post(
    "/file-previews",
    response_model=FilePreviewResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_file_preview(
    project_id: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    imports: Annotated[ImportService, Depends(get_import_service)],
) -> FilePreviewResponse:
    content = await file.read()
    preview = imports.create_file_preview(
        project_id=project_id,
        file_name=file.filename or "uploaded_file",
        content=content,
    )
    return to_file_preview_response(preview)
