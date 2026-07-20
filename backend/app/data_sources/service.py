from dataclasses import dataclass, replace
from datetime import datetime

from app.audit.service import AuditService
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.ids import new_id
from app.core.secrets import CredentialCipher, SecretDecryptionError
from app.core.sql_safety import validate_read_only_sql
from app.data_sources.connectors import (
    ConnectionTestResult,
    ExternalDatabaseConnectionConfig,
    ExternalDatabaseTester,
    ExternalTable,
)
from app.data_sources.repository import DataSourceRepository
from app.data_sources.schemas import (
    DatabaseType,
    ExternalDatabaseConnectionActionRequest,
    ExternalDatabaseConnectionCreateRequest,
    ExternalDatabaseConnectionResponse,
    ExternalDatabaseConnectionUpdateRequest,
    ExternalDatasetImportResponse,
    ExternalImportDetailResponse,
    ExternalImportHistoryItemResponse,
    ExternalImportHistoryResponse,
    ExternalImportPreviewResponse,
    ExternalSqlImportRequest,
    ExternalSqlPreviewRequest,
    ExternalTableColumnResponse,
    ExternalTableImportRequest,
    ExternalTablePreviewRequest,
    ExternalTableResponse,
)
from app.datasets.service import DatasetService, dataset_to_response_shape
from app.imports.parser import coerce_value
from app.imports.schemas import ImportFieldPreview
from app.models.data_source import ExternalDatabaseConnection as ExternalDatabaseConnectionModel
from app.tasks.service import TaskService, to_task_response

DEFAULT_PORTS: dict[DatabaseType, int] = {
    "mysql": 3306,
    "postgresql": 5432,
}


@dataclass(frozen=True)
class ExternalDatabaseConnection:
    id: str
    project_id: str
    name: str
    database_type: DatabaseType
    host: str
    port: int
    database_name: str
    username: str
    password_secret: str
    read_only: bool
    status: str
    last_error: str | None
    archived_at: datetime | None
    created_at: datetime
    updated_at: datetime


