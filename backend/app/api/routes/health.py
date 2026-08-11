import os
from pathlib import Path

from fastapi import APIRouter, Depends, Response, status
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.database import get_db_session

router = APIRouter(tags=["system"])


class HealthResponse(BaseModel):
    status: str
    system: str = "vibe-data-universe"
    version: str
    checks: dict[str, str] | None = None


@router.get("/health", response_model=HealthResponse)
@router.get("/health/live", response_model=HealthResponse)
def liveness(settings: Settings = Depends(get_settings)) -> HealthResponse:
    return HealthResponse(status="ok", version=settings.app_version)


@router.get(
    "/health/ready",
    response_model=HealthResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: {"model": HealthResponse}},
)
def readiness(
    session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> HealthResponse | Response:
    checks: dict[str, str] = {}
    try:
        session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except SQLAlchemyError:
        checks["database"] = "unavailable"

    for name, raw_path in (
        ("datasets", settings.data_storage_root),
        ("exports", settings.export_storage_root),
    ):
        path = Path(raw_path)
        checks[name] = "ok" if path.is_dir() and os.access(path, os.W_OK) else "unavailable"

    payload = HealthResponse(
        status="ready" if all(value == "ok" for value in checks.values()) else "not_ready",
        version=settings.app_version,
        checks=checks,
    )
    if payload.status == "ready":
        return payload
    return Response(
        content=payload.model_dump_json(),
        media_type="application/json",
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    )


@router.get("/metrics", include_in_schema=False)
def metrics() -> Response:
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
