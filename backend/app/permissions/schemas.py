from typing import Literal

from pydantic import BaseModel, Field

ResourceAction = Literal["view", "edit", "delete", "export", "share", "execute"]
ResourceType = Literal[
    "data_source",
    "dataset",
    "data_view",
    "cleaning_recipe",
    "sql_query",
    "chart",
    "dashboard",
]
PrincipalType = Literal["user", "project_role"]


class ResourcePermissionCreateRequest(BaseModel):
    project_id: str
    resource_type: ResourceType
    resource_id: str
    principal_type: PrincipalType
    principal_id: str
    actions: list[ResourceAction] = Field(min_length=1)


class ResourcePermissionResponse(BaseModel):
    id: str
    project_id: str
    resource_type: ResourceType
    resource_id: str
    principal_type: PrincipalType
    principal_id: str
    actions: list[ResourceAction]