class DataSourceService:
    def __init__(
        self,
        repository: DataSourceRepository | None = None,
        tester: ExternalDatabaseTester | None = None,
        audit: AuditService | None = None,
        credential_cipher: CredentialCipher | None = None,
    ) -> None:
        self.repository = repository
        self.tester = tester or ExternalDatabaseTester()
        self.audit = audit
        self.credential_cipher = credential_cipher or default_credential_cipher()
        self._connections: dict[str, ExternalDatabaseConnection] = {}

    def reset(self) -> None:
        self._connections = {}

    def create_connection(
        self,
        payload: ExternalDatabaseConnectionCreateRequest,
    ) -> ExternalDatabaseConnection:
        if not payload.read_only:
            raise AppError(
                "External database connections must be read-only in the first stage",
                "external_connection_must_be_read_only",
                400,
            )

        port = payload.port or DEFAULT_PORTS[payload.database_type]
        connection_id = (
            new_id("src") if self.repository is not None else f"src_{len(self._connections) + 1}"
        )
        connection = ExternalDatabaseConnection(
            id=connection_id,
            project_id=payload.project_id,
            name=payload.name.strip(),
            database_type=payload.database_type,
            host=payload.host.strip(),
            port=port,
            database_name=payload.database_name.strip(),
            username=payload.username.strip(),
            password_secret=self.credential_cipher.encrypt(payload.password),
            read_only=True,
            status="untested",
            last_error=None,
            archived_at=None,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        if self.repository is not None:
            if (
                self.repository.get_connection_by_name(
                    project_id=connection.project_id,
                    name=connection.name,
                )
                is not None
            ):
                raise AppError(
                    "External database connection name already exists in this project",
                    "external_connection_name_conflict",
                    409,
                )
            saved = model_to_connection(
                self.repository.save_connection(
                    ExternalDatabaseConnectionModel(
                        id=connection.id,
                        project_id=connection.project_id,
                        name=connection.name,
                        database_type=connection.database_type,
                        host=connection.host,
                        port=connection.port,
                        database_name=connection.database_name,
                        username=connection.username,
                        password_secret=connection.password_secret,
                        read_only=connection.read_only,
                        status=connection.status,
                        last_error=connection.last_error,
                    )
                )
            )
            self._record_created(saved)
            return saved

        existing = next(
            (
                item
                for item in self._connections.values()
                if item.project_id == connection.project_id and item.name == connection.name
            ),
            None,
        )
        if existing is not None:
            raise AppError(
                "External database connection name already exists in this project",
                "external_connection_name_conflict",
                409,
            )
        self._connections[connection.id] = connection
        return connection

    def list_connections(
        self,
        project_id: str,
        *,
        include_archived: bool = False,
    ) -> list[ExternalDatabaseConnection]:
        if self.repository is not None:
            return [
                model_to_connection(connection)
                for connection in self.repository.list_connections(
                    project_id,
                    include_archived=include_archived,
                )
            ]

        return [
            connection
            for connection in self._connections.values()
            if connection.project_id == project_id
            and (include_archived or connection.archived_at is None)
        ]

    def update_connection(
        self,
        connection_id: str,
        payload: ExternalDatabaseConnectionUpdateRequest,
    ) -> ExternalDatabaseConnection:
        connection = self._get_connection_including_archived(connection_id)
        self._validate_project(connection, payload.project_id)
        if connection.archived_at is not None:
            raise AppError(
                "Archived external database connection must be restored before editing",
                "external_connection_archived",
                409,
            )
        if payload.read_only is False:
            raise AppError(
                "External database connections must be read-only in the first stage",
                "external_connection_must_be_read_only",
                400,
            )

        name = payload.name.strip() if payload.name is not None else connection.name
        existing = self._get_connection_by_name(project_id=connection.project_id, name=name)
        if existing is not None and existing.id != connection.id:
            raise AppError(
                "External database connection name already exists in this project",
                "external_connection_name_conflict",
                409,
            )

        database_type = payload.database_type or connection.database_type
        port = payload.port
        if port is None:
            port = (
                DEFAULT_PORTS[database_type]
                if payload.database_type is not None
                and payload.database_type != connection.database_type
                else connection.port
            )
        password_rotated = payload.password is not None
        password_secret = (
            self.credential_cipher.encrypt(payload.password)
            if payload.password is not None
            else connection.password_secret
        )
        changes = {
            "name": name,
            "database_type": database_type,
            "host": payload.host.strip() if payload.host is not None else connection.host,
            "port": port,
            "database_name": (
                payload.database_name.strip()
                if payload.database_name is not None
                else connection.database_name
            ),
            "username": (
                payload.username.strip() if payload.username is not None else connection.username
            ),
            "password_secret": password_secret,
            "read_only": True,
            "status": "untested",
            "last_error": None,
        }

        if self.repository is not None:
            model = self.repository.get_connection(connection.id)
            if model is None:
                raise AppError(
                    "External database connection not found",
                    "external_connection_not_found",
                    404,
                )
            for field, value in changes.items():
                setattr(model, field, value)
            updated = model_to_connection(self.repository.update_connection(model))
        else:
            updated = replace(connection, **changes, updated_at=datetime.now())
            self._connections[updated.id] = updated

        self._record_updated(updated, password_rotated=password_rotated)
        return updated

    def archive_connection(
        self,
        connection_id: str,
        payload: ExternalDatabaseConnectionActionRequest,
    ) -> ExternalDatabaseConnection:
        connection = self._get_connection_including_archived(connection_id)
        self._validate_project(connection, payload.project_id)
        if connection.archived_at is not None:
            return connection
        archived_at = datetime.now()

        if self.repository is not None:
            model = self.repository.get_connection(connection.id)
            if model is None:
                raise AppError(
                    "External database connection not found",
                    "external_connection_not_found",
                    404,
                )
            model.archived_at = archived_at
            archived = model_to_connection(self.repository.update_connection(model))
        else:
            archived = replace(connection, archived_at=archived_at, updated_at=archived_at)
            self._connections[archived.id] = archived

        self._record_lifecycle(archived, action="archived")
        return archived

    def restore_connection(
        self,
        connection_id: str,
        payload: ExternalDatabaseConnectionActionRequest,
    ) -> ExternalDatabaseConnection:
        connection = self._get_connection_including_archived(connection_id)
        self._validate_project(connection, payload.project_id)
        if connection.archived_at is None:
            return connection

        if self.repository is not None:
            model = self.repository.get_connection(connection.id)
            if model is None:
                raise AppError(
                    "External database connection not found",
                    "external_connection_not_found",
                    404,
                )
            model.archived_at = None
            model.status = "untested"
            model.last_error = None
            restored = model_to_connection(self.repository.update_connection(model))
        else:
            restored = replace(
                connection,
                archived_at=None,
                status="untested",
                last_error=None,
                updated_at=datetime.now(),
            )
            self._connections[restored.id] = restored

        self._record_lifecycle(restored, action="restored")
        return restored

    def test_connection(
        self, connection_id: str
    ) -> tuple[ExternalDatabaseConnection, ConnectionTestResult]:
        connection = self.get_connection(connection_id)
        try:
            result = self.tester.test_connection(self._connection_to_config(connection))
        except Exception as error:
            result = ConnectionTestResult(
                ok=False,
                message=str(error) or error.__class__.__name__,
            )

        updated = self._update_test_status(connection, result)
        self._record_test(updated, result)
        return updated, result

    def inspect_external_schema(
        self, connection_id: str
    ) -> tuple[
        ExternalDatabaseConnection,
        list[ExternalTable],
    ]:
        connection = self.get_connection(connection_id)
        tables = self.tester.inspect_schema(self._connection_to_config(connection))
        self._record_schema_inspected(connection, tables)
        return connection, tables

    def preview_external_table(
        self,
        connection_id: str,
        payload: ExternalTablePreviewRequest,
    ) -> ExternalImportPreviewResponse:
        connection = self._get_project_connection(
            connection_id=connection_id,
            project_id=payload.project_id,
        )
        source_result = self.tester.read_table(
            self._connection_to_config(connection),
            schema_name=payload.schema_name,
            table_name=payload.table_name,
            limit=payload.limit,
        )
        return ExternalImportPreviewResponse(
            source_type="external_table",
            fields=source_result.fields,
            sample_rows=source_result.rows,
            row_count=len(source_result.rows),
            limit=payload.limit,
        )

    def preview_external_sql(
        self,
        connection_id: str,
        payload: ExternalSqlPreviewRequest,
    ) -> ExternalImportPreviewResponse:
        connection = self._get_project_connection(
            connection_id=connection_id,
            project_id=payload.project_id,
        )
        validate_read_only_sql(payload.sql)
        source_result = self.tester.run_read_only_sql(
            self._connection_to_config(connection),
            sql=payload.sql,
            limit=payload.limit,
        )
        return ExternalImportPreviewResponse(
            source_type="external_sql",
            fields=source_result.fields,
            sample_rows=source_result.rows,
            row_count=len(source_result.rows),
            limit=payload.limit,
        )

    def import_external_table(
        self,
        connection_id: str,
        payload: ExternalTableImportRequest,
        datasets: DatasetService,
    ) -> ExternalDatasetImportResponse:
        connection = self._get_project_connection(
            connection_id=connection_id,
            project_id=payload.project_id,
        )
        source_id = external_table_source_id(
            connection_id=connection.id,
            schema_name=payload.schema_name,
            table_name=payload.table_name,
        )
        retry_payload = {
            "operation": "external_table_import",
            "connection_id": connection.id,
            **payload.model_dump(),
        }
        try:
            source_result = self.tester.read_table(
                self._connection_to_config(connection),
                schema_name=payload.schema_name,
                table_name=payload.table_name,
                limit=payload.limit,
            )
            fields = payload.fields or source_result.fields
            retry_payload["fields"] = [field.model_dump() for field in fields]
            rows = remap_external_rows(
                source_fields=source_result.fields,
                target_fields=fields,
                rows=source_result.rows,
            )
        except Exception as error:
            datasets.record_materialization_failure(
                project_id=payload.project_id,
                name=payload.dataset_name.strip(),
                task_type="external_table_import",
                error=error,
                related_resource_type="external_database_table",
                related_resource_id=source_id,
                retry_payload=retry_payload,
            )
            raise
        dataset = datasets.create_materialized_dataset_from_rows(
            project_id=payload.project_id,
            name=payload.dataset_name.strip(),
            fields=fields,
            rows=rows,
            source_type="external_database_table",
            source_id=source_id,
            transform_type="external_table_import",
            task_type="external_table_import",
            retry_payload=retry_payload,
        )
        self._record_dataset_imported(
            connection=connection,
            dataset_id=dataset.id,
            source_type="external_table",
            source_id=source_id,
            row_count=dataset.row_count,
            detail={
                "schema_name": payload.schema_name,
                "table_name": payload.table_name,
                "limit": payload.limit,
            },
        )
        return ExternalDatasetImportResponse(
            dataset=dataset_to_response_shape(dataset),
            source_type="external_table",
            row_count=dataset.row_count,
        )

    def import_external_sql(
        self,
        connection_id: str,
        payload: ExternalSqlImportRequest,
        datasets: DatasetService,
    ) -> ExternalDatasetImportResponse:
        connection = self._get_project_connection(
            connection_id=connection_id,
            project_id=payload.project_id,
        )
        validate_read_only_sql(payload.sql)
        source_id = external_sql_source_id(connection_id=connection.id, sql=payload.sql)
        retry_payload = {
            "operation": "external_sql_import",
            "connection_id": connection.id,
            **payload.model_dump(),
        }
        try:
            source_result = self.tester.run_read_only_sql(
                self._connection_to_config(connection),
                sql=payload.sql,
                limit=payload.limit,
            )
            fields = payload.fields or source_result.fields
            retry_payload["fields"] = [field.model_dump() for field in fields]
            rows = remap_external_rows(
                source_fields=source_result.fields,
                target_fields=fields,
                rows=source_result.rows,
            )
        except Exception as error:
            datasets.record_materialization_failure(
                project_id=payload.project_id,
                name=payload.dataset_name.strip(),
                task_type="external_sql_import",
                error=error,
                related_resource_type="external_database_sql",
                related_resource_id=source_id,
                retry_payload=retry_payload,
            )
            raise
        dataset = datasets.create_materialized_dataset_from_rows(
            project_id=payload.project_id,
            name=payload.dataset_name.strip(),
            fields=fields,
            rows=rows,
            source_type="external_database_sql",
            source_id=source_id,
            transform_type="external_sql_import",
            task_type="external_sql_import",
            retry_payload=retry_payload,
        )
        self._record_dataset_imported(
            connection=connection,
            dataset_id=dataset.id,
            source_type="external_sql",
            source_id=source_id,
            row_count=dataset.row_count,
            detail={
                "sql": payload.sql,
                "limit": payload.limit,
            },
        )
        return ExternalDatasetImportResponse(
            dataset=dataset_to_response_shape(dataset),
            source_type="external_sql",
            row_count=dataset.row_count,
        )

    def list_external_import_history(
        self,
        *,
        project_id: str,
        tasks: TaskService,
    ) -> ExternalImportHistoryResponse:
        external_tasks = [
            task
            for task in tasks.list_tasks(project_id)
            if task.task_type in ("external_table_import", "external_sql_import")
        ]
        return ExternalImportHistoryResponse(
            items=[external_import_task_to_history_item(task) for task in external_tasks]
        )

    def get_external_import_detail(
        self,
        *,
        task_id: str,
        tasks: TaskService,
    ) -> ExternalImportDetailResponse:
        task = tasks.get_task(task_id)
        if task.task_type not in ("external_table_import", "external_sql_import"):
            raise AppError(
                "Task is not an external database import",
                "external_import_task_not_found",
                404,
            )
        fields = external_import_payload_fields(task.retry_payload or {})
        return ExternalImportDetailResponse(
            item=external_import_task_to_history_item(task),
            fields=fields,
        )

    def get_connection(self, connection_id: str) -> ExternalDatabaseConnection:
        connection = self._get_connection_including_archived(connection_id)
        if connection.archived_at is not None:
            raise AppError(
                "External database connection is archived",
                "external_connection_archived",
                409,
            )
        return connection

    def _get_connection_including_archived(
        self,
        connection_id: str,
    ) -> ExternalDatabaseConnection:
        if self.repository is not None:
            connection = self.repository.get_connection(connection_id)
            if connection is None:
                raise AppError(
                    "External database connection not found", "external_connection_not_found", 404
                )
            return model_to_connection(connection)

        connection = self._connections.get(connection_id)
        if connection is None:
            raise AppError(
                "External database connection not found", "external_connection_not_found", 404
            )
        return connection

    def _get_connection_by_name(
        self,
        *,
        project_id: str,
        name: str,
    ) -> ExternalDatabaseConnection | None:
        if self.repository is not None:
            connection = self.repository.get_connection_by_name(project_id=project_id, name=name)
            return model_to_connection(connection) if connection is not None else None
        return next(
            (
                connection
                for connection in self._connections.values()
                if connection.project_id == project_id and connection.name == name
            ),
            None,
        )

    @staticmethod
    def _validate_project(connection: ExternalDatabaseConnection, project_id: str) -> None:
        if connection.project_id != project_id:
            raise AppError(
                "External database connection does not belong to this project",
                "external_connection_project_mismatch",
                400,
            )

    def _connection_to_config(
        self,
        connection: ExternalDatabaseConnection,
    ) -> ExternalDatabaseConnectionConfig:
        try:
            password = self.credential_cipher.decrypt(connection.password_secret)
        except SecretDecryptionError as error:
            raise AppError(
                "External database credential cannot be decrypted. "
                "Check the configured encryption key.",
                "external_connection_secret_unreadable",
                500,
            ) from error
        return ExternalDatabaseConnectionConfig(
            database_type=connection.database_type,
            host=connection.host,
            port=connection.port,
            database_name=connection.database_name,
            username=connection.username,
            password=password,
        )

    def _get_project_connection(
        self,
        *,
        connection_id: str,
        project_id: str,
    ) -> ExternalDatabaseConnection:
        connection = self.get_connection(connection_id)
        if connection.project_id != project_id:
            raise AppError(
                "External database connection does not belong to this project",
                "external_connection_project_mismatch",
                400,
            )
        return connection

    def _update_test_status(
        self,
        connection: ExternalDatabaseConnection,
        result: ConnectionTestResult,
    ) -> ExternalDatabaseConnection:
        status = "available" if result.ok else "failed"
        last_error = None if result.ok else result.message

        if self.repository is not None:
            model = self.repository.get_connection(connection.id)
            if model is None:
                raise AppError(
                    "External database connection not found", "external_connection_not_found", 404
                )
            model.status = status
            model.last_error = last_error
            if self.credential_cipher.is_legacy(model.password_secret):
                password = self.credential_cipher.decrypt(model.password_secret)
                model.password_secret = self.credential_cipher.encrypt(password)
            return model_to_connection(self.repository.update_connection(model))

        updated = ExternalDatabaseConnection(
            id=connection.id,
            project_id=connection.project_id,
            name=connection.name,
            database_type=connection.database_type,
            host=connection.host,
            port=connection.port,
            database_name=connection.database_name,
            username=connection.username,
            password_secret=connection.password_secret,
            read_only=connection.read_only,
            status=status,
            last_error=last_error,
            archived_at=connection.archived_at,
            created_at=connection.created_at,
            updated_at=datetime.now(),
        )
        self._connections[updated.id] = updated
        return updated

    def _record_created(self, connection: ExternalDatabaseConnection) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="data_source.external_database_created",
            project_id=connection.project_id,
            resource_type="external_database_connection",
            resource_id=connection.id,
            detail={
                "database_type": connection.database_type,
                "host": connection.host,
                "port": connection.port,
                "database_name": connection.database_name,
                "read_only": connection.read_only,
            },
        )

    def _record_updated(
        self,
        connection: ExternalDatabaseConnection,
        *,
        password_rotated: bool,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="data_source.external_database_updated",
            project_id=connection.project_id,
            resource_type="external_database_connection",
            resource_id=connection.id,
            detail={
                "database_type": connection.database_type,
                "host": connection.host,
                "port": connection.port,
                "database_name": connection.database_name,
                "username": connection.username,
                "password_rotated": password_rotated,
                "status": connection.status,
            },
        )

    def _record_lifecycle(
        self,
        connection: ExternalDatabaseConnection,
        *,
        action: str,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action=f"data_source.external_database_{action}",
            project_id=connection.project_id,
            resource_type="external_database_connection",
            resource_id=connection.id,
            detail={
                "archived_at": (
                    connection.archived_at.isoformat()
                    if connection.archived_at is not None
                    else None
                ),
            },
        )

    def _record_test(
        self,
        connection: ExternalDatabaseConnection,
        result: ConnectionTestResult,
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="data_source.external_database_tested",
            project_id=connection.project_id,
            resource_type="external_database_connection",
            resource_id=connection.id,
            detail={
                "ok": result.ok,
                "message": result.message,
                "status": connection.status,
            },
        )

    def _record_schema_inspected(
        self,
        connection: ExternalDatabaseConnection,
        tables: list[ExternalTable],
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="data_source.external_schema_inspected",
            project_id=connection.project_id,
            resource_type="external_database_connection",
            resource_id=connection.id,
            detail={
                "table_count": len(tables),
            },
        )

    def _record_dataset_imported(
        self,
        *,
        connection: ExternalDatabaseConnection,
        dataset_id: str,
        source_type: str,
        source_id: str,
        row_count: int,
        detail: dict[str, object],
    ) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action=f"data_source.{source_type}_imported",
            project_id=connection.project_id,
            resource_type="dataset",
            resource_id=dataset_id,
            detail={
                "connection_id": connection.id,
                "source_id": source_id,
                "row_count": row_count,
                **detail,
            },
        )


