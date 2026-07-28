from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.insights.schemas import (
    AdvancedRequest,
    AnalysisRunResponse,
    AskRequest,
    AskResponse,
    ExploreRequest,
    ExploreResponse,
    LlmConfig,
    LlmConnectionResponse,
)
from app.insights.service import InsightService

router = APIRouter(prefix="/insights", tags=["insights"])


def service(session: Session = Depends(get_db_session)) -> InsightService:
    return InsightService(session)


@router.post("/llm/check", response_model=LlmConnectionResponse)
def check_llm_connection(
    payload: LlmConfig,
    insight_service: InsightService = Depends(service),
) -> LlmConnectionResponse:
    return insight_service.check_llm(payload)


@router.post("/{dataset_id}/explore", response_model=ExploreResponse)
def explore_dataset(
    dataset_id: str,
    payload: ExploreRequest | None = None,
    insight_service: InsightService = Depends(service),
) -> ExploreResponse:
    return insight_service.explore(dataset_id, payload)


@router.post("/{dataset_id}/ask", response_model=AskResponse)
def ask_dataset(
    dataset_id: str,
    payload: AskRequest,
    insight_service: InsightService = Depends(service),
) -> AskResponse:
    return insight_service.ask(dataset_id, payload)


@router.post("/{dataset_id}/advanced", response_model=AnalysisRunResponse)
def advanced_analysis(
    dataset_id: str,
    payload: AdvancedRequest,
    insight_service: InsightService = Depends(service),
) -> AnalysisRunResponse:
    return insight_service.advanced(dataset_id, payload)


@router.get("/{dataset_id}/history", response_model=list[AnalysisRunResponse])
def analysis_history(
    dataset_id: str,
    insight_service: InsightService = Depends(service),
) -> list[AnalysisRunResponse]:
    return insight_service.history(dataset_id)
