from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.config import get_settings
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
    DashboardUpdateRequest,
    ReportExportFormat,
    ReportExportListResponse,
)
from app.visualizations.service import (
    VisualizationService,
    to_dashboard_response,
    to_report_export_response,
)
from app.visualizations.storage import ReportExportStorage

router = APIRouter(prefix="/dashboards", tags=["dashboards"])


def get_visualization_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> VisualizationService:
    settings = get_settings()
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    data_views = DataViewService(DataViewRepository(session), audit=audit)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    return VisualizationService(
        repository=VisualizationRepository(session),
        data_views=data_views,
        audit=audit,
        tasks=tasks,
        report_export_storage=ReportExportStorage(settings.report_export_storage_root),
        created_by_id=current_user.id,
        max_export_rows_per_chart=settings.report_export_max_rows_per_chart,
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


@router.patch("/{dashboard_id}", response_model=DashboardResponse)
def update_dashboard(
    dashboard_id: str,
    payload: DashboardUpdateRequest,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
) -> DashboardResponse:
    return to_dashboard_response(visualizations.update_dashboard(dashboard_id, payload))


@router.post("/{dashboard_id}/exports")
def export_dashboard(
    dashboard_id: str,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
    format: ReportExportFormat = "pdf",
) -> Response:
    artifact, content = visualizations.export_dashboard(dashboard_id, format)
    return Response(
        content=content,
        media_type=artifact.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{artifact.file_name}"',
            "X-Report-Export-Id": artifact.id,
            "X-Source-Resource-Type": "dashboard",
            "X-Source-Resource-Id": artifact.dashboard_id,
        },
    )


@router.get("/{dashboard_id}/exports", response_model=ReportExportListResponse)
def list_dashboard_exports(
    dashboard_id: str,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
) -> ReportExportListResponse:
    return ReportExportListResponse(
        items=[
            to_report_export_response(item)
            for item in visualizations.list_report_exports(dashboard_id)
        ]
    )


@router.get("/{dashboard_id}/exports/{export_id}")
def download_dashboard_export(
    dashboard_id: str,
    export_id: str,
    visualizations: Annotated[VisualizationService, Depends(get_visualization_service)],
) -> Response:
    artifact, content = visualizations.read_report_export(dashboard_id, export_id)
    return Response(
        content=content,
        media_type=artifact.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{artifact.file_name}"',
            "X-Report-Export-Id": artifact.id,
            "X-Source-Resource-Type": "dashboard",
            "X-Source-Resource-Id": artifact.dashboard_id,
        },
    )