def model_to_connection(
    connection: ExternalDatabaseConnectionModel,
) -> ExternalDatabaseConnection:
    return ExternalDatabaseConnection(
        id=connection.id,
        project_id=connection.project_id,
        name=connection.name,
        database_type=connection.database_type,
        host=connection.host,
        port=connection.port,
        database_name=connection.database_name,
        username=connection.username,
        password_secret=connection.password_secret,
        read_only=connection.read_only,
        status=connection.status,
        last_error=connection.last_error,
        archived_at=connection.archived_at,
        created_at=connection.created_at,
        updated_at=connection.updated_at,
    )


def to_external_database_connection_response(
    connection: ExternalDatabaseConnection,
) -> ExternalDatabaseConnectionResponse:
    return ExternalDatabaseConnectionResponse(
        id=connection.id,
        project_id=connection.project_id,
        name=connection.name,
        database_type=connection.database_type,
        host=connection.host,
        port=connection.port,
        database_name=connection.database_name,
        username=connection.username,
        read_only=connection.read_only,
        status=connection.status,
        last_error=connection.last_error,
        archived_at=connection.archived_at,
        created_at=connection.created_at,
        updated_at=connection.updated_at,
    )


def external_table_to_response(table: ExternalTable) -> ExternalTableResponse:
    return ExternalTableResponse(
        schema_name=table.schema_name,
        table_name=table.table_name,
        columns=[
            ExternalTableColumnResponse(
                name=column.name,
                data_type=column.data_type,
                inferred_type=column.inferred_type,
                nullable=column.nullable,
                order=column.order,
            )
            for column in table.columns
        ],
    )


