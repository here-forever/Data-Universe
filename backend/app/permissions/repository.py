from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.permission import ResourcePermission as ResourcePermissionModel


class PermissionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_permission(self, permission: ResourcePermissionModel) -> ResourcePermissionModel:
        self.session.add(permission)
        self.session.commit()
        self.session.refresh(permission)
        return permission

    def list_permissions(self, project_id: str) -> list[ResourcePermissionModel]:
        return list(
            self.session.scalars(
                select(ResourcePermissionModel)
                .where(ResourcePermissionModel.project_id == project_id)
                .order_by(ResourcePermissionModel.created_at)
            )
        )
