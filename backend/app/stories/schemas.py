from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Locale = Literal["zh-CN", "en-US"]


class StoryBlock(BaseModel):
    id: str
    kind: Literal["cover", "metric", "chart", "narrative", "quality"]
    title: str
    body: str
    payload: dict[str, Any] = Field(default_factory=dict)


class StoryCreate(BaseModel):
    dataset_id: str
    title: str | None = Field(default=None, max_length=200)
    locale: Locale = "zh-CN"


class StoryUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2_000)
    blocks: list[StoryBlock] | None = None


class StoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    dataset_id: str
    title: str
    summary: str
    blocks: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime
