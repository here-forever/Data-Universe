from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

ProjectRole = Literal["owner", "editor", "viewer"]


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)


class ProjectResponse(BaseModel):
    id: str
    name: str
    description: str | None
    owner_id: str
    role: ProjectRole


class ProjectMemberCreateRequest(BaseModel):
    email: EmailStr
    role: ProjectRole


class ProjectMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    email: EmailStr
    display_name: str
    role: ProjectRole
