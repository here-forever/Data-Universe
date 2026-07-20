from typing import Literal

from pydantic import BaseModel, Field

CleaningOperation = Literal[
    "rename_field",
    "fill_null",
    "drop_null_rows",
    "deduplicate",
]


class CleaningStepRequest(BaseModel):
    operation: CleaningOperation
    order: int = Field(ge=0)
    config: dict[str, object] = Field(default_factory=dict)


class CleaningRecipeCreateRequest(BaseModel):
    project_id: str
    source_dataset_id: str
    name: str = Field(min_length=1, max_length=120)
    description: str | None = None
    steps: list[CleaningStepRequest] = Field(min_length=1)


class CleaningStepResponse(BaseModel):
    id: str
    operation: CleaningOperation
    order: int
    config: dict[str, object]


class CleaningRecipeResponse(BaseModel):
    id: str
    project_id: str
    source_dataset_id: str
    name: str
    description: str | None
    steps: list[CleaningStepResponse]


class CleaningRecipeListResponse(BaseModel):
    items: list[CleaningRecipeResponse]


class CleaningPreviewRequest(BaseModel):
    project_id: str
    source_dataset_id: str
    steps: list[CleaningStepRequest] = Field(default_factory=list)
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)


class CleaningPreviewResponse(BaseModel):
    source_dataset_id: str
    page: int
    page_size: int
    total_rows: int
    fields: list[str]
    rows: list[dict[str, object | None]]


class CleaningExecuteRequest(BaseModel):
    output_name: str = Field(min_length=1, max_length=120)


class CleaningExecuteResponse(BaseModel):
    recipe_id: str
    source_dataset_id: str
    derived_dataset_id: str
    derived_dataset_name: str
    row_count: int
