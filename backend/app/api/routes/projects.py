from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.dependencies import get_auth_service, get_current_user
from app.auth.service import AuthService, User
from app.core.database import get_db_session
from app.projects.repository import ProjectRepository
from app.projects.schemas import (
    ProjectCreateRequest,
    ProjectMemberCreateRequest,
    ProjectMemberRemoveResponse,
    ProjectMemberResponse,
    ProjectMemberUpdateRequest,
    ProjectResponse,
)
from app.projects.service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_service(
    session: Annotated[Session, Depends(get_db_session)],
    auth: Annotated[AuthService, Depends(get_auth_service)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ProjectService:
    return ProjectService(
        ProjectRepository(session),
        auth,
        audit=AuditService(AuditRepository(session), actor_id=current_user.id),
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectResponse:
    project = projects.create_project(
        name=payload.name,
        description=payload.description,
        owner=current_user,
    )
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        role="owner",
    )


@router.get("", response_model=list[ProjectResponse])
def list_projects(
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> list[ProjectResponse]:
    return [
        ProjectResponse(
            id=project.id,
            name=project.name,
            description=project.description,
            owner_id=project.owner_id,
            role=role,
        )
        for project, role in projects.list_projects_for_user(current_user)
    ]


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_project_member(
    project_id: str,
    payload: ProjectMemberCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectMemberResponse:
    user, role = projects.add_member(
        project_id=project_id,
        email=payload.email,
        role=payload.role,
        actor=current_user,
    )
    return ProjectMemberResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=role,
    )


@router.get("/{project_id}/members", response_model=list[ProjectMemberResponse])
def list_project_members(
    project_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> list[ProjectMemberResponse]:
    return [
        ProjectMemberResponse(
            user_id=user.id,
            email=user.email,
            display_name=user.display_name,
            role=role,
        )
        for user, role in projects.list_members(project_id, actor=current_user)
    ]


@router.patch(
    "/{project_id}/members/{user_id}",
    response_model=ProjectMemberResponse,
)
def update_project_member(
    project_id: str,
    user_id: str,
    payload: ProjectMemberUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectMemberResponse:
    user, role = projects.update_member(
        project_id=project_id,
        user_id=user_id,
        role=payload.role,
        actor=current_user,
    )
    return ProjectMemberResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=role,
    )


@router.delete(
    "/{project_id}/members/{user_id}",
    response_model=ProjectMemberRemoveResponse,
)
def remove_project_member(
    project_id: str,
    user_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    projects: Annotated[ProjectService, Depends(get_project_service)],
) -> ProjectMemberRemoveResponse:
    removed_user = projects.remove_member(
        project_id=project_id,
        user_id=user_id,
        actor=current_user,
    )
    return ProjectMemberRemoveResponse(user_id=removed_user.id, removed=True)
