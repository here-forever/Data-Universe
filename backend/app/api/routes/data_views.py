from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.database import get_db_session
from app.data_views.repository import DataViewRepository
from app.data_views.schemas import (
    DataViewCreateRequest,
    DataViewListResponse,
    DataViewPreviewResponse,
    DataViewResponse,
)
from app.data_views.service import DataViewService, to_data_view_response

router = APIRouter(prefix="/data-views", tags=["data-views"])


def get_data_view_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DataViewService:
    audit = AuditService(AuditRepository(session), actor_id=current_user.id)
    return DataViewService(DataViewRepository(session), audit=audit)


@router.post("", response_model=DataViewResponse, status_code=status.HTTP_201_CREATED)
def create_data_view(
    payload: DataViewCreateRequest,
    data_views: Annotated[DataViewService, Depends(get_data_view_service)],
) -> DataViewResponse:
    return to_data_view_response(data_views.create_data_view(payload))


@router.get("", response_model=DataViewListResponse)
def list_data_views(
    project_id: str,
    data_views: Annotated[DataViewService, Depends(get_data_view_service)],
) -> DataViewListResponse:
    return DataViewListResponse(
        items=[
            to_data_view_response(data_view) for data_view in data_views.list_data_views(project_id)
        ]
    )


@router.get("/{data_view_id}", response_model=DataViewResponse)
def get_data_view(
    data_view_id: str,
    data_views: Annotated[DataViewService, Depends(get_data_view_service)],
) -> DataViewResponse:
    return to_data_view_response(data_views.get_data_view(data_view_id))


@router.get("/{data_view_id}/preview", response_model=DataViewPreviewResponse)
def preview_data_view(
    data_view_id: str,
    data_views: Annotated[DataViewService, Depends(get_data_view_service)],
    page: int = 1,
    page_size: int = 50,
) -> DataViewPreviewResponse:
    data_view, rows = data_views.preview_data_view_rows(
        data_view_id=data_view_id,
        page=page,
        page_size=page_size,
    )
    return DataViewPreviewResponse(
        data_view=to_data_view_response(data_view),
        page=page,
        page_size=page_size,
        total_rows=data_view.row_count,
        rows=rows,
    )
