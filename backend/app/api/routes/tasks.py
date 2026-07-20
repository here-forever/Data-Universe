from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.cleaning.repository import CleaningRepository
from app.cleaning.service import CleaningService
from app.core.database import get_db_session
from app.data_sources.repository import DataSourceRepository
from app.data_sources.service import DataSourceService
from app.data_views.repository import DataViewRepository
from app.data_views.service import DataViewService
from app.datasets.repository import DatasetRepository
from app.datasets.service import DatasetService
from app.imports.repository import ImportRepository
from app.imports.service import ImportService
from app.sql_workspace.service import SqlWorkspaceService
from app.tasks.repository import TaskRepository
from app.tasks.retry_executor import TaskRetryExecutor
from app.tasks.schemas import TaskListResponse, TaskRetryResponse
from app.tasks.service import TaskService, to_task_response
from app.visualizations.repository import VisualizationRepository
from app.visualizations.service import VisualizationService

router = APIRouter(prefix="/tasks", tags=["tasks"])


def get_task_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TaskService:
    return TaskService(TaskRepository(session), initiator_id=current_user.id)


def get_task_retry_executor(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> TaskRetryExecutor:
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    imports = ImportService(ImportRepository(session), uploader_id=current_user.id)
    datasets = DatasetService(
        DatasetRepository(session),
        imports=imports,
        audit=audit,
        tasks=None,
    )
    data_sources = DataSourceService(DataSourceRepository(session), audit=audit)
    data_views = DataViewService(DataViewRepository(session), audit=audit)
    cleaning = CleaningService(
        CleaningRepository(session),
        datasets=datasets,
        audit=audit,
        tasks=None,
    )
    sql_workspace = SqlWorkspaceService(
        session=session,
        datasets=datasets,
        data_views=data_views,
        audit=audit,
        tasks=None,
    )
    visualizations = VisualizationService(
        repository=VisualizationRepository(session),
        data_views=data_views,
        audit=audit,
        tasks=None,
    )
    return TaskRetryExecutor(
        tasks=tasks,
        imports=imports,
        datasets=datasets,
        data_sources=data_sources,
        cleaning=cleaning,
        sql_workspace=sql_workspace,
        visualizations=visualizations,
    )


@router.get("", response_model=TaskListResponse)
def list_tasks(
    tasks: Annotated[TaskService, Depends(get_task_service)],
    project_id: str | None = None,
) -> TaskListResponse:
    return TaskListResponse(items=[to_task_response(task) for task in tasks.list_tasks(project_id)])


@router.post("/{task_id}/retry", response_model=TaskRetryResponse)
def retry_task(
    task_id: str,
    retry_executor: Annotated[TaskRetryExecutor, Depends(get_task_retry_executor)],
) -> TaskRetryResponse:
    result = retry_executor.retry(task_id)
    return TaskRetryResponse(
        original_task=to_task_response(result.original_task),
        retry_task=to_task_response(result.retry_task),
    )
