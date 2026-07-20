from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.database import get_db_session
from app.data_views.repository import DataViewRepository
from app.data_views.schemas import DataViewResponse
from app.data_views.service import DataViewService, to_data_view_response
from app.datasets.repository import DatasetRepository
from app.datasets.service import DatasetService
from app.sql_workspace.schemas import (
    SqlRunRequest,
    SqlRunResponse,
    SqlSaveDataViewRequest,
    SqlWorkspaceMetadataResponse,
)
from app.sql_workspace.service import SqlWorkspaceService
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService

router = APIRouter(prefix="/sql", tags=["sql"])


def get_sql_workspace_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SqlWorkspaceService:
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    datasets = DatasetService(DatasetRepository(session), audit=audit)
    data_views = DataViewService(DataViewRepository(session), audit=audit)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    return SqlWorkspaceService(
        session=session,
        datasets=datasets,
        data_views=data_views,
        audit=audit,
        tasks=tasks,
    )


@router.get("/metadata", response_model=SqlWorkspaceMetadataResponse)
def get_sql_metadata(
    project_id: str,
    sql_workspace: Annotated[SqlWorkspaceService, Depends(get_sql_workspace_service)],
) -> SqlWorkspaceMetadataResponse:
    return sql_workspace.metadata(project_id)


@router.post("/run", response_model=SqlRunResponse)
def run_sql(
    payload: SqlRunRequest,
    sql_workspace: Annotated[SqlWorkspaceService, Depends(get_sql_workspace_service)],
) -> SqlRunResponse:
    return sql_workspace.run(payload)


@router.post("/save-data-view", response_model=DataViewResponse)
def save_sql_as_data_view(
    payload: SqlSaveDataViewRequest,
    sql_workspace: Annotated[SqlWorkspaceService, Depends(get_sql_workspace_service)],
) -> DataViewResponse:
    return to_data_view_response(sql_workspace.save_as_data_view(payload))
