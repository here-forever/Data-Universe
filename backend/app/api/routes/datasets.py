from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.database import get_db_session
from app.datasets.repository import DatasetRepository
from app.datasets.schemas import (
    DatasetCreateRequest,
    DatasetListResponse,
    DatasetPreviewResponse,
    DatasetQualityResponse,
    DatasetResponse,
)
from app.datasets.service import Dataset, DatasetService, dataset_to_response_shape
from app.imports.repository import ImportRepository
from app.imports.service import ImportService
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService

router = APIRouter(prefix="/datasets", tags=["datasets"])


def get_dataset_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DatasetService:
    imports = ImportService(ImportRepository(session))
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    return DatasetService(DatasetRepository(session), imports, audit=audit, tasks=tasks)


def to_dataset_response(dataset: Dataset) -> DatasetResponse:
    return dataset_to_response_shape(dataset)


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(
    payload: DatasetCreateRequest,
    datasets: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetResponse:
    dataset = datasets.create_dataset(payload)
    return to_dataset_response(dataset)


@router.get("", response_model=DatasetListResponse)
def list_datasets(
    project_id: str,
    datasets: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetListResponse:
    return DatasetListResponse(
        items=[to_dataset_response(dataset) for dataset in datasets.list_datasets(project_id)]
    )


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: str,
    datasets: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetResponse:
    return to_dataset_response(datasets.get_dataset(dataset_id))


@router.get("/{dataset_id}/preview", response_model=DatasetPreviewResponse)
def preview_dataset(
    dataset_id: str,
    datasets: Annotated[DatasetService, Depends(get_dataset_service)],
    page: int = 1,
    page_size: int = 50,
) -> DatasetPreviewResponse:
    dataset, rows = datasets.preview_dataset_rows(
        dataset_id=dataset_id,
        page=page,
        page_size=page_size,
    )
    return DatasetPreviewResponse(
        dataset=to_dataset_response(dataset),
        page=page,
        page_size=page_size,
        total_rows=dataset.row_count,
        rows=rows,
    )


@router.get("/{dataset_id}/quality", response_model=DatasetQualityResponse)
def profile_dataset_quality(
    dataset_id: str,
    datasets: Annotated[DatasetService, Depends(get_dataset_service)],
) -> DatasetQualityResponse:
    return datasets.profile_dataset_quality(dataset_id)
