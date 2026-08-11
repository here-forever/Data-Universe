from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CollaborationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str = Field(default="activity", min_length=1, max_length=40, pattern=r"^[a-z0-9_:-]+$")
    actor: str = Field(default="anonymous", min_length=1, max_length=80)
    payload: dict[str, Any] = Field(default_factory=dict)

    @field_validator("actor")
    @classmethod
    def normalize_actor(cls, value: str) -> str:
        actor = value.strip()
        if not actor:
            raise ValueError("actor cannot be blank")
        return actor
