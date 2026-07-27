from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

GovernedResourceType = Literal[
    "dataset",
    "data_view",
    "analysis_definition",
    "cleaning_recipe",
    "chart",
    "dashboard",
]
ResourceStatus = Literal["active", "archived"]
LineageDirection = Literal["upstream", "downstream", "both"]


class GovernedResourceResponse(BaseModel):
    resource_type: GovernedResourceType
    resource_id: str
    project_id: str
    name: str
    status: ResourceStatus
    archived_at: datetime | None
    archived_by_id: str | None
    created_at: datetime
    updated_at: datetime
    direct_dependency_count: int


class GovernedResourceSummary(BaseModel):
    total: int
    active: int
    archived: int
    with_dependents: int


class GovernedResourceListResponse(BaseModel):
    items: list[GovernedResourceResponse]
    summary: GovernedResourceSummary


class OperationLogResponse(BaseModel):
    id: str
    project_id: str | None
    actor_id: str | None
    actor_name: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    detail: dict[str, object] | None
    created_at: datetime


class OperationLogListResponse(BaseModel):
    items: list[OperationLogResponse]
    total: int


class LineageNodeResponse(BaseModel):
    resource_type: str
    resource_id: str
    label: str
    status: ResourceStatus | Literal["reference"]
    depth: int = Field(ge=0)


class LineageEdgeResponse(BaseModel):
    id: str
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    transform_type: str | None
    transform_id: str | None
    created_at: datetime


class FocusedLineageResponse(BaseModel):
    root: LineageNodeResponse
    nodes: list[LineageNodeResponse]
    edges: list[LineageEdgeResponse]
    direction: LineageDirection
    max_depth: int
