from dataclasses import dataclass

from app.auth.service import AuthService, User, auth_service
from app.core.errors import AppError
from app.core.ids import new_id
from app.models.project import Project as ProjectModel
from app.models.project import ProjectMember as ProjectMemberModel
from app.projects.repository import ProjectRepository
from app.projects.schemas import ProjectRole


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
    ) -> None:
        self.repository = repository
        self.user_service = user_service
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
            return model_to_project(self.repository.save_project(project, owner_member))

        project = Project(
            id=f"prj_{len(self._projects) + 1}",
            name=name,
            description=description,
            owner_id=owner.id,
        )
        self._projects[project.id] = project
        self._members.append(ProjectMember(project_id=project.id, user_id=owner.id, role="owner"))
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
        self, *, project_id: str, email: str, role: ProjectRole
    ) -> tuple[User, ProjectRole]:
        if self.repository is not None:
            self.get_project(project_id)
            user = self.user_service.ensure_user(email)
            self.repository.upsert_member(
                ProjectMemberModel(
                    id=new_id("pm"),
                    project_id=project_id,
                    user_id=user.id,
                    role=role,
                )
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
        return user, role

    def list_members(self, project_id: str) -> list[tuple[User, ProjectRole]]:
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


def raise_project_not_found() -> None:
    raise AppError(message="Project not found", code="project_not_found", status_code=404)


def model_to_project(project: ProjectModel) -> Project:
    return Project(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
    )


project_service = ProjectService()
