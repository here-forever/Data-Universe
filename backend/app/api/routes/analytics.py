from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.analytics.definitions import (
    AnalysisDefinitionService,
    to_analysis_definition_response,
)
from app.analytics.exporter import (
    export_analysis_csv,
    export_analysis_xlsx,
    safe_export_filename,
)
from app.analytics.repository import AnalysisDefinitionRepository
from app.analytics.schemas import (
    AnalysisDefinitionCreateRequest,
    AnalysisDefinitionListResponse,
    AnalysisDefinitionResponse,
    AnalysisDefinitionRunResponse,
    AnalysisMaterializeRequest,
    AnalysisRequest,
    AnalysisResponse,
    CorrelationRequest,
    CorrelationResponse,
    RegressionRequest,
    RegressionResponse,
    StatisticsRequest,
    StatisticsResponse,
)
from app.analytics.service import AnalyticsService
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
from app.imports.repository import ImportRepository
from app.imports.service import ImportService
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService

router = APIRouter(prefix="/analytics", tags=["analytics"])


def get_analytics_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AnalyticsService:
    datasets = DatasetService(
        DatasetRepository(session),
        ImportService(ImportRepository(session)),
    )
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    return AnalyticsService(datasets, audit)


def get_analysis_definition_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> AnalysisDefinitionService:
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    datasets = DatasetService(
        DatasetRepository(session),
        ImportService(ImportRepository(session)),
    )
    data_views = DataViewService(DataViewRepository(session), audit=audit)
    tasks = TaskService(TaskRepository(session), initiator_id=current_user.id)
    analytics = AnalyticsService(datasets, audit)
    return AnalysisDefinitionService(
        analytics=analytics,
        datasets=datasets,
        data_views=data_views,
        repository=AnalysisDefinitionRepository(session),
        audit=audit,
        tasks=tasks,
    )


@router.post(
    "/definitions",
    response_model=AnalysisDefinitionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_analysis_definition(
    payload: AnalysisDefinitionCreateRequest,
    definitions: Annotated[
        AnalysisDefinitionService,
        Depends(get_analysis_definition_service),
    ],
) -> AnalysisDefinitionResponse:
    return to_analysis_definition_response(definitions.create_definition(payload))


@router.get("/definitions", response_model=AnalysisDefinitionListResponse)
def list_analysis_definitions(
    project_id: str,
    definitions: Annotated[
        AnalysisDefinitionService,
        Depends(get_analysis_definition_service),
    ],
) -> AnalysisDefinitionListResponse:
    return AnalysisDefinitionListResponse(
        items=[
            to_analysis_definition_response(definition)
            for definition in definitions.list_definitions(project_id)
        ]
    )


@router.get("/definitions/{definition_id}", response_model=AnalysisDefinitionResponse)
def get_analysis_definition(
    definition_id: str,
    definitions: Annotated[
        AnalysisDefinitionService,
        Depends(get_analysis_definition_service),
    ],
) -> AnalysisDefinitionResponse:
    return to_analysis_definition_response(definitions.get_definition(definition_id))


@router.post(
    "/definitions/{definition_id}/run",
    response_model=AnalysisDefinitionRunResponse,
)
def run_analysis_definition(
    definition_id: str,
    definitions: Annotated[
        AnalysisDefinitionService,
        Depends(get_analysis_definition_service),
    ],
) -> AnalysisDefinitionRunResponse:
    result = definitions.run_definition(definition_id)
    return AnalysisDefinitionRunResponse(
        definition=to_analysis_definition_response(result.definition),
        aggregate=result.aggregate,
        statistics=result.statistics,
        correlation=result.correlation,
        regression=result.regression,
    )


@router.post(
    "/definitions/{definition_id}/materialize",
    response_model=DataViewResponse,
    status_code=status.HTTP_201_CREATED,
)
def materialize_analysis_definition(
    definition_id: str,
    payload: AnalysisMaterializeRequest,
    definitions: Annotated[
        AnalysisDefinitionService,
        Depends(get_analysis_definition_service),
    ],
) -> DataViewResponse:
    return to_data_view_response(definitions.materialize_result(definition_id, payload))


@router.post("/datasets/{dataset_id}/aggregate", response_model=AnalysisResponse)
def aggregate_dataset(
    dataset_id: str,
    payload: AnalysisRequest,
    analytics: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> AnalysisResponse:
    return analytics.aggregate(dataset_id, payload)


@router.post("/datasets/{dataset_id}/statistics", response_model=StatisticsResponse)
def calculate_statistics(
    dataset_id: str,
    payload: StatisticsRequest,
    analytics: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> StatisticsResponse:
    return analytics.statistics(dataset_id, payload)


@router.post("/datasets/{dataset_id}/correlation", response_model=CorrelationResponse)
def calculate_correlation(
    dataset_id: str,
    payload: CorrelationRequest,
    analytics: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> CorrelationResponse:
    return analytics.correlation(dataset_id, payload)


@router.post("/datasets/{dataset_id}/linear-regression", response_model=RegressionResponse)
def calculate_linear_regression(
    dataset_id: str,
    payload: RegressionRequest,
    analytics: Annotated[AnalyticsService, Depends(get_analytics_service)],
) -> RegressionResponse:
    return analytics.linear_regression(dataset_id, payload)


@router.post("/datasets/{dataset_id}/export")
def export_analysis(
    dataset_id: str,
    payload: AnalysisRequest,
    analytics: Annotated[AnalyticsService, Depends(get_analytics_service)],
    format: Literal["csv", "xlsx"] = "xlsx",
) -> Response:
    result = analytics.aggregate(dataset_id, payload)
    content = export_analysis_csv(result) if format == "csv" else export_analysis_xlsx(result)
    media_type = (
        "text/csv; charset=utf-8"
        if format == "csv"
        else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    analytics.record_export(dataset_id, result, format)
    filename = safe_export_filename(result.dataset_name, format)
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
