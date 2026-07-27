from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_auth_service, get_current_user
from app.auth.service import AuthService, User
from app.core.database import get_db_session
from app.permissions.repository import PermissionRepository
from app.permissions.schemas import (
    ResourcePermissionCreateRequest,
    ResourcePermissionResponse,
)
from app.permissions.service import PermissionService, ResourcePermission
from app.projects.repository import ProjectRepository
from app.projects.service import ProjectService

router = APIRouter(prefix="/permissions", tags=["permissions"])


def get_permission_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> PermissionService:
    return PermissionService(PermissionRepository(session))


def get_project_service(
    session: Annotated[Session, Depends(get_db_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> ProjectService:
    return ProjectService(ProjectRepository(session), auth)


def to_permission_response(permission: ResourcePermission) -> ResourcePermissionResponse:
    return ResourcePermissionResponse(
        id=permission.id,
        project_id=permission.project_id,
        resource_type=permission.resource_type,
        resource_id=permission.resource_id,
        principal_type=permission.principal_type,
        principal_id=permission.principal_id,
        actions=permission.actions,
    )


@router.post(
    "/resources",
    response_model=ResourcePermissionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_resource_permission(
    payload: ResourcePermissionCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    permissions: Annotated[PermissionService, Depends(get_permission_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> ResourcePermissionResponse:
    projects.require_role(payload.project_id, current_user, {"owner"})
    permission = permissions.create_from_request(payload)
    return to_permission_response(permission)


@router.get("/resources", response_model=list[ResourcePermissionResponse])
def list_resource_permissions(
    current_user: Annotated[User, Depends(get_current_user)],
    permissions: Annotated[PermissionService, Depends(get_permission_service)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
    project_id: str = Query(),
) -> list[ResourcePermissionResponse]:
    projects.require_role(project_id, current_user, {"owner", "editor", "viewer"})
    return [
        to_permission_response(permission)
        for permission in permissions.list_resource_permissions(project_id)
    ]