def remap_external_rows(
    *,
    source_fields: list[ImportFieldPreview],
    target_fields: list[ImportFieldPreview],
    rows: list[dict[str, object | None]],
) -> list[dict[str, object | None]]:
    source_fields_by_order = {field.order: field for field in source_fields}
    materialized_rows: list[dict[str, object | None]] = []

    for target_field in target_fields:
        if target_field.order not in source_fields_by_order:
            raise AppError(
                "External import field order does not match source result",
                "invalid_external_import_field_order",
                400,
            )

    for row in rows:
        materialized_row: dict[str, object | None] = {}
        for target_field in target_fields:
            source_field = source_fields_by_order[target_field.order]
            materialized_row[target_field.name] = coerce_value(
                row.get(source_field.name),
                target_field.inferred_type,
            )
        materialized_rows.append(materialized_row)

    return materialized_rows


def external_import_task_to_history_item(task) -> ExternalImportHistoryItemResponse:
    payload = task.retry_payload or {}
    source_type = "external_sql" if task.task_type == "external_sql_import" else "external_table"
    fields = external_import_payload_fields(payload)
    return ExternalImportHistoryItemResponse(
        task=to_task_response(task),
        source_type=source_type,
        connection_id=optional_string(payload.get("connection_id")),
        dataset_name=optional_string(payload.get("dataset_name")),
        schema_name=optional_string(payload.get("schema_name")),
        table_name=optional_string(payload.get("table_name")),
        sql=optional_string(payload.get("sql")),
        limit=optional_int(payload.get("limit")),
        field_count=len(fields) if fields else None,
    )


