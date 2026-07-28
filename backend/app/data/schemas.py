from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


class DatasetSummary(BaseModel):
    id: str
    name: str
    source_filename: str
    file_type: str
    row_count: int
    column_count: int
    active_revision: int
    quality_score: float
    created_at: datetime
    updated_at: datetime


class DatasetDetail(DatasetSummary):
    profile: dict[str, Any]
    preview: list[dict[str, Any]]
    transformations: list[dict[str, Any]]


class RowPage(BaseModel):
    dataset_id: str
    revision: int
    offset: int
    limit: int
    total: int
    columns: list[str]
    rows: list[dict[str, Any]]


class CleaningStep(BaseModel):
    action: Literal["drop_duplicates", "drop_missing", "fill_missing", "flag_outliers"]
    column: str | None = None
    columns: list[str] = Field(default_factory=list)
    strategy: Literal["mean", "median", "mode", "value"] | None = None
    value: Any = None

    @model_validator(mode="after")
    def validate_step(self) -> "CleaningStep":
        if self.action in {"fill_missing", "flag_outliers"} and not self.column:
            raise ValueError(f"{self.action} requires a column")
        if self.action == "fill_missing" and self.strategy is None:
            raise ValueError("fill_missing requires a strategy")
        if self.action == "fill_missing" and self.strategy == "value" and self.value is None:
            raise ValueError("fill_missing with value strategy requires a value")
        return self


class CleaningRequest(BaseModel):
    label: str = Field(default="Cleaned revision", min_length=1, max_length=160)
    steps: list[CleaningStep] = Field(min_length=1, max_length=20)


class ParticleRequest(BaseModel):
    x: str | None = None
    y: str | None = None
    z: str | None = None
    color: str | None = None
    limit: int = Field(default=1_000, ge=50, le=5_000)


class ParticlePoint(BaseModel):
    id: int
    x: float
    y: float
    z: float
    color: str
    label: str
    values: dict[str, Any]


class ParticleResponse(BaseModel):
    dataset_id: str
    mapping: dict[str, str | None]
    points: list[ParticlePoint]
