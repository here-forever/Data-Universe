from typing import Any

from pydantic import BaseModel, Field


class ChartCreateRequest(BaseModel):
    project_id: str
    data_view_id: str
    name: str = Field(min_length=1, max_length=120)
    chart_type: str = Field(min_length=1, max_length=64)
    config: dict[str, Any] = Field(default_factory=dict)


class ChartResponse(BaseModel):
    id: str
    project_id: str
    data_view_id: str
    name: str
    chart_type: str
    config: dict[str, Any]


class ChartListResponse(BaseModel):
    items: list[ChartResponse]


class DashboardCreateRequest(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=120)
    layout: dict[str, Any] = Field(default_factory=dict)


class DashboardResponse(BaseModel):
    id: str
    project_id: str
    name: str
    layout: dict[str, Any]


class DashboardListResponse(BaseModel):
    items: list[DashboardResponse]
