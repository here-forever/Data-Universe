from dataclasses import dataclass
from hashlib import sha256

from app.audit.service import AuditService
from app.core.errors import AppError
from app.core.ids import new_id
from app.data_views.repository import DataViewRepository
from app.data_views.schemas import DataViewCreateRequest, DataViewResponse
from app.datasets.materializer import POSTGRES_IDENTIFIER_LIMIT, SYSTEM_ROW_ID
from app.imports.schemas import ImportFieldPreview
from app.models.data_view import DataView as DataViewModel
from app.models.data_view import DataViewField as DataViewFieldModel
from app.models.data_view import DataViewTableMap as DataViewTableMapModel


@dataclass(frozen=True)
class DataView:
    id: str
    project_id: str
    name: str
    description: str | None
    source_type: str
    source_id: str | None
    source_sql: str | None
    physical_table_name: str
    row_count: int
    fields: list[ImportFieldPreview]


class DataViewService:
    def __init__(
        self,
        repository: DataViewRepository | None = None,
        audit: AuditService | None = None,
    ) -> None:
        self.repository = repository
        self.audit = audit
        self._data_views: dict[str, DataView] = {}

    def reset(self) -> None:
        self._data_views = {}

    def create_data_view(self, payload: DataViewCreateRequest) -> DataView:
        validate_fields(payload.fields)
        data_view_id = new_id("view")
        if self.repository is None:
            data_view_id = f"view_{len(self._data_views) + 1}"
        data_view = DataView(
            id=data_view_id,
            project_id=payload.project_id,
            name=payload.name,
            description=payload.description,
            source_type=payload.source_type,
            source_id=payload.source_id,
            source_sql=payload.source_sql,
            physical_table_name=build_data_view_table_name(data_view_id),
            row_count=len(payload.rows),
            fields=payload.fields,
        )

        if self.repository is not None:
            self.repository.save_data_view(
                data_view=DataViewModel(
                    id=data_view.id,
                    project_id=data_view.project_id,
                    name=data_view.name,
                    description=data_view.description,
                    source_type=data_view.source_type,
                    source_id=data_view.source_id,
                    source_sql=data_view.source_sql,
                    row_count=data_view.row_count,
                ),
                fields=[
                    DataViewFieldModel(
                        id=new_id("vfield"),
                        data_view_id=data_view.id,
                        name=field.name,
                        data_type=field.inferred_type,
                        nullable=field.nullable,
                        order=field.order,
                    )
                    for field in data_view.fields
                ],
                table_map=DataViewTableMapModel(
                    id=new_id("vtm"),
                    data_view_id=data_view.id,
                    physical_table_name=data_view.physical_table_name,
                ),
                materialized_fields=data_view.fields,
                materialized_rows=payload.rows,
            )
            self._record_data_view_audit(data_view)
            return data_view

        self._data_views[data_view.id] = data_view
        return data_view

    def list_data_views(self, project_id: str) -> list[DataView]:
        if self.repository is None:
            return [
                data_view
                for data_view in self._data_views.values()
                if data_view.project_id == project_id
            ]
        return [
            self._model_to_data_view(model) for model in self.repository.list_data_views(project_id)
        ]

    def get_data_view(self, data_view_id: str) -> DataView:
        if self.repository is None:
            data_view = self._data_views.get(data_view_id)
            if data_view is None:
                raise AppError("Data view not found", "data_view_not_found", 404)
            return data_view

        model = self.repository.get_data_view(data_view_id)
        if model is None:
            raise AppError("Data view not found", "data_view_not_found", 404)
        return self._model_to_data_view(model)

    def preview_data_view_rows(
        self,
        *,
        data_view_id: str,
        page: int,
        page_size: int,
    ) -> tuple[DataView, list[dict[str, object | None]]]:
        validate_pagination(page=page, page_size=page_size)
        data_view = self.get_data_view(data_view_id)

        if self.repository is None:
            return data_view, []

        table_map = self.repository.get_table_map(data_view.id)
        if table_map is None:
            raise AppError(
                "Data view table mapping not found", "data_view_table_map_not_found", 404
            )
        rows = self.repository.preview_rows(
            table_name=table_map.physical_table_name,
            fields=data_view.fields,
            page=page,
            page_size=page_size,
        )
        return data_view, rows

    def _model_to_data_view(self, model: DataViewModel) -> DataView:
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
                "Data view table mapping not found", "data_view_table_map_not_found", 404
            )
        return DataView(
            id=model.id,
            project_id=model.project_id,
            name=model.name,
            description=model.description,
            source_type=model.source_type,
            source_id=model.source_id,
            source_sql=model.source_sql,
            physical_table_name=table_map.physical_table_name,
            row_count=model.row_count,
            fields=fields,
        )

    def _record_data_view_audit(self, data_view: DataView) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="data_view.created",
            project_id=data_view.project_id,
            resource_type="data_view",
            resource_id=data_view.id,
            detail={
                "name": data_view.name,
                "source_type": data_view.source_type,
                "source_id": data_view.source_id,
                "row_count": data_view.row_count,
                "field_count": len(data_view.fields),
            },
        )
        self.audit.record_lineage(
            project_id=data_view.project_id,
            source_type=data_view.source_type,
            source_id=lineage_source_id(data_view),
            target_type="data_view",
            target_id=data_view.id,
            transform_type=f"{data_view.source_type}_materialization",
            transform_id=data_view.id,
        )


def to_data_view_response(data_view: DataView) -> DataViewResponse:
    return DataViewResponse(
        id=data_view.id,
        project_id=data_view.project_id,
        name=data_view.name,
        description=data_view.description,
        source_type=data_view.source_type,
        source_id=data_view.source_id,
        source_sql=data_view.source_sql,
        physical_table_name=data_view.physical_table_name,
        row_count=data_view.row_count,
        fields=data_view.fields,
    )


def validate_fields(fields: list[ImportFieldPreview]) -> None:
    names = [field.name for field in fields]
    if any(not name.strip() for name in names):
        raise AppError("Data view field names cannot be empty", "invalid_data_view_fields", 400)
    if SYSTEM_ROW_ID in names:
        raise AppError(f"{SYSTEM_ROW_ID} is reserved", "reserved_data_view_field_name", 400)
    if any(len(name.encode("utf-8")) > POSTGRES_IDENTIFIER_LIMIT for name in names):
        raise AppError("Data view field names are too long", "data_view_field_name_too_long", 400)
    if len(names) != len(set(names)):
        raise AppError("Data view field names must be unique", "duplicate_data_view_fields", 400)


def validate_pagination(*, page: int, page_size: int) -> None:
    if page < 1:
        raise AppError("Page must be greater than 0", "invalid_page", 400)
    if page_size < 1 or page_size > 200:
        raise AppError("Page size must be between 1 and 200", "invalid_page_size", 400)


def build_data_view_table_name(data_view_id: str) -> str:
    return f"dv_{data_view_id.removeprefix('view_')[:24]}"


def lineage_source_id(data_view: DataView) -> str:
    if data_view.source_id:
        if len(data_view.source_id) <= 128:
            return data_view.source_id
        return stable_lineage_reference(data_view.source_type, data_view.source_id)

    if data_view.source_sql:
        return stable_lineage_reference("sql_query", data_view.source_sql)

    return data_view.id


def stable_lineage_reference(source_type: str, value: str) -> str:
    digest = sha256(value.encode("utf-8")).hexdigest()[:24]
    prefix = "".join(
        character if character.isalnum() or character == "_" else "_"
        for character in source_type
    ).strip("_") or "source"
    reference = f"{prefix}_{digest}"
    return reference[:128]


data_view_service = DataViewService()
