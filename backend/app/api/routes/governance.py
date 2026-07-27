from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_auth_service, get_current_user
from app.auth.service import AuthService, User
from app.core.database import get_db_session
from app.governance.repository import GovernanceRepository
from app.governance.schemas import (
    FocusedLineageResponse,
    GovernedResourceListResponse,
    GovernedResourceResponse,
    GovernedResourceSummary,
    GovernedResourceType,
    LineageDirection,
    LineageEdgeResponse,
    LineageNodeResponse,
    OperationLogListResponse,
    OperationLogResponse,
    ResourceStatus,
)
from app.governance.service import GovernanceService, GovernedResource
from app.projects.repository import ProjectRepository
from app.projects.service import ProjectService

router = APIRouter(prefix="/governance", tags=["governance"])


def get_governance_service(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> GovernanceService:
    return GovernanceService(
        GovernanceRepository(session),
        audit=AuditService(AuditRepository(session), actor_id=current_user.id),
    )


def get_project_service(
    session: Annotated[Session, Depends(get_db_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> ProjectService:
    return ProjectService(ProjectRepository(session), auth)


@router.get("/resources", response_model=GovernedResourceListResponse)
def list_governed_resources(
    current_user: Annotated[User, Depends(get_current_user)],
    governance: Annotated[GovernanceService, Depends(get_governance_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
    project_id: Annotated[str, Query()],
    status: Annotated[ResourceStatus | None, Query()] = None,
    resource_type: Annotated[GovernedResourceType | None, Query()] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
) -> GovernedResourceListResponse:
    projects.require_role(project_id, current_user, {"owner", "editor", "viewer"})
    items, summary = governance.list_resources(
        project_id=project_id,
        status=status,
        resource_type=resource_type,
        search=search,
    )
    return GovernedResourceListResponse(
        items=[to_resource_response(item) for item in items],
        summary=GovernedResourceSummary(**summary),
    )


@router.post(
    "/resources/{resource_type}/{resource_id}/archive",
    response_model=GovernedResourceResponse,
)
def archive_governed_resource(
    resource_type: GovernedResourceType,
    resource_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    governance: Annotated[GovernanceService, Depends(get_governance_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
    project_id: Annotated[str, Query()],
) -> GovernedResourceResponse:
    projects.require_role(project_id, current_user, {"owner", "editor"})
    return to_resource_response(
        governance.archive_resource(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            actor_id=current_user.id,
        )
    )


@router.post(
    "/resources/{resource_type}/{resource_id}/restore",
    response_model=GovernedResourceResponse,
)
def restore_governed_resource(
    resource_type: GovernedResourceType,
    resource_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    governance: Annotated[GovernanceService, Depends(get_governance_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
    project_id: Annotated[str, Query()],
) -> GovernedResourceResponse:
    projects.require_role(project_id, current_user, {"owner", "editor"})
    return to_resource_response(
        governance.restore_resource(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
    )


@router.get("/operations", response_model=OperationLogListResponse)
def list_operation_logs(
    current_user: Annotated[User, Depends(get_current_user)],
    governance: Annotated[GovernanceService, Depends(get_governance_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
    project_id: Annotated[str, Query()],
    action: Annotated[str | None, Query(max_length=80)] = None,
    resource_type: Annotated[str | None, Query(max_length=64)] = None,
    search: Annotated[str | None, Query(max_length=120)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> OperationLogListResponse:
    projects.require_role(project_id, current_user, {"owner", "editor", "viewer"})
    items, total = governance.list_operations(
        project_id=project_id,
        action=action,
        resource_type=resource_type,
        search=search,
        offset=offset,
        limit=limit,
    )
    return OperationLogListResponse(
        items=[OperationLogResponse(**item.__dict__) for item in items],
        total=total,
    )


@router.get("/lineage", response_model=FocusedLineageResponse)
def get_focused_lineage(
    current_user: Annotated[User, Depends(get_current_user)],
    governance: Annotated[GovernanceService, Depends(get_governance_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
    project_id: Annotated[str, Query()],
    resource_type: Annotated[GovernedResourceType, Query()],
    resource_id: Annotated[str, Query()],
    direction: Annotated[LineageDirection, Query()] = "both",
    max_depth: Annotated[int, Query(ge=1, le=5)] = 3,
) -> FocusedLineageResponse:
    projects.require_role(project_id, current_user, {"owner", "editor", "viewer"})
    root, nodes, edges = governance.focused_lineage(
        project_id=project_id,
        resource_type=resource_type,
        resource_id=resource_id,
        direction=direction,
        max_depth=max_depth,
    )
    return FocusedLineageResponse(
        root=LineageNodeResponse(**root.__dict__),
        nodes=[LineageNodeResponse(**node.__dict__) for node in nodes],
        edges=[LineageEdgeResponse(**edge.__dict__) for edge in edges],
        direction=direction,
        max_depth=max_depth,
    )


def to_resource_response(resource: GovernedResource) -> GovernedResourceResponse:
    return GovernedResourceResponse(**resource.__dict__)
