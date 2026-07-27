from dataclasses import dataclass

from app.audit.service import AuditService
from app.auth.service import AuthService, User, auth_service
from app.core.errors import AppError
from app.core.ids import new_id
from app.models.project import Project as ProjectModel
from app.models.project import ProjectMember as ProjectMemberModel
from app.projects.repository import ProjectRepository
from app.projects.schemas import ManagedProjectRole, ProjectRole


@dataclass(frozen=True)
class Project:
    id: str
    name: str
    description: str | None
    owner_id: str


@dataclass(frozen=True)
class ProjectMember:
    project_id: str
    user_id: str
    role: ProjectRole


class ProjectService:
    def __init__(
        self,
        repository: ProjectRepository | None = None,
        user_service: AuthService = auth_service,
        audit: AuditService | None = None,
    ) -> None:
        self.repository = repository
        self.user_service = user_service
        self.audit = audit or AuditService()
        self._projects: dict[str, Project] = {}
        self._members: list[ProjectMember] = []
        self.reset()

    def reset(self) -> None:
        self._projects = {}
        self._members = []

    def create_project(self, *, name: str, description: str | None, owner: User) -> Project:
        if self.repository is not None:
            project = ProjectModel(
                id=new_id("prj"),
                name=name,
                description=description,
                owner_id=owner.id,
            )
            owner_member = ProjectMemberModel(
                id=new_id("pm"),
                project_id=project.id,
                user_id=owner.id,
                role="owner",
            )
            saved = model_to_project(self.repository.save_project(project, owner_member))
            self._record_project_created(saved)
            return saved

        project = Project(
            id=f"prj_{len(self._projects) + 1}",
            name=name,
            description=description,
            owner_id=owner.id,
        )
        self._projects[project.id] = project
        self._members.append(ProjectMember(project_id=project.id, user_id=owner.id, role="owner"))
        self._record_project_created(project)
        return project

    def list_projects_for_user(self, user: User) -> list[tuple[Project, ProjectRole]]:
        if self.repository is not None:
            return [
                (model_to_project(project), member.role)
                for project, member in self.repository.list_memberships_for_user(user.id)
            ]

        memberships = [member for member in self._members if member.user_id == user.id]
        return [
            (self._projects[member.project_id], member.role)
            for member in memberships
            if member.project_id in self._projects
        ]

    def get_project(self, project_id: str) -> Project:
        if self.repository is not None:
            project = self.repository.get_project(project_id)
            if project is None:
                raise_project_not_found()
            return model_to_project(project)

        project = self._projects.get(project_id)
        if project is None:
            raise_project_not_found()
        return project

    def add_member(
        self,
        *,
        project_id: str,
        email: str,
        role: ManagedProjectRole,
        actor: User | None = None,
    ) -> tuple[User, ProjectRole]:
        if actor is not None:
            self.require_role(project_id, actor, {"owner"})
        if self.repository is not None:
            project = self.get_project(project_id)
            user = self.user_service.ensure_user(email)
            existing = self.repository.get_member(project_id, user.id)
            if user.id == project.owner_id or (existing is not None and existing.role == "owner"):
                raise_owner_membership_immutable()
            self.repository.upsert_member(
                ProjectMemberModel(
                    id=new_id("pm"),
                    project_id=project_id,
                    user_id=user.id,
                    role=role,
                )
            )
            self._record_member_operation(
                action=(
                    "project.member_added" if existing is None else "project.member_role_updated"
                ),
                project_id=project_id,
                user=user,
                role=role,
            )
            return user, role

        self.get_project(project_id)
        user = self.user_service.ensure_user(email)

        existing = next(
            (
                member
                for member in self._members
                if member.project_id == project_id and member.user_id == user.id
            ),
            None,
        )
        if existing is not None:
            self._members.remove(existing)

        self._members.append(ProjectMember(project_id=project_id, user_id=user.id, role=role))
        self._record_member_operation(
            action="project.member_added" if existing is None else "project.member_role_updated",
            project_id=project_id,
            user=user,
            role=role,
        )
        return user, role

    def update_member(
        self,
        *,
        project_id: str,
        user_id: str,
        role: ManagedProjectRole,
        actor: User,
    ) -> tuple[User, ProjectRole]:
        self.require_role(project_id, actor, {"owner"})
        project = self.get_project(project_id)
        if user_id == project.owner_id:
            raise_owner_membership_immutable()

        user = self.user_service.get_user_by_id(user_id)
        if self.repository is not None:
            member = self.repository.get_member(project_id, user_id)
            if member is None:
                raise_member_not_found()
            member.role = role
            self.repository.upsert_member(member)
        else:
            member = next(
                (
                    item
                    for item in self._members
                    if item.project_id == project_id and item.user_id == user_id
                ),
                None,
            )
            if member is None:
                raise_member_not_found()
            self._members.remove(member)
            self._members.append(ProjectMember(project_id=project_id, user_id=user_id, role=role))

        self._record_member_operation(
            action="project.member_role_updated",
            project_id=project_id,
            user=user,
            role=role,
        )
        return user, role

    def remove_member(self, *, project_id: str, user_id: str, actor: User) -> User:
        self.require_role(project_id, actor, {"owner"})
        project = self.get_project(project_id)
        if user_id == project.owner_id:
            raise_owner_membership_immutable()

        user = self.user_service.get_user_by_id(user_id)
        if self.repository is not None:
            member = self.repository.get_member(project_id, user_id)
            if member is None:
                raise_member_not_found()
            self.repository.delete_member(member)
        else:
            member = next(
                (
                    item
                    for item in self._members
                    if item.project_id == project_id and item.user_id == user_id
                ),
                None,
            )
            if member is None:
                raise_member_not_found()
            self._members.remove(member)

        self._record_member_operation(
            action="project.member_removed",
            project_id=project_id,
            user=user,
            role=None,
        )
        return user

    def list_members(
        self,
        project_id: str,
        actor: User | None = None,
    ) -> list[tuple[User, ProjectRole]]:
        if actor is not None:
            self.require_role(project_id, actor, {"owner", "editor", "viewer"})
        if self.repository is not None:
            self.get_project(project_id)
            return [
                (self.user_service.get_user_by_id(member.user_id), member.role)
                for member in self.repository.list_members(project_id)
            ]

        self.get_project(project_id)
        members = [member for member in self._members if member.project_id == project_id]
        return [
            (self.user_service.get_user_by_id(member.user_id), member.role) for member in members
        ]

    def require_role(
        self,
        project_id: str,
        user: User,
        allowed_roles: set[ProjectRole],
    ) -> ProjectRole:
        self.get_project(project_id)
        if user.is_platform_admin:
            return "owner"

        if self.repository is not None:
            membership = self.repository.get_member(project_id, user.id)
            role = membership.role if membership is not None else None
        else:
            membership = next(
                (
                    member
                    for member in self._members
                    if member.project_id == project_id and member.user_id == user.id
                ),
                None,
            )
            role = membership.role if membership is not None else None

        if role not in allowed_roles:
            raise AppError(
                message="You do not have permission to perform this project action",
                code="project_access_denied",
                status_code=403,
            )
        return role

    def _record_project_created(self, project: Project) -> None:
        self.audit.record_operation(
            action="project.created",
            project_id=project.id,
            resource_type="project",
            resource_id=project.id,
            detail={"name": project.name},
        )

    def _record_member_operation(
        self,
        *,
        action: str,
        project_id: str,
        user: User,
        role: ProjectRole | None,
    ) -> None:
        self.audit.record_operation(
            action=action,
            project_id=project_id,
            resource_type="project_member",
            resource_id=user.id,
            detail={"email": user.email, "role": role},
        )


def raise_project_not_found() -> None:
    raise AppError(message="Project not found", code="project_not_found", status_code=404)


def raise_member_not_found() -> None:
    raise AppError(
        message="Project member not found",
        code="project_member_not_found",
        status_code=404,
    )


def raise_owner_membership_immutable() -> None:
    raise AppError(
        message="The project owner membership cannot be changed or removed",
        code="project_owner_membership_immutable",
        status_code=409,
    )


def model_to_project(project: ProjectModel) -> Project:
    return Project(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
    )


project_service = ProjectService()
