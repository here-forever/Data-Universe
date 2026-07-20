from dataclasses import dataclass
from typing import Any

from app.audit.service import AuditService
from app.cleaning.repository import CleaningRepository
from app.cleaning.schemas import (
    CleaningExecuteRequest,
    CleaningExecuteResponse,
    CleaningPreviewRequest,
    CleaningPreviewResponse,
    CleaningRecipeCreateRequest,
    CleaningRecipeListResponse,
    CleaningRecipeResponse,
    CleaningStepRequest,
    CleaningStepResponse,
)
from app.core.errors import AppError
from app.core.ids import new_id
from app.datasets.service import Dataset, DatasetService, dataset_service
from app.imports.schemas import ImportFieldPreview
from app.models.cleaning import CleaningRecipe as CleaningRecipeModel
from app.models.cleaning import CleaningStep as CleaningStepModel
from app.tasks.service import TaskService


@dataclass(frozen=True)
class CleaningRecipe:
    id: str
    project_id: str
    source_dataset_id: str
    name: str
    description: str | None
    steps: list[CleaningStepResponse]


class CleaningService:
    def __init__(
        self,
        repository: CleaningRepository | None = None,
        datasets: DatasetService = dataset_service,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
    ) -> None:
        self.repository = repository
        self.datasets = datasets
        self.audit = audit
        self.tasks = tasks
        self._recipes: dict[str, CleaningRecipe] = {}

    def reset(self) -> None:
        self._recipes = {}

    def create_recipe(self, payload: CleaningRecipeCreateRequest) -> CleaningRecipeResponse:
        dataset = self._get_project_dataset(
            project_id=payload.project_id,
            dataset_id=payload.source_dataset_id,
        )
        ordered_steps = self._validate_steps(payload.steps, dataset=dataset)
        recipe_id = new_id("clean")
        steps = [
            CleaningStepResponse(
                id=new_id("cstep"),
                operation=step.operation,
                order=step.order,
                config=step.config,
            )
            for step in ordered_steps
        ]

        if self.repository is not None:
            recipe = CleaningRecipeModel(
                id=recipe_id,
                project_id=payload.project_id,
                source_dataset_id=payload.source_dataset_id,
                name=payload.name,
                description=payload.description,
            )
            self.repository.save_recipe(
                recipe=recipe,
                steps=[
                    CleaningStepModel(
                        id=step.id,
                        recipe_id=recipe_id,
                        operation=step.operation,
                        order=step.order,
                        config=step.config,
                    )
                    for step in steps
                ],
            )
            response = self._model_to_response(recipe)
            self._record_recipe_audit(response)
            return response

        recipe = CleaningRecipe(
            id=recipe_id,
            project_id=payload.project_id,
            source_dataset_id=payload.source_dataset_id,
            name=payload.name,
            description=payload.description,
            steps=steps,
        )
        self._recipes[recipe.id] = recipe
        return to_recipe_response(recipe)

    def list_recipes(self, project_id: str) -> CleaningRecipeListResponse:
        if self.repository is None:
            recipes = [
                to_recipe_response(recipe)
                for recipe in self._recipes.values()
                if recipe.project_id == project_id
            ]
            return CleaningRecipeListResponse(items=recipes)

        return CleaningRecipeListResponse(
            items=[
                self._model_to_response(model) for model in self.repository.list_recipes(project_id)
            ]
        )

    def get_recipe(self, recipe_id: str) -> CleaningRecipeResponse:
        if self.repository is None:
            recipe = self._recipes.get(recipe_id)
            if recipe is None:
                raise AppError("Cleaning recipe not found", "cleaning_recipe_not_found", 404)
            return to_recipe_response(recipe)

        model = self.repository.get_recipe(recipe_id)
        if model is None:
            raise AppError("Cleaning recipe not found", "cleaning_recipe_not_found", 404)
        return self._model_to_response(model)

    def preview(self, payload: CleaningPreviewRequest) -> CleaningPreviewResponse:
        dataset = self._get_project_dataset(
            project_id=payload.project_id,
            dataset_id=payload.source_dataset_id,
        )
        steps = self._validate_steps(payload.steps, dataset=dataset)
        _, rows = self.datasets.preview_dataset_rows(
            dataset_id=dataset.id,
            page=payload.page,
            page_size=payload.page_size,
        )
        cleaned_rows = apply_cleaning_steps(rows, steps)
        fields = infer_preview_fields(dataset=dataset, rows=cleaned_rows)

        return CleaningPreviewResponse(
            source_dataset_id=dataset.id,
            page=payload.page,
            page_size=payload.page_size,
            total_rows=len(cleaned_rows),
            fields=fields,
            rows=cleaned_rows,
        )

    def execute_recipe(
        self,
        *,
        recipe_id: str,
        payload: CleaningExecuteRequest,
    ) -> CleaningExecuteResponse:
        try:
            return self._execute_recipe(recipe_id=recipe_id, payload=payload)
        except Exception as error:
            self._record_recipe_execution_failure(
                recipe_id=recipe_id,
                output_name=payload.output_name,
                error=error,
            )
            raise

    def _execute_recipe(
        self,
        *,
        recipe_id: str,
        payload: CleaningExecuteRequest,
    ) -> CleaningExecuteResponse:
        recipe = self.get_recipe(recipe_id)
        dataset, rows = self.datasets.list_dataset_rows(recipe.source_dataset_id)
        if dataset.project_id != recipe.project_id:
            raise AppError("Dataset not found in project", "dataset_not_found", 404)

        step_requests = [
            CleaningStepRequest(
                operation=step.operation,
                order=step.order,
                config=step.config,
            )
            for step in recipe.steps
        ]
        validated_steps = self._validate_steps(step_requests, dataset=dataset)
        cleaned_rows = apply_cleaning_steps(rows, validated_steps)
        fields = derive_fields(
            source_fields=dataset.fields,
            steps=validated_steps,
            rows=cleaned_rows,
        )
        derived_dataset = self.datasets.create_derived_dataset(
            project_id=recipe.project_id,
            name=payload.output_name,
            source_dataset_id=recipe.source_dataset_id,
            fields=fields,
            rows=drop_system_row_ids(cleaned_rows),
            lineage_transform_type="cleaning_recipe_execution",
            lineage_transform_id=recipe.id,
        )
        self._record_recipe_execution(recipe=recipe, derived_dataset_id=derived_dataset.id)
        self._record_recipe_execution_task(
            recipe=recipe,
            derived_dataset_id=derived_dataset.id,
        )

        return CleaningExecuteResponse(
            recipe_id=recipe.id,
            source_dataset_id=recipe.source_dataset_id,
            derived_dataset_id=derived_dataset.id,
            derived_dataset_name=derived_dataset.name,
            row_count=derived_dataset.row_count,
        )

    def _model_to_response(self, model: CleaningRecipeModel) -> CleaningRecipeResponse:
        steps = [
            CleaningStepResponse(
                id=step.id,
                operation=step.operation,
                order=step.order,
                config=step.config,
            )
            for step in self.repository.list_steps(model.id)
        ]
        return CleaningRecipeResponse(
            id=model.id,
            project_id=model.project_id,
            source_dataset_id=model.source_dataset_id,
            name=model.name,
            description=model.description,
            steps=steps,
        )

    def _get_project_dataset(self, *, project_id: str, dataset_id: str) -> Dataset:
        dataset = self.datasets.get_dataset(dataset_id)
        if dataset.project_id != project_id:
            raise AppError("Dataset not found in project", "dataset_not_found", 404)
        return dataset

    def _validate_steps(
        self,
        steps: list[CleaningStepRequest],
        *,
        dataset: Dataset,
    ) -> list[CleaningStepRequest]:
        ordered_steps = sorted(steps, key=lambda step: step.order)
        field_names = {field.name for field in dataset.fields}
        current_names = set(field_names)

        for step in ordered_steps:
            if step.operation == "rename_field":
                source = require_string_config(step, "source_field")
                target = require_string_config(step, "target_field")
                if source not in current_names:
                    raise AppError("Source field does not exist", "invalid_cleaning_step", 400)
                if not target.strip():
                    raise AppError("Target field cannot be empty", "invalid_cleaning_step", 400)
                current_names.remove(source)
                current_names.add(target)
            elif step.operation == "fill_null":
                field = require_string_config(step, "field")
                if field not in current_names:
                    raise AppError("Fill-null field does not exist", "invalid_cleaning_step", 400)
                if "value" not in step.config:
                    raise AppError("Fill-null value is required", "invalid_cleaning_step", 400)
            elif step.operation == "drop_null_rows":
                fields = require_string_list_config(step, "fields")
                if not set(fields).issubset(current_names):
                    raise AppError("Drop-null fields must exist", "invalid_cleaning_step", 400)
            elif step.operation == "deduplicate":
                fields = require_string_list_config(step, "fields")
                if not set(fields).issubset(current_names):
                    raise AppError("Deduplicate fields must exist", "invalid_cleaning_step", 400)

        return ordered_steps

    def _record_recipe_audit(self, recipe: CleaningRecipeResponse) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="cleaning.recipe_created",
            project_id=recipe.project_id,
            resource_type="cleaning_recipe",
            resource_id=recipe.id,
            detail={
                "source_dataset_id": recipe.source_dataset_id,
                "step_count": len(recipe.steps),
            },
        )
        self.audit.record_lineage(
            project_id=recipe.project_id,
            source_type="dataset",
            source_id=recipe.source_dataset_id,
            target_type="cleaning_recipe",
            target_id=recipe.id,
            transform_type="cleaning_recipe",
            transform_id=recipe.id,
        )

    def _record_recipe_execution_task(
        self,
        *,
        recipe: CleaningRecipeResponse,
        derived_dataset_id: str,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_success(
            project_id=recipe.project_id,
            name=f"Executed cleaning recipe: {recipe.name}",
            task_type="cleaning_recipe_execution",
            related_resource_type="dataset",
            related_resource_id=derived_dataset_id,
        )

    def _record_recipe_execution_failure(
        self,
        *,
        recipe_id: str,
        output_name: str,
        error: Exception,
    ) -> None:
        if self.tasks is None:
            return

        project_id: str | None = None
        related_resource_id = recipe_id
        try:
            recipe = self.get_recipe(recipe_id)
            project_id = recipe.project_id
            related_resource_id = recipe.id
        except Exception:
            pass

        self.tasks.record_exception(
            project_id=project_id,
            name=f"Execute cleaning recipe failed: {output_name}",
            task_type="cleaning_recipe_execution",
            error=error,
            related_resource_type="cleaning_recipe",
            related_resource_id=related_resource_id,
            retry_payload={
                "operation": "cleaning_recipe_execution",
                "recipe_id": recipe_id,
                "output_name": output_name,
            },
        )

    def _record_recipe_execution(
        self,
        *,
        recipe: CleaningRecipeResponse,
        derived_dataset_id: str,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="cleaning.recipe_executed",
            project_id=recipe.project_id,
            resource_type="cleaning_recipe",
            resource_id=recipe.id,
            detail={
                "source_dataset_id": recipe.source_dataset_id,
                "derived_dataset_id": derived_dataset_id,
                "step_count": len(recipe.steps),
            },
        )
        self.audit.record_lineage(
            project_id=recipe.project_id,
            source_type="cleaning_recipe",
            source_id=recipe.id,
            target_type="dataset",
            target_id=derived_dataset_id,
            transform_type="cleaning_recipe_execution",
            transform_id=recipe.id,
        )


def to_recipe_response(recipe: CleaningRecipe) -> CleaningRecipeResponse:
    return CleaningRecipeResponse(
        id=recipe.id,
        project_id=recipe.project_id,
        source_dataset_id=recipe.source_dataset_id,
        name=recipe.name,
        description=recipe.description,
        steps=recipe.steps,
    )


def require_string_config(step: CleaningStepRequest, key: str) -> str:
    value = step.config.get(key)
    if not isinstance(value, str) or not value.strip():
        raise AppError(f"{key} is required", "invalid_cleaning_step", 400)
    return value.strip()


def require_string_list_config(step: CleaningStepRequest, key: str) -> list[str]:
    value = step.config.get(key)
    if not isinstance(value, list) or not value:
        raise AppError(f"{key} is required", "invalid_cleaning_step", 400)
    result = [item.strip() for item in value if isinstance(item, str) and item.strip()]
    if len(result) != len(value):
        raise AppError(f"{key} must contain field names", "invalid_cleaning_step", 400)
    return result


def apply_cleaning_steps(
    rows: list[dict[str, object | None]],
    steps: list[CleaningStepRequest],
) -> list[dict[str, object | None]]:
    cleaned_rows = [dict(row) for row in rows]

    for step in steps:
        if step.operation == "rename_field":
            source = require_string_config(step, "source_field")
            target = require_string_config(step, "target_field")
            cleaned_rows = [
                rename_row_field(row, source=source, target=target) for row in cleaned_rows
            ]
        elif step.operation == "fill_null":
            field = require_string_config(step, "field")
            value = step.config["value"]
            cleaned_rows = [
                {**row, field: value if row.get(field) in (None, "") else row.get(field)}
                for row in cleaned_rows
            ]
        elif step.operation == "drop_null_rows":
            fields = require_string_list_config(step, "fields")
            cleaned_rows = [
                row
                for row in cleaned_rows
                if all(row.get(field) not in (None, "") for field in fields)
            ]
        elif step.operation == "deduplicate":
            fields = require_string_list_config(step, "fields")
            cleaned_rows = deduplicate_rows(cleaned_rows, fields)

    return cleaned_rows


def rename_row_field(
    row: dict[str, object | None],
    *,
    source: str,
    target: str,
) -> dict[str, object | None]:
    renamed: dict[str, object | None] = {}
    for key, value in row.items():
        renamed[target if key == source else key] = value
    return renamed


def deduplicate_rows(
    rows: list[dict[str, object | None]],
    fields: list[str],
) -> list[dict[str, object | None]]:
    seen: set[tuple[Any, ...]] = set()
    result: list[dict[str, object | None]] = []
    for row in rows:
        key = tuple(row.get(field) for field in fields)
        if key in seen:
            continue
        seen.add(key)
        result.append(row)
    return result


def infer_preview_fields(*, dataset: Dataset, rows: list[dict[str, object | None]]) -> list[str]:
    if rows:
        return list(rows[0].keys())
    return ["_das_row_id", *[field.name for field in dataset.fields]]


def derive_fields(
    *,
    source_fields: list[ImportFieldPreview],
    steps: list[CleaningStepRequest],
    rows: list[dict[str, object | None]],
) -> list[ImportFieldPreview]:
    fields = [
        ImportFieldPreview(
            name=field.name,
            inferred_type=field.inferred_type,
            nullable=field.nullable,
            order=field.order,
        )
        for field in source_fields
    ]

    for step in steps:
        if step.operation == "rename_field":
            source = require_string_config(step, "source_field")
            target = require_string_config(step, "target_field")
            fields = [
                field.model_copy(update={"name": target}) if field.name == source else field
                for field in fields
            ]
        elif step.operation == "fill_null":
            field_name = require_string_config(step, "field")
            fields = [
                field.model_copy(update={"nullable": False}) if field.name == field_name else field
                for field in fields
            ]

    row_field_names = list(rows[0].keys()) if rows else []
    output_field_names = [
        field_name for field_name in row_field_names if field_name != "_das_row_id"
    ]
    if output_field_names:
        fields_by_name = {field.name: field for field in fields}
        fields = [
            fields_by_name[field_name].model_copy(update={"order": order})
            for order, field_name in enumerate(output_field_names)
            if field_name in fields_by_name
        ]
    else:
        fields = [field.model_copy(update={"order": order}) for order, field in enumerate(fields)]

    return fields


def drop_system_row_ids(
    rows: list[dict[str, object | None]],
) -> list[dict[str, object | None]]:
    return [
        {field: value for field, value in row.items() if field != "_das_row_id"} for row in rows
    ]


cleaning_service = CleaningService()
