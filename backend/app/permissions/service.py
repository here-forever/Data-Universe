from dataclasses import dataclass

from app.core.ids import new_id
from app.models.permission import ResourcePermission as ResourcePermissionModel
from app.permissions.repository import PermissionRepository
from app.permissions.schemas import (
    PrincipalType,
    ResourceAction,
    ResourcePermissionCreateRequest,
    ResourceType,
)


@dataclass(frozen=True)
class ResourcePermission:
    id: str
    project_id: str
    resource_type: ResourceType
    resource_id: str
    principal_type: PrincipalType
    principal_id: str
    actions: list[ResourceAction]


class PermissionService:
    def __init__(self, repository: PermissionRepository | None = None) -> None:
        self.repository = repository
        self._permissions: list[ResourcePermission] = []
        self.reset()

    def reset(self) -> None:
        self._permissions = []

    def create_from_request(self, payload: ResourcePermissionCreateRequest) -> ResourcePermission:
        return self.create_resource_permission(
            project_id=payload.project_id,
            resource_type=payload.resource_type,
            resource_id=payload.resource_id,
            principal_type=payload.principal_type,
            principal_id=payload.principal_id,
            actions=payload.actions,
        )

    def create_resource_permission(
        self,
        *,
        project_id: str,
        resource_type: ResourceType,
        resource_id: str,
        principal_type: PrincipalType,
        principal_id: str,
        actions: list[ResourceAction],
    ) -> ResourcePermission:
        if self.repository is not None:
            permission = ResourcePermissionModel(
                id=new_id("perm"),
                project_id=project_id,
                resource_type=resource_type,
                resource_id=resource_id,
                principal_type=principal_type,
                principal_id=principal_id,
                actions=actions,
            )
            return model_to_permission(self.repository.save_permission(permission))

        permission = ResourcePermission(
            id=f"perm_{len(self._permissions) + 1}",
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
            principal_type=principal_type,
            principal_id=principal_id,
            actions=actions,
        )
        self._permissions.append(permission)
        return permission

    def list_resource_permissions(self, project_id: str) -> list[ResourcePermission]:
        if self.repository is not None:
            return [
                model_to_permission(permission)
                for permission in self.repository.list_permissions(project_id)
            ]

        return [
            permission for permission in self._permissions if permission.project_id == project_id
        ]


def model_to_permission(permission: ResourcePermissionModel) -> ResourcePermission:
    return ResourcePermission(
        id=permission.id,
        project_id=permission.project_id,
        resource_type=permission.resource_type,
        resource_id=permission.resource_id,
        principal_type=permission.principal_type,
        principal_id=permission.principal_id,
        actions=permission.actions,
    )


permission_service = PermissionService()
