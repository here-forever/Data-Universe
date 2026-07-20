from datetime import datetime
from typing import Literal

from pydantic import BaseModel

TaskStatus = Literal["pending", "running", "success", "failed", "retryable"]


class TaskResponse(BaseModel):
    id: str
    project_id: str | None
    initiator_id: str | None
    name: str
    task_type: str
    status: TaskStatus
    progress: int
    error_message: str | None
    related_resource_type: str | None
    related_resource_id: str | None
    can_retry: bool
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskListResponse(BaseModel):
    items: list[TaskResponse]


class TaskRetryResponse(BaseModel):
    original_task: TaskResponse
    retry_task: TaskResponse
