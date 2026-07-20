from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.cleaning.repository import CleaningRepository
from app.cleaning.schemas import (
    CleaningExecuteRequest,
    CleaningExecuteResponse,
    CleaningPreviewRequest,
    CleaningPreviewResponse,
    CleaningRecipeCreateRequest,
    CleaningRecipeListResponse,
    CleaningRecipeResponse,
)
from app.cleaning.service import CleaningService
from app.core.database import get_db_session
from app.datasets.repository import DatasetRepository
from app.datasets.service import DatasetService
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService

router = APIRouter(prefix="/cleaning", tags=["cleaning"])


def get_cleaning_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> CleaningService:
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    datasets = DatasetService(DatasetRepository(session), audit=audit, tasks=tasks)
    return CleaningService(
        CleaningRepository(session),
        datasets=datasets,
        audit=audit,
        tasks=tasks,
    )


@router.post(
    "/recipes",
    response_model=CleaningRecipeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_recipe(
    payload: CleaningRecipeCreateRequest,
    cleaning: Annotated[CleaningService, Depends(get_cleaning_service)],
) -> CleaningRecipeResponse:
    return cleaning.create_recipe(payload)


@router.get("/recipes", response_model=CleaningRecipeListResponse)
def list_recipes(
    project_id: str,
    cleaning: Annotated[CleaningService, Depends(get_cleaning_service)],
) -> CleaningRecipeListResponse:
    return cleaning.list_recipes(project_id)


@router.get("/recipes/{recipe_id}", response_model=CleaningRecipeResponse)
def get_recipe(
    recipe_id: str,
    cleaning: Annotated[CleaningService, Depends(get_cleaning_service)],
) -> CleaningRecipeResponse:
    return cleaning.get_recipe(recipe_id)


@router.post("/preview", response_model=CleaningPreviewResponse)
def preview_cleaning(
    payload: CleaningPreviewRequest,
    cleaning: Annotated[CleaningService, Depends(get_cleaning_service)],
) -> CleaningPreviewResponse:
    return cleaning.preview(payload)


@router.post("/recipes/{recipe_id}/execute", response_model=CleaningExecuteResponse)
def execute_recipe(
    recipe_id: str,
    payload: CleaningExecuteRequest,
    cleaning: Annotated[CleaningService, Depends(get_cleaning_service)],
) -> CleaningExecuteResponse:
    return cleaning.execute_recipe(recipe_id=recipe_id, payload=payload)
