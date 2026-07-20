from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.database import get_db_session
from app.data_views.repository import DataViewRepository
from app.data_views.service import DataViewService
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService
from app.visualizations.repository import VisualizationRepository
from app.visualizations.schemas import (
    DashboardCreateRequest,
    DashboardListResponse,
    DashboardResponse,
)
from app.visualizations.service import VisualizationService, to_dashboard_response

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


def get_visualization_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> VisualizationService:
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    data_views = DataViewService(DataViewRepository(session), audit=audit)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    return VisualizationService(
        repository=VisualizationRepository(session),
        data_views=data_views,
        audit=audit,
        tasks=tasks,
    )


@router.post("", response_model=DashboardResponse, status_code=status.HTTP_201_CREATED)
def create_dashboard(
    payload: DashboardCreateRequest,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
) -> DashboardResponse:
    return to_dashboard_response(visualizations.create_dashboard(payload))


@router.get("", response_model=DashboardListResponse)
def list_dashboards(
    project_id: str,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
) -> DashboardListResponse:
    return DashboardListResponse(
        items=[
            to_dashboard_response(dashboard)
            for dashboard in visualizations.list_dashboards(project_id)
        ]
    )


@router.get("/{dashboard_id}", response_model=DashboardResponse)
def get_dashboard(
    dashboard_id: str,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
) -> DashboardResponse:
    return to_dashboard_response(visualizations.get_dashboard(dashboard_id))
