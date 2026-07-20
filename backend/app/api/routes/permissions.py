from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_user
from app.auth.service import User
from app.core.database import get_db_session
from app.permissions.repository import PermissionRepository
from app.permissions.schemas import (
    ResourcePermissionCreateRequest,
    ResourcePermissionResponse,
)
from app.permissions.service import PermissionService, ResourcePermission

router = APIRouter(prefix="/permissions", tags=["permissions"])


def get_permission_service(
    session: Annotated[Session, Depends(get_db_session)],
) -> PermissionService:
    return PermissionService(PermissionRepository(session))


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
    _current_user: Annotated[User, Depends(get_current_user)],
    permissions: Annotated[PermissionService, Depends(get_permission_service)],
) -> ResourcePermissionResponse:
    permission = permissions.create_from_request(payload)
    return to_permission_response(permission)


@router.get("/resources", response_model=list[ResourcePermissionResponse])
def list_resource_permissions(
    _current_user: Annotated[User, Depends(get_current_user)],
    permissions: Annotated[PermissionService, Depends(get_permission_service)],
    project_id: str = Query(),
) -> list[ResourcePermissionResponse]:
    return [
        to_permission_response(permission)
        for permission in permissions.list_resource_permissions(project_id)
    ]
