import re

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.audit.service import AuditService
from app.core.errors import AppError
from app.core.sql_safety import validate_read_only_sql
from app.data_views.schemas import DataViewCreateRequest
from app.data_views.service import DataViewService
from app.datasets.service import DatasetService
from app.imports.parser import infer_type
from app.imports.schemas import ImportFieldPreview
from app.sql_workspace.schemas import (
    SqlDatasetReference,
    SqlRunRequest,
    SqlRunResponse,
    SqlSaveDataViewRequest,
    SqlWorkspaceMetadataResponse,
)
from app.tasks.service import TaskService

SYSTEM_ROW_ID = "_das_row_id"


class SqlWorkspaceService:
    def __init__(
        self,
        *,
        session: Session,
        datasets: DatasetService,
        data_views: DataViewService | None = None,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
    ) -> None:
        self.session = session
        self.datasets = datasets
        self.data_views = data_views
        self.audit = audit
        self.tasks = tasks

    def metadata(self, project_id: str) -> SqlWorkspaceMetadataResponse:
        datasets = self.datasets.list_datasets(project_id)
        return SqlWorkspaceMetadataResponse(
            project_id=project_id,
            datasets=[
                SqlDatasetReference(
                    id=dataset.id,
                    name=dataset.name,
                    table_alias=dataset.id,
                    row_count=dataset.row_count,
                    fields=dataset.fields,
                )
                for dataset in datasets
            ],
        )

    def run(self, payload: SqlRunRequest) -> SqlRunResponse:
        try:
            rewritten_sql, columns, rows = self._execute_project_sql(
                project_id=payload.project_id,
                sql=payload.sql,
                limit=payload.limit,
            )
            self._record_sql_audit(
                project_id=payload.project_id,
                sql=payload.sql,
                row_count=len(rows),
            )
        except Exception as error:
            self._record_sql_failure(
                project_id=payload.project_id,
                name="Run SQL query failed",
                task_type="sql_query_run",
                sql=payload.sql,
                error=error,
                retry_payload=None,
            )
            raise

        return SqlRunResponse(
            project_id=payload.project_id,
            executed_sql=rewritten_sql,
            columns=columns,
            rows=rows,
            row_count=len(rows),
            limit=payload.limit,
        )

    def save_as_data_view(self, payload: SqlSaveDataViewRequest):
        try:
            if self.data_views is None:
                raise AppError(
                    "Data view service is not configured", "data_view_service_missing", 500
                )

            rewritten_sql, columns, rows = self._execute_project_sql(
                project_id=payload.project_id,
                sql=payload.sql,
                limit=payload.limit,
            )
            fields = infer_data_view_fields(columns=columns, rows=rows)
            data_view = self.data_views.create_data_view(
                DataViewCreateRequest(
                    project_id=payload.project_id,
                    name=payload.name,
                    description=payload.description,
                    source_type="sql_query",
                    source_id=None,
                    source_sql=payload.sql,
                    fields=fields,
                    rows=rows,
                )
            )
            self._record_sql_save_audit(
                project_id=payload.project_id,
                sql=payload.sql,
                data_view_id=data_view.id,
                row_count=len(rows),
            )
            self._record_sql_save_task(
                project_id=payload.project_id,
                data_view_id=data_view.id,
                data_view_name=data_view.name,
            )
            return data_view
        except Exception as error:
            self._record_sql_failure(
                project_id=payload.project_id,
                name=f"Materialize SQL data view failed: {payload.name}",
                task_type="sql_data_view_materialization",
                sql=payload.sql,
                error=error,
                retry_payload={
                    "operation": "sql_data_view_materialization",
                    "project_id": payload.project_id,
                    "name": payload.name,
                    "description": payload.description,
                    "sql": payload.sql,
                    "limit": payload.limit,
                },
            )
            raise

    def _execute_project_sql(
        self,
        *,
        project_id: str,
        sql: str,
        limit: int,
    ) -> tuple[str, list[str], list[dict[str, object | None]]]:
        validate_read_only_sql(sql)
        dataset_map = {dataset.id: dataset for dataset in self.datasets.list_datasets(project_id)}
        if not dataset_map:
            raise AppError("Project has no datasets to query", "sql_no_project_datasets", 400)

        rewritten_sql = rewrite_dataset_aliases(
            sql=sql,
            dataset_table_names={
                dataset_id: dataset.physical_table_name
                for dataset_id, dataset in dataset_map.items()
            },
        )
        limited_sql = f"SELECT * FROM ({rewritten_sql}) AS das_query_result LIMIT :das_limit"
        result = self.session.execute(text(limited_sql), {"das_limit": limit})
        raw_rows = [dict(row._mapping) for row in result.all()]
        raw_columns = list(raw_rows[0].keys()) if raw_rows else list(result.keys())
        columns = [column for column in raw_columns if column != SYSTEM_ROW_ID]
        rows = [
            {column: value for column, value in row.items() if column != SYSTEM_ROW_ID}
            for row in raw_rows
        ]
        return rewritten_sql, columns, rows

    def _record_sql_audit(self, *, project_id: str, sql: str, row_count: int) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="sql.query_executed",
            project_id=project_id,
            resource_type="sql_query",
            resource_id=None,
            detail={
                "sql": sql,
                "row_count": row_count,
            },
        )

    def _record_sql_save_audit(
        self,
        *,
        project_id: str,
        sql: str,
        data_view_id: str,
        row_count: int,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="sql.data_view_saved",
            project_id=project_id,
            resource_type="data_view",
            resource_id=data_view_id,
            detail={
                "sql": sql,
                "row_count": row_count,
            },
        )

    def _record_sql_save_task(
        self,
        *,
        project_id: str,
        data_view_id: str,
        data_view_name: str,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_success(
            project_id=project_id,
            name=f"Materialized SQL data view: {data_view_name}",
            task_type="sql_data_view_materialization",
            related_resource_type="data_view",
            related_resource_id=data_view_id,
        )

    def _record_sql_failure(
        self,
        *,
        project_id: str,
        name: str,
        task_type: str,
        sql: str,
        error: Exception,
        retry_payload: dict[str, object] | None,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_exception(
            project_id=project_id,
            name=name,
            task_type=task_type,
            error=error,
            related_resource_type="sql_query",
            related_resource_id=sql[:128],
            retry_payload=retry_payload,
        )


def rewrite_dataset_aliases(*, sql: str, dataset_table_names: dict[str, str]) -> str:
    rewritten = sql.rstrip().rstrip(";")
    referenced_aliases = set(re.findall(r"\b(dataset_[A-Za-z0-9_]+)\b", rewritten))
    unknown_aliases = referenced_aliases.difference(dataset_table_names.keys())
    if unknown_aliases:
        raise AppError(
            "SQL references datasets outside the project",
            "sql_unknown_dataset",
            400,
        )

    for alias in sorted(dataset_table_names.keys(), key=len, reverse=True):
        physical_table = dataset_table_names[alias]
        rewritten = re.sub(
            rf"\b{re.escape(alias)}\b",
            f'"{physical_table}"',
            rewritten,
        )
    return rewritten


def infer_data_view_fields(
    *,
    columns: list[str],
    rows: list[dict[str, object | None]],
) -> list[ImportFieldPreview]:
    return [
        ImportFieldPreview(
            name=column,
            inferred_type=infer_type(
                [value for value in [row.get(column) for row in rows] if value is not None]
            ),
            nullable=any(row.get(column) is None for row in rows),
            order=index,
        )
        for index, column in enumerate(columns)
    ]