def external_import_payload_fields(payload: dict[str, object]) -> list[ImportFieldPreview]:
    raw_fields = payload.get("fields")
    if not isinstance(raw_fields, list):
        return []

    fields: list[ImportFieldPreview] = []
    for raw_field in raw_fields:
        if isinstance(raw_field, dict):
            fields.append(ImportFieldPreview.model_validate(raw_field))
    return fields


def optional_string(value: object) -> str | None:
    return value if isinstance(value, str) else None


def optional_int(value: object) -> int | None:
    return value if isinstance(value, int) else None


def connection_to_config(
    connection: ExternalDatabaseConnection,
    credential_cipher: CredentialCipher | None = None,
) -> ExternalDatabaseConnectionConfig:
    cipher = credential_cipher or default_credential_cipher()
    return ExternalDatabaseConnectionConfig(
        database_type=connection.database_type,
        host=connection.host,
        port=connection.port,
        database_name=connection.database_name,
        username=connection.username,
        password=cipher.decrypt(connection.password_secret),
    )


def external_table_source_id(
    *,
    connection_id: str,
    schema_name: str,
    table_name: str,
) -> str:
    qualified_name = f"{schema_name}.{table_name}" if schema_name else table_name
    return f"{connection_id}:{qualified_name}"


def external_sql_source_id(*, connection_id: str, sql: str) -> str:
    compact_sql = " ".join(sql.split())
    return f"{connection_id}:{compact_sql[:96]}"


def default_credential_cipher() -> CredentialCipher:
    settings = get_settings()
    secret_key = settings.external_connection_encryption_key or settings.app_secret_key
    return CredentialCipher(secret_key)


def encode_secret(value: str) -> str:
    return default_credential_cipher().encrypt(value)


def decode_secret(value: str) -> str:
    return default_credential_cipher().decrypt(value)


data_source_service = DataSourceService()
