from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session
from app.data.parser import spool_upload
from app.data.schemas import (
    CleaningRequest,
    DatasetDetail,
    DatasetSummary,
    ParticleRequest,
    ParticleResponse,
    RowPage,
)
from app.data.service import DatasetService

router = APIRouter(prefix="/datasets", tags=["datasets"])


def service(session: Session = Depends(get_db_session)) -> DatasetService:
    return DatasetService(session)


@router.get("", response_model=list[DatasetSummary])
def list_datasets(dataset_service: DatasetService = Depends(service)) -> list[DatasetSummary]:
    return dataset_service.list_datasets()


@router.post("/upload", response_model=DatasetDetail, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    settings: Settings = Depends(get_settings),
    dataset_service: DatasetService = Depends(service),
) -> DatasetDetail:
    content = await spool_upload(file, settings)
    try:
        return dataset_service.create_upload(file.filename or "dataset.csv", content, name)
    finally:
        content.close()


@router.post("/demo", response_model=DatasetDetail, status_code=status.HTTP_201_CREATED)
def create_demo(dataset_service: DatasetService = Depends(service)) -> DatasetDetail:
    return dataset_service.create_demo()


@router.get("/{dataset_id}", response_model=DatasetDetail)
def dataset_detail(
    dataset_id: str,
    dataset_service: DatasetService = Depends(service),
) -> DatasetDetail:
    return dataset_service.detail(dataset_id)


@router.get("/{dataset_id}/rows", response_model=RowPage)
def dataset_rows(
    dataset_id: str,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    dataset_service: DatasetService = Depends(service),
) -> RowPage:
    return dataset_service.rows(dataset_id, offset, limit)


@router.post("/{dataset_id}/clean", response_model=DatasetDetail)
def clean_dataset(
    dataset_id: str,
    payload: CleaningRequest,
    dataset_service: DatasetService = Depends(service),
) -> DatasetDetail:
    return dataset_service.clean(dataset_id, payload)


@router.post("/{dataset_id}/particles", response_model=ParticleResponse)
def dataset_particles(
    dataset_id: str,
    payload: ParticleRequest,
    dataset_service: DatasetService = Depends(service),
) -> ParticleResponse:
    return dataset_service.particles(dataset_id, payload)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: str,
    dataset_service: DatasetService = Depends(service),
) -> Response:
    dataset_service.delete(dataset_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
