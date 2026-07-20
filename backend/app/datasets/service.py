from dataclasses import dataclass

from app.audit.service import AuditService
from app.core.errors import AppError
from app.core.ids import new_id
from app.datasets.materializer import POSTGRES_IDENTIFIER_LIMIT, SYSTEM_ROW_ID
from app.datasets.repository import DatasetRepository
from app.datasets.schemas import (
    DatasetCreateRequest,
    DatasetFieldQuality,
    DatasetQualityResponse,
    DatasetResponse,
)
from app.imports.parser import coerce_value
from app.imports.schemas import ImportFieldPreview
from app.imports.service import ImportService, import_service
from app.models.dataset import Dataset as DatasetModel
from app.models.dataset import DatasetField as DatasetFieldModel
from app.models.dataset import DatasetTableMap as DatasetTableMapModel
from app.tasks.service import TaskService


@dataclass(frozen=True)
class Dataset:
    id: str
    project_id: str
    name: str
    source_preview_id: str
    physical_table_name: str
    row_count: int
    fields: list[ImportFieldPreview]


class DatasetService:
    def __init__(
        self,
        repository: DatasetRepository | None = None,
        imports: ImportService = import_service,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
    ) -> None:
        self.repository = repository
        self.imports = imports
        self.audit = audit
        self.tasks = tasks
        self._datasets: dict[str, Dataset] = {}

    def reset(self) -> None:
        self._datasets = {}

    def list_datasets(self, project_id: str) -> list[Dataset]:
        if self.repository is None:
            return [
                dataset for dataset in self._datasets.values() if dataset.project_id == project_id
            ]
        return [
            self._model_to_dataset(model) for model in self.repository.list_datasets(project_id)
        ]

    def get_dataset(self, dataset_id: str) -> Dataset:
        if self.repository is None:
            dataset = self._datasets.get(dataset_id)
            if dataset is None:
                raise AppError(
                    message="Dataset not found", code="dataset_not_found", status_code=404
                )
            return dataset

        model = self.repository.get_dataset(dataset_id)
        if model is None:
            raise AppError(message="Dataset not found", code="dataset_not_found", status_code=404)
        return self._model_to_dataset(model)

    def preview_dataset_rows(
        self,
        *,
        dataset_id: str,
        page: int,
        page_size: int,
    ) -> tuple[Dataset, list[dict[str, object | None]]]:
        self._validate_pagination(page=page, page_size=page_size)
        dataset = self.get_dataset(dataset_id)

        if self.repository is None:
            return dataset, []

        table_map = self.repository.get_table_map(dataset_id)
        if table_map is None:
            raise AppError(
                message="Dataset table mapping not found",
                code="dataset_table_map_not_found",
                status_code=404,
            )

        rows = self.repository.preview_rows(
            table_name=table_map.physical_table_name,
            fields=dataset.fields,
            page=page,
            page_size=page_size,
        )
        return dataset, rows

    def profile_dataset_quality(self, dataset_id: str) -> DatasetQualityResponse:
        dataset, rows = self.list_dataset_rows(dataset_id)
        field_profiles = [build_field_quality(field=field, rows=rows) for field in dataset.fields]
        total_cells = dataset.row_count * len(dataset.fields)
        null_cell_count = sum(profile.null_count for profile in field_profiles)
        duplicate_row_count = count_duplicate_rows(
            rows=drop_system_row_ids(rows),
            field_names=[field.name for field in dataset.fields],
        )
        warnings = build_dataset_quality_warnings(
            row_count=dataset.row_count,
            field_profiles=field_profiles,
            duplicate_row_count=duplicate_row_count,
        )
        return DatasetQualityResponse(
            dataset=dataset_to_response_shape(dataset),
            row_count=dataset.row_count,
            field_count=len(dataset.fields),
            null_cell_count=null_cell_count,
            null_cell_ratio=ratio(null_cell_count, total_cells),
            duplicate_row_count=duplicate_row_count,
            field_profiles=field_profiles,
            warnings=warnings,
        )

    def list_dataset_rows(self, dataset_id: str) -> tuple[Dataset, list[dict[str, object | None]]]:
        dataset = self.get_dataset(dataset_id)

        if self.repository is None:
            return dataset, []

        table_map = self.repository.get_table_map(dataset_id)
        if table_map is None:
            raise AppError(
                message="Dataset table mapping not found",
                code="dataset_table_map_not_found",
                status_code=404,
            )

        rows = self.repository.list_rows(
            table_name=table_map.physical_table_name,
            fields=dataset.fields,
        )
        return dataset, rows

    def create_dataset(self, payload: DatasetCreateRequest) -> Dataset:
        try:
            return self._create_dataset(payload)
        except Exception as error:
            self._record_dataset_failure(
                project_id=payload.project_id,
                name=payload.name,
                task_type="dataset_materialization",
                error=error,
                related_resource_type="file_import_preview",
                related_resource_id=payload.preview_id,
                retry_payload=dataset_materialization_retry_payload(payload),
            )
            raise

    def _create_dataset(self, payload: DatasetCreateRequest) -> Dataset:
        preview = self.imports.get_preview(payload.preview_id)
        if preview is None or preview.project_id != payload.project_id:
            raise AppError(message="Preview not found", code="preview_not_found", status_code=404)
        self._validate_dataset_name_available(project_id=payload.project_id, name=payload.name)
        self._validate_fields(payload.fields)

        dataset_id = new_id("dataset")
        if self.repository is None:
            dataset_id = f"dataset_{len(self._datasets) + 1}"
        physical_table_name = build_physical_table_name(dataset_id)
        dataset = Dataset(
            id=dataset_id,
            project_id=payload.project_id,
            name=payload.name,
            source_preview_id=preview.id,
            physical_table_name=physical_table_name,
            row_count=preview.row_count,
            fields=payload.fields,
        )

        if self.repository is not None:
            materialized_rows = self._build_materialized_rows(
                preview_id=preview.id,
                fields=payload.fields,
            )
            self.repository.save_dataset(
                dataset=DatasetModel(
                    id=dataset.id,
                    project_id=dataset.project_id,
                    name=dataset.name,
                    description=None,
                    source_preview_id=dataset.source_preview_id,
                    row_count=dataset.row_count,
                ),
                fields=[
                    DatasetFieldModel(
                        id=new_id("field"),
                        dataset_id=dataset.id,
                        name=field.name,
                        data_type=field.inferred_type,
                        nullable=field.nullable,
                        order=field.order,
                        is_sensitive=False,
                        masking_strategy=None,
                    )
                    for field in payload.fields
                ],
                table_map=DatasetTableMapModel(
                    id=new_id("dtm"),
                    dataset_id=dataset.id,
                    physical_table_name=dataset.physical_table_name,
                ),
                materialized_fields=payload.fields,
                materialized_rows=materialized_rows,
            )
            self._record_dataset_audit(dataset)
            self._record_dataset_task(dataset, task_type="dataset_materialization")
            return dataset

        self._datasets[dataset.id] = dataset
        return dataset

    def create_derived_dataset(
        self,
        *,
        project_id: str,
        name: str,
        source_dataset_id: str,
        fields: list[ImportFieldPreview],
        rows: list[dict[str, object | None]],
        lineage_transform_type: str,
        lineage_transform_id: str,
    ) -> Dataset:
        try:
            return self._create_derived_dataset(
                project_id=project_id,
                name=name,
                source_dataset_id=source_dataset_id,
                fields=fields,
                rows=rows,
                lineage_transform_type=lineage_transform_type,
                lineage_transform_id=lineage_transform_id,
            )
        except Exception as error:
            self._record_dataset_failure(
                project_id=project_id,
                name=name,
                task_type="derived_dataset_materialization",
                error=error,
                related_resource_type="dataset",
                related_resource_id=source_dataset_id,
                retry_payload=None,
            )
            raise

    def _create_derived_dataset(
        self,
        *,
        project_id: str,
        name: str,
        source_dataset_id: str,
        fields: list[ImportFieldPreview],
        rows: list[dict[str, object | None]],
        lineage_transform_type: str,
        lineage_transform_id: str,
    ) -> Dataset:
        self._validate_fields(fields)
        self._validate_dataset_name_available(project_id=project_id, name=name)
        dataset_id = new_id("dataset")
        if self.repository is None:
            dataset_id = f"dataset_{len(self._datasets) + 1}"
        physical_table_name = build_physical_table_name(dataset_id)
        dataset = Dataset(
            id=dataset_id,
            project_id=project_id,
            name=name,
            source_preview_id="",
            physical_table_name=physical_table_name,
            row_count=len(rows),
            fields=fields,
        )

        if self.repository is not None:
            self.repository.save_dataset(
                dataset=DatasetModel(
                    id=dataset.id,
                    project_id=dataset.project_id,
                    name=dataset.name,
                    description=None,
                    source_preview_id=None,
                    row_count=dataset.row_count,
                ),
                fields=[
                    DatasetFieldModel(
                        id=new_id("field"),
                        dataset_id=dataset.id,
                        name=field.name,
                        data_type=field.inferred_type,
                        nullable=field.nullable,
                        order=field.order,
                        is_sensitive=False,
                        masking_strategy=None,
                    )
                    for field in fields
                ],
                table_map=DatasetTableMapModel(
                    id=new_id("dtm"),
                    dataset_id=dataset.id,
                    physical_table_name=dataset.physical_table_name,
                ),
                materialized_fields=fields,
                materialized_rows=rows,
            )
            self._record_dataset_audit(dataset)
            self._record_derived_lineage(
                source_dataset_id=source_dataset_id,
                target_dataset=dataset,
                transform_type=lineage_transform_type,
                transform_id=lineage_transform_id,
            )
            self._record_dataset_task(
                dataset,
                task_type="derived_dataset_materialization",
            )
            return dataset

        self._datasets[dataset.id] = dataset
        return dataset

    def create_materialized_dataset_from_rows(
        self,
        *,
        project_id: str,
        name: str,
        fields: list[ImportFieldPreview],
        rows: list[dict[str, object | None]],
        source_type: str,
        source_id: str,
        transform_type: str,
        task_type: str,
        retry_payload: dict[str, object] | None = None,
    ) -> Dataset:
        try:
            return self._create_materialized_dataset_from_rows(
                project_id=project_id,
                name=name,
                fields=fields,
                rows=rows,
                source_type=source_type,
                source_id=source_id,
                transform_type=transform_type,
                task_type=task_type,
                retry_payload=retry_payload,
            )
        except Exception as error:
            self._record_dataset_failure(
                project_id=project_id,
                name=name,
                task_type=task_type,
                error=error,
                related_resource_type=source_type,
                related_resource_id=source_id,
                retry_payload=retry_payload,
            )
            raise

    def record_materialization_failure(
        self,
        *,
        project_id: str,
        name: str,
        task_type: str,
        error: Exception,
        related_resource_type: str | None,
        related_resource_id: str | None,
        retry_payload: dict[str, object] | None,
    ) -> None:
        self._record_dataset_failure(
            project_id=project_id,
            name=name,
            task_type=task_type,
            error=error,
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
            retry_payload=retry_payload,
        )

    def _create_materialized_dataset_from_rows(
        self,
        *,
        project_id: str,
        name: str,
        fields: list[ImportFieldPreview],
        rows: list[dict[str, object | None]],
        source_type: str,
        source_id: str,
        transform_type: str,
        task_type: str,
        retry_payload: dict[str, object] | None = None,
    ) -> Dataset:
        self._validate_fields(fields)
        self._validate_dataset_name_available(project_id=project_id, name=name)
        dataset_id = new_id("dataset")
        if self.repository is None:
            dataset_id = f"dataset_{len(self._datasets) + 1}"
        physical_table_name = build_physical_table_name(dataset_id)
        dataset = Dataset(
            id=dataset_id,
            project_id=project_id,
            name=name,
            source_preview_id="",
            physical_table_name=physical_table_name,
            row_count=len(rows),
            fields=fields,
        )

        if self.repository is not None:
            self.repository.save_dataset(
                dataset=DatasetModel(
                    id=dataset.id,
                    project_id=dataset.project_id,
                    name=dataset.name,
                    description=None,
                    source_preview_id=None,
                    row_count=dataset.row_count,
                ),
                fields=[
                    DatasetFieldModel(
                        id=new_id("field"),
                        dataset_id=dataset.id,
                        name=field.name,
                        data_type=field.inferred_type,
                        nullable=field.nullable,
                        order=field.order,
                        is_sensitive=False,
                        masking_strategy=None,
                    )
                    for field in fields
                ],
                table_map=DatasetTableMapModel(
                    id=new_id("dtm"),
                    dataset_id=dataset.id,
                    physical_table_name=dataset.physical_table_name,
                ),
                materialized_fields=fields,
                materialized_rows=rows,
            )
            self._record_dataset_audit(dataset)
            self._record_external_lineage(
                source_type=source_type,
                source_id=source_id,
                target_dataset=dataset,
                transform_type=transform_type,
            )
            self._record_dataset_task(
                dataset,
                task_type=task_type,
                retry_payload=retry_payload,
            )
            return dataset

        self._datasets[dataset.id] = dataset
        return dataset

    def _model_to_dataset(self, model: DatasetModel) -> Dataset:
        fields = [
            ImportFieldPreview(
                name=field.name,
                inferred_type=field.data_type,
                nullable=field.nullable,
                order=field.order,
            )
            for field in self.repository.list_fields(model.id)
        ]
        table_map = self.repository.get_table_map(model.id)
        if table_map is None:
            raise AppError(
                message="Dataset table mapping not found",
                code="dataset_table_map_not_found",
                status_code=404,
            )
        return Dataset(
            id=model.id,
            project_id=model.project_id,
            name=model.name,
            source_preview_id=model.source_preview_id or "",
            physical_table_name=table_map.physical_table_name,
            row_count=model.row_count,
            fields=fields,
        )

    def _validate_pagination(self, *, page: int, page_size: int) -> None:
        if page < 1:
            raise AppError(
                message="Page must be greater than 0", code="invalid_page", status_code=400
            )
        if page_size < 1 or page_size > 200:
            raise AppError(
                message="Page size must be between 1 and 200",
                code="invalid_page_size",
                status_code=400,
            )

    def _validate_fields(self, fields: list[ImportFieldPreview]) -> None:
        names = [field.name for field in fields]
        if any(not name.strip() for name in names):
            raise AppError(
                message="Dataset field names cannot be empty",
                code="invalid_dataset_fields",
                status_code=400,
            )
        if SYSTEM_ROW_ID in names:
            raise AppError(
                message=f"{SYSTEM_ROW_ID} is reserved for dataset row identity",
                code="reserved_dataset_field_name",
                status_code=400,
            )
        if any(len(name.encode("utf-8")) > POSTGRES_IDENTIFIER_LIMIT for name in names):
            raise AppError(
                message="Dataset field names must fit PostgreSQL identifier length",
                code="dataset_field_name_too_long",
                status_code=400,
            )
        if len(names) != len(set(names)):
            raise AppError(
                message="Dataset field names must be unique",
                code="duplicate_dataset_fields",
                status_code=400,
            )

    def _validate_dataset_name_available(self, *, project_id: str, name: str) -> None:
        normalized_name = name.strip()
        if not normalized_name:
            raise AppError("Dataset name cannot be empty", "invalid_dataset_name", 400)

        if self.repository is None:
            if any(
                dataset.project_id == project_id and dataset.name == normalized_name
                for dataset in self._datasets.values()
            ):
                raise AppError(
                    "A dataset with this name already exists in the project",
                    "dataset_name_conflict",
                    409,
                )
            return

        if self.repository.get_dataset_by_name(project_id=project_id, name=normalized_name):
            raise AppError(
                "A dataset with this name already exists in the project",
                "dataset_name_conflict",
                409,
            )

    def _build_materialized_rows(
        self,
        *,
        preview_id: str,
        fields: list[ImportFieldPreview],
    ) -> list[dict[str, object | None]]:
        parsed_file = self.imports.parse_preview_source(preview_id)
        source_fields_by_order = {field.order: field for field in parsed_file.fields}
        materialized_rows: list[dict[str, object | None]] = []

        for target_field in fields:
            if target_field.order not in source_fields_by_order:
                raise AppError(
                    message="Dataset field order does not match source preview",
                    code="invalid_dataset_field_order",
                    status_code=400,
                )

        for row in parsed_file.rows:
            materialized_row: dict[str, object | None] = {}
            for target_field in fields:
                source_field = source_fields_by_order[target_field.order]
                materialized_row[target_field.name] = coerce_value(
                    row.get(source_field.name),
                    target_field.inferred_type,
                )
            materialized_rows.append(materialized_row)

        return materialized_rows

    def _record_dataset_audit(self, dataset: Dataset) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="dataset.created",
            project_id=dataset.project_id,
            resource_type="dataset",
            resource_id=dataset.id,
            detail={
                "name": dataset.name,
                "source_preview_id": dataset.source_preview_id,
                "physical_table_name": dataset.physical_table_name,
                "row_count": dataset.row_count,
                "field_count": len(dataset.fields),
                "materialized": True,
            },
        )
        if not dataset.source_preview_id:
            return

        self.audit.record_lineage(
            project_id=dataset.project_id,
            source_type="file_import_preview",
            source_id=dataset.source_preview_id,
            target_type="dataset",
            target_id=dataset.id,
            transform_type="dataset_creation",
            transform_id=dataset.id,
        )

    def _record_derived_lineage(
        self,
        *,
        source_dataset_id: str,
        target_dataset: Dataset,
        transform_type: str,
        transform_id: str,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_lineage(
            project_id=target_dataset.project_id,
            source_type="dataset",
            source_id=source_dataset_id,
            target_type="dataset",
            target_id=target_dataset.id,
            transform_type=transform_type,
            transform_id=transform_id,
        )

    def _record_external_lineage(
        self,
        *,
        source_type: str,
        source_id: str,
        target_dataset: Dataset,
        transform_type: str,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_lineage(
            project_id=target_dataset.project_id,
            source_type=source_type,
            source_id=source_id,
            target_type="dataset",
            target_id=target_dataset.id,
            transform_type=transform_type,
            transform_id=target_dataset.id,
        )

    def _record_dataset_task(
        self,
        dataset: Dataset,
        *,
        task_type: str,
        retry_payload: dict[str, object] | None = None,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_success(
            project_id=dataset.project_id,
            name=f"Materialized dataset: {dataset.name}",
            task_type=task_type,
            related_resource_type="dataset",
            related_resource_id=dataset.id,
            retry_payload=retry_payload,
        )

    def _record_dataset_failure(
        self,
        *,
        project_id: str,
        name: str,
        task_type: str,
        error: Exception,
        related_resource_type: str | None,
        related_resource_id: str | None,
        retry_payload: dict[str, object] | None,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_exception(
            project_id=project_id,
            name=f"Materialize dataset failed: {name}",
            task_type=task_type,
            error=error,
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
            retry_payload=retry_payload,
        )


dataset_service = DatasetService()


def build_physical_table_name(dataset_id: str) -> str:
    return f"ds_{dataset_id.removeprefix('dataset_')[:24]}"


def dataset_materialization_retry_payload(
    payload: DatasetCreateRequest,
) -> dict[str, object]:
    return {
        "operation": "dataset_materialization",
        "project_id": payload.project_id,
        "preview_id": payload.preview_id,
        "name": payload.name,
        "fields": [field.model_dump() for field in payload.fields],
    }


def dataset_to_response_shape(dataset: Dataset) -> DatasetResponse:
    return DatasetResponse(
        id=dataset.id,
        project_id=dataset.project_id,
        name=dataset.name,
        source_preview_id=dataset.source_preview_id,
        physical_table_name=dataset.physical_table_name,
        row_count=dataset.row_count,
        fields=dataset.fields,
    )


def build_field_quality(
    *,
    field: ImportFieldPreview,
    rows: list[dict[str, object | None]],
) -> DatasetFieldQuality:
    values = [row.get(field.name) for row in rows]
    null_count = sum(1 for value in values if value in (None, ""))
    non_null_values = [value for value in values if value not in (None, "")]
    distinct_values = {stable_quality_value(value) for value in non_null_values}
    duplicate_count = max(0, len(non_null_values) - len(distinct_values))
    warnings = build_field_quality_warnings(
        field=field,
        null_count=null_count,
        row_count=len(rows),
        distinct_count=len(distinct_values),
    )
    return DatasetFieldQuality(
        name=field.name,
        inferred_type=field.inferred_type,
        nullable=field.nullable,
        null_count=null_count,
        null_ratio=ratio(null_count, len(rows)),
        distinct_count=len(distinct_values),
        duplicate_count=duplicate_count,
        sample_values=sample_values(non_null_values),
        warnings=warnings,
    )


def build_field_quality_warnings(
    *,
    field: ImportFieldPreview,
    null_count: int,
    row_count: int,
    distinct_count: int,
) -> list[str]:
    warnings: list[str] = []
    if row_count == 0:
        warnings.append("empty_dataset")
        return warnings
    if null_count and not field.nullable:
        warnings.append("unexpected_nulls")
    if ratio(null_count, row_count) >= 0.5:
        warnings.append("high_null_ratio")
    if distinct_count == 1 and row_count > 1:
        warnings.append("single_distinct_value")
    return warnings


def build_dataset_quality_warnings(
    *,
    row_count: int,
    field_profiles: list[DatasetFieldQuality],
    duplicate_row_count: int,
) -> list[str]:
    warnings: list[str] = []
    if row_count == 0:
        warnings.append("empty_dataset")
    if duplicate_row_count:
        warnings.append("duplicate_rows_detected")
    if any(profile.null_ratio >= 0.5 for profile in field_profiles):
        warnings.append("high_null_fields_detected")
    return warnings


def count_duplicate_rows(
    *,
    rows: list[dict[str, object | None]],
    field_names: list[str],
) -> int:
    seen: set[tuple[object, ...]] = set()
    duplicates = 0
    for row in rows:
        key = tuple(stable_quality_value(row.get(field_name)) for field_name in field_names)
        if key in seen:
            duplicates += 1
            continue
        seen.add(key)
    return duplicates


def drop_system_row_ids(
    rows: list[dict[str, object | None]],
) -> list[dict[str, object | None]]:
    return [{key: value for key, value in row.items() if key != SYSTEM_ROW_ID} for row in rows]


def sample_values(values: list[object | None], limit: int = 5) -> list[object]:
    sampled: list[object] = []
    seen: set[object] = set()
    for value in values:
        stable_value = stable_quality_value(value)
        if stable_value in seen:
            continue
        seen.add(stable_value)
        sampled.append(value)
        if len(sampled) >= limit:
            break
    return sampled


def stable_quality_value(value: object | None) -> object:
    if isinstance(value, list | dict | set):
        return str(value)
    return value


def ratio(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(numerator / denominator, 4)
