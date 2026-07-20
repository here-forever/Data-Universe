from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.project import Project as ProjectModel
from app.models.project import ProjectMember as ProjectMemberModel


class ProjectRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_project(self, project: ProjectModel, owner_member: ProjectMemberModel) -> ProjectModel:
        self.session.add(project)
        self.session.add(owner_member)
        self.session.commit()
        self.session.refresh(project)
        return project

    def list_memberships_for_user(
        self, user_id: str
    ) -> list[tuple[ProjectModel, ProjectMemberModel]]:
        statement = (
            select(ProjectModel, ProjectMemberModel)
            .join(ProjectMemberModel, ProjectMemberModel.project_id == ProjectModel.id)
            .where(ProjectMemberModel.user_id == user_id)
            .order_by(ProjectModel.created_at.desc())
        )
        return [(project, member) for project, member in self.session.execute(statement).all()]

    def get_project(self, project_id: str) -> ProjectModel | None:
        return self.session.get(ProjectModel, project_id)

    def upsert_member(self, member: ProjectMemberModel) -> ProjectMemberModel:
        existing = self.session.scalar(
            select(ProjectMemberModel).where(
                ProjectMemberModel.project_id == member.project_id,
                ProjectMemberModel.user_id == member.user_id,
            )
        )
        if existing is not None:
            existing.role = member.role
            self.session.commit()
            self.session.refresh(existing)
            return existing

        self.session.add(member)
        self.session.commit()
        self.session.refresh(member)
        return member

    def list_members(self, project_id: str) -> list[ProjectMemberModel]:
        return list(
            self.session.scalars(
                select(ProjectMemberModel)
                .where(ProjectMemberModel.project_id == project_id)
                .order_by(ProjectMemberModel.created_at)
            )
        )
