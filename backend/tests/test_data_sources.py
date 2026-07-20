from base64 import b64encode

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.api.routes.data_sources import get_data_source_service
from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.repository import AuthRepository
from app.auth.service import AuthService
from app.core.database import Base, get_db_session, import_models
from app.core.errors import AppError
from app.data_sources.connectors import (
    ConnectionTestResult,
    ExternalDatabaseConnectionConfig,
    ExternalQueryResult,
    ExternalTable,
    ExternalTableColumn,
    build_connect_args,
    build_sqlalchemy_url,
)
from app.data_sources.repository import DataSourceRepository
from app.data_sources.schemas import (
    ExternalDatabaseConnectionActionRequest,
    ExternalDatabaseConnectionCreateRequest,
    ExternalDatabaseConnectionUpdateRequest,
    ExternalSqlImportRequest,
    ExternalTableImportRequest,
    ExternalTablePreviewRequest,
)
from app.data_sources.service import DataSourceService, decode_secret
from app.datasets.repository import DatasetRepository
from app.datasets.service import DatasetService
from app.imports.schemas import ImportFieldPreview
from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel
from app.models.task import Task as TaskModel
from app.projects.repository import ProjectRepository
from app.projects.service import ProjectService
from app.tasks.repository import TaskRepository
from app.tasks.retry_executor import TaskRetryExecutor
from app.tasks.service import TaskService


class FakeTester:
    def __init__(self, result: ConnectionTestResult | None = None) -> None:
        self.result = result or ConnectionTestResult(ok=True, message="fake read-only ok")
        self.configs: list[ExternalDatabaseConnectionConfig] = []
        self.inspect_configs: list[ExternalDatabaseConnectionConfig] = []
        self.table_reads: list[tuple[ExternalDatabaseConnectionConfig, str, str, int]] = []
        self.sql_reads: list[tuple[ExternalDatabaseConnectionConfig, str, int]] = []

    def test_connection(
        self,
        config: ExternalDatabaseConnectionConfig,
    ) -> ConnectionTestResult:
        self.configs.append(config)
        return self.result

    def inspect_schema(self, config: ExternalDatabaseConnectionConfig) -> list[ExternalTable]:
        self.inspect_configs.append(config)
        return [
            ExternalTable(
                schema_name="public",
                table_name="orders",
                columns=[
                    ExternalTableColumn(
                        name="customer",
                        data_type="TEXT",
                        inferred_type="text",
                        nullable=False,
                        order=0,
                    ),
                    ExternalTableColumn(
                        name="amount",
                        data_type="NUMERIC",
                        inferred_type="decimal",
                        nullable=False,
                        order=1,
                    ),
                ],
            )
        ]

    def read_table(
        self,
        config: ExternalDatabaseConnectionConfig,
        *,
        schema_name: str,
        table_name: str,
        limit: int,
    ) -> ExternalQueryResult:
        self.table_reads.append((config, schema_name, table_name, limit))
        return ExternalQueryResult(
            fields=[
                ImportFieldPreview(
                    name="customer",
                    inferred_type="text",
                    nullable=False,
                    order=0,
                ),
                ImportFieldPreview(
                    name="amount",
                    inferred_type="decimal",
                    nullable=False,
                    order=1,
                ),
            ],
            rows=[
                {"customer": "Ada", "amount": 19.5},
                {"customer": "Lin", "amount": 42.0},
            ],
        )

    def run_read_only_sql(
        self,
        config: ExternalDatabaseConnectionConfig,
        *,
        sql: str,
        limit: int,
    ) -> ExternalQueryResult:
        self.sql_reads.append((config, sql, limit))
        return ExternalQueryResult(
            fields=[
                ImportFieldPreview(
                    name="region",
                    inferred_type="text",
                    nullable=False,
                    order=0,
                ),
                ImportFieldPreview(
                    name="total_amount",
                    inferred_type="decimal",
                    nullable=False,
                    order=1,
                ),
            ],
            rows=[{"region": "West", "total_amount": 61.5}],
        )


class FlakyTableTester(FakeTester):
    def __init__(self) -> None:
        super().__init__()
        self.fail_next_table_read = True

    def read_table(
        self,
        config: ExternalDatabaseConnectionConfig,
        *,
        schema_name: str,
        table_name: str,
        limit: int,
    ) -> ExternalQueryResult:
        if self.fail_next_table_read:
            self.fail_next_table_read = False
            self.table_reads.append((config, schema_name, table_name, limit))
            raise RuntimeError("temporary external database timeout")
        return super().read_table(
            config,
            schema_name=schema_name,
            table_name=table_name,
            limit=limit,
        )


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )

    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_project(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "Data Source Project", "description": None},
    )

    assert response.status_code == 201
    return response.json()["id"]


def create_test_session() -> Session:
    import_models()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return session_factory()


def create_project_in_session(session: Session) -> tuple[str, str]:
    auth = AuthService(AuthRepository(session))
    owner = auth.get_or_create_default_admin()
    project = ProjectService(ProjectRepository(session), auth).create_project(
        name="External Source",
        description=None,
        owner=owner,
    )
    return project.id, owner.id


def test_external_database_connection_api_create_list_and_test(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    tester = FakeTester()

    create_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Warehouse",
            "database_type": "postgresql",
            "host": "warehouse.local",
            "database_name": "analytics",
            "username": "readonly_user",
            "password": "secret-password",
        },
    )

    assert create_response.status_code == 201
    connection = create_response.json()
    assert connection["id"].startswith("src_")
    assert connection["project_id"] == project_id
    assert connection["database_type"] == "postgresql"
    assert connection["port"] == 5432
    assert connection["read_only"] is True
    assert connection["status"] == "untested"
    assert connection["archived_at"] is None
    assert "password" not in connection

    list_response = client.get(
        "/api/data-sources/external-databases",
        headers=headers,
        params={"project_id": project_id},
    )
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["id"] == connection["id"]

    def override_get_data_source_service():
        session = next(client.app.dependency_overrides[get_db_session]())
        try:
            yield DataSourceService(
                DataSourceRepository(session),
                tester=tester,
                audit=AuditService(AuditRepository(session), actor_id="usr_admin"),
            )
        finally:
            session.close()

    client.app.dependency_overrides[get_data_source_service] = override_get_data_source_service
    test_response = client.post(
        f"/api/data-sources/external-databases/{connection['id']}/test",
        headers=headers,
    )
    client.app.dependency_overrides.pop(get_data_source_service, None)

    assert test_response.status_code == 200
    test_payload = test_response.json()
    assert test_payload["ok"] is True
    assert test_payload["connection"]["status"] == "available"
    assert test_payload["connection"]["last_error"] is None
    assert tester.configs[0].database_type == "postgresql"
    assert tester.configs[0].password == "secret-password"


def test_external_database_connection_api_updates_archives_and_restores(
    client: TestClient,
) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    create_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Warehouse",
            "database_type": "postgresql",
            "host": "warehouse.local",
            "database_name": "analytics",
            "username": "readonly_user",
            "password": "secret-password",
        },
    )
    connection_id = create_response.json()["id"]

    update_response = client.patch(
        f"/api/data-sources/external-databases/{connection_id}",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Warehouse primary",
            "database_type": "mysql",
            "host": "mysql.local",
            "database_name": "reporting",
            "username": "report_reader",
            "password": "rotated-password",
            "read_only": True,
        },
    )

    assert update_response.status_code == 200
    assert update_response.json()["name"] == "Warehouse primary"
    assert update_response.json()["database_type"] == "mysql"
    assert update_response.json()["port"] == 3306
    assert update_response.json()["status"] == "untested"
    assert "password" not in update_response.json()

    archive_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/archive",
        headers=headers,
        json={"project_id": project_id},
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["archived_at"] is not None

    active_list_response = client.get(
        "/api/data-sources/external-databases",
        headers=headers,
        params={"project_id": project_id},
    )
    assert active_list_response.json()["items"] == []

    archived_list_response = client.get(
        "/api/data-sources/external-databases",
        headers=headers,
        params={"project_id": project_id, "include_archived": True},
    )
    assert archived_list_response.json()["items"][0]["id"] == connection_id

    test_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/test",
        headers=headers,
    )
    assert test_response.status_code == 409
    assert test_response.json()["error"]["code"] == "external_connection_archived"

    restore_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/restore",
        headers=headers,
        json={"project_id": project_id},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["archived_at"] is None
    assert restore_response.json()["status"] == "untested"


def test_external_database_api_discovers_schema_and_imports_datasets(
    client: TestClient,
) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    tester = FakeTester()
    create_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Warehouse",
            "database_type": "postgresql",
            "host": "warehouse.local",
            "database_name": "analytics",
            "username": "readonly_user",
            "password": "secret-password",
        },
    )
    assert create_response.status_code == 201
    connection_id = create_response.json()["id"]

    def override_get_data_source_service():
        session = next(client.app.dependency_overrides[get_db_session]())
        try:
            yield DataSourceService(
                DataSourceRepository(session),
                tester=tester,
                audit=AuditService(AuditRepository(session), actor_id="usr_admin"),
            )
        finally:
            session.close()

    client.app.dependency_overrides[get_data_source_service] = override_get_data_source_service
    schema_response = client.get(
        f"/api/data-sources/external-databases/{connection_id}/schema",
        headers=headers,
    )
    table_preview_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/preview-table",
        headers=headers,
        json={
            "project_id": project_id,
            "schema_name": "public",
            "table_name": "orders",
            "limit": 25,
        },
    )
    sql_preview_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/preview-sql",
        headers=headers,
        json={
            "project_id": project_id,
            "sql": "SELECT region, SUM(amount) AS total_amount FROM orders GROUP BY region",
            "limit": 25,
        },
    )
    table_import_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/import-table",
        headers=headers,
        json={
            "project_id": project_id,
            "dataset_name": "External Orders",
            "schema_name": "public",
            "table_name": "orders",
            "limit": 100,
        },
    )
    sql_import_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/import-sql",
        headers=headers,
        json={
            "project_id": project_id,
            "dataset_name": "External SQL Orders",
            "sql": "SELECT customer, amount FROM orders",
            "limit": 100,
        },
    )
    unsafe_sql_response = client.post(
        f"/api/data-sources/external-databases/{connection_id}/import-sql",
        headers=headers,
        json={
            "project_id": project_id,
            "dataset_name": "Unsafe",
            "sql": "DELETE FROM orders",
            "limit": 100,
        },
    )
    client.app.dependency_overrides.pop(get_data_source_service, None)

    assert schema_response.status_code == 200
    schema_payload = schema_response.json()
    assert schema_payload["tables"][0]["schema_name"] == "public"
    assert schema_payload["tables"][0]["columns"][0]["name"] == "customer"

    assert table_preview_response.status_code == 200
    table_preview = table_preview_response.json()
    assert table_preview["source_type"] == "external_table"
    assert table_preview["fields"][0]["name"] == "customer"
    assert table_preview["sample_rows"][0]["customer"] == "Ada"
    assert sql_preview_response.status_code == 200
    sql_preview = sql_preview_response.json()
    assert sql_preview["source_type"] == "external_sql"
    assert sql_preview["fields"][0]["name"] == "region"

    assert table_import_response.status_code == 201
    table_dataset = table_import_response.json()["dataset"]
    assert table_dataset["name"] == "External Orders"
    assert table_dataset["row_count"] == 2

    assert sql_import_response.status_code == 201
    sql_dataset = sql_import_response.json()["dataset"]
    assert sql_dataset["name"] == "External SQL Orders"
    assert sql_dataset["row_count"] == 1

    preview_response = client.get(
        f"/api/datasets/{table_dataset['id']}/preview",
        headers=headers,
        params={"page": 1, "page_size": 10},
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["rows"][0]["customer"] == "Ada"
    assert unsafe_sql_response.status_code == 400
    assert unsafe_sql_response.json()["error"]["code"] == "sql_not_read_only"

    history_response = client.get(
        "/api/data-sources/external-imports",
        headers=headers,
        params={"project_id": project_id},
    )
    assert history_response.status_code == 200
    history = history_response.json()["items"]
    assert {item["source_type"] for item in history} == {"external_table", "external_sql"}
    assert all(item["connection_id"] == connection_id for item in history)
    table_history = next(item for item in history if item["source_type"] == "external_table")
    assert table_history["table_name"] == "orders"
    assert table_history["field_count"] == 2

    detail_response = client.get(
        f"/api/data-sources/external-imports/{table_history['task']['id']}",
        headers=headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["fields"][0]["name"] == "customer"


def test_external_database_connections_are_project_scoped_and_read_only(
    client: TestClient,
) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    other_project_id = create_project(client, headers)

    first_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Warehouse",
            "database_type": "mysql",
            "host": "mysql.local",
            "database_name": "orders",
            "username": "readonly_user",
            "password": "secret-password",
            "read_only": True,
        },
    )
    assert first_response.status_code == 201
    assert first_response.json()["port"] == 3306

    duplicate_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Warehouse",
            "database_type": "mysql",
            "host": "mysql.local",
            "database_name": "orders",
            "username": "readonly_user",
            "password": "secret-password",
        },
    )
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["error"]["code"] == "external_connection_name_conflict"

    unsafe_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Unsafe",
            "database_type": "postgresql",
            "host": "warehouse.local",
            "database_name": "analytics",
            "username": "writer",
            "password": "secret-password",
            "read_only": False,
        },
    )
    assert unsafe_response.status_code == 400
    assert unsafe_response.json()["error"]["code"] == "external_connection_must_be_read_only"

    other_response = client.post(
        "/api/data-sources/external-databases",
        headers=headers,
        json={
            "project_id": other_project_id,
            "name": "Warehouse",
            "database_type": "mysql",
            "host": "mysql.local",
            "database_name": "orders",
            "username": "readonly_user",
            "password": "secret-password",
        },
    )
    assert other_response.status_code == 201

    list_response = client.get(
        "/api/data-sources/external-databases",
        headers=headers,
        params={"project_id": project_id},
    )
    assert list_response.status_code == 200
    assert {item["project_id"] for item in list_response.json()["items"]} == {project_id}


def test_data_source_service_tests_connection_with_saved_secret_and_audit() -> None:
    session = create_test_session()
    project_id, actor_id = create_project_in_session(session)
    tester = FakeTester()
    repository = DataSourceRepository(session)
    service = DataSourceService(
        repository,
        tester=tester,
        audit=AuditService(AuditRepository(session), actor_id=actor_id),
    )

    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="postgresql",
            host="warehouse.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )
    assert decode_secret(connection.password_secret) == "secret-password"

    tested_connection, result = service.test_connection(connection.id)

    assert result.ok is True
    assert tested_connection.status == "available"
    assert tested_connection.last_error is None
    assert tester.configs == [
        ExternalDatabaseConnectionConfig(
            database_type="postgresql",
            host="warehouse.local",
            port=5432,
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    ]

    logs = list(session.scalars(select(OperationLogModel).order_by(OperationLogModel.created_at)))
    assert {log.action for log in logs} >= {
        "data_source.external_database_created",
        "data_source.external_database_tested",
    }


def test_data_source_service_encrypts_rotates_and_archives_credentials() -> None:
    session = create_test_session()
    project_id, actor_id = create_project_in_session(session)
    tester = FakeTester()
    repository = DataSourceRepository(session)
    service = DataSourceService(
        repository,
        tester=tester,
        audit=AuditService(AuditRepository(session), actor_id=actor_id),
    )
    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="postgresql",
            host="warehouse.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )

    assert connection.password_secret.startswith("fernet:v1:")
    assert "secret-password" not in connection.password_secret
    assert decode_secret(connection.password_secret) == "secret-password"

    legacy_model = repository.get_connection(connection.id)
    assert legacy_model is not None
    legacy_model.password_secret = b64encode(b"secret-password").decode("ascii")
    repository.update_connection(legacy_model)
    service.test_connection(connection.id)
    upgraded_model = repository.get_connection(connection.id)
    assert upgraded_model is not None
    assert upgraded_model.password_secret.startswith("fernet:v1:")

    updated = service.update_connection(
        connection.id,
        ExternalDatabaseConnectionUpdateRequest(
            project_id=project_id,
            host="warehouse-primary.local",
        ),
    )
    service.test_connection(updated.id)
    assert tester.configs[-1].password == "secret-password"

    rotated = service.update_connection(
        connection.id,
        ExternalDatabaseConnectionUpdateRequest(
            project_id=project_id,
            password="rotated-password",
        ),
    )
    service.test_connection(rotated.id)
    assert tester.configs[-1].password == "rotated-password"

    archived = service.archive_connection(
        connection.id,
        ExternalDatabaseConnectionActionRequest(project_id=project_id),
    )
    assert archived.archived_at is not None
    assert service.list_connections(project_id) == []
    assert service.list_connections(project_id, include_archived=True)[0].id == connection.id

    with pytest.raises(AppError) as exc_info:
        service.test_connection(connection.id)
    assert exc_info.value.code == "external_connection_archived"

    restored = service.restore_connection(
        connection.id,
        ExternalDatabaseConnectionActionRequest(project_id=project_id),
    )
    assert restored.archived_at is None
    assert restored.status == "untested"

    actions = {log.action for log in session.scalars(select(OperationLogModel)).all()}
    assert actions >= {
        "data_source.external_database_updated",
        "data_source.external_database_archived",
        "data_source.external_database_restored",
    }


def test_data_source_service_records_failed_connection_test() -> None:
    session = create_test_session()
    project_id, _actor_id = create_project_in_session(session)
    service = DataSourceService(
        DataSourceRepository(session),
        tester=FakeTester(ConnectionTestResult(ok=False, message="network timeout")),
    )
    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="mysql",
            host="mysql.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )

    tested_connection, result = service.test_connection(connection.id)

    assert result.ok is False
    assert tested_connection.status == "failed"
    assert tested_connection.last_error == "network timeout"

    try:
        service.get_connection("src_missing")
    except AppError as exc:
        assert exc.code == "external_connection_not_found"
    else:
        raise AssertionError("Expected missing connection to raise AppError")


def test_data_source_service_discovers_schema_and_imports_external_table() -> None:
    session = create_test_session()
    project_id, actor_id = create_project_in_session(session)
    tester = FakeTester()
    audit = AuditService(AuditRepository(session), actor_id=actor_id)
    service = DataSourceService(
        DataSourceRepository(session),
        tester=tester,
        audit=audit,
    )
    datasets = DatasetService(
        DatasetRepository(session),
        audit=audit,
        tasks=TaskService(TaskRepository(session), initiator_id=actor_id),
    )
    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="postgresql",
            host="warehouse.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )

    inspected_connection, tables = service.inspect_external_schema(connection.id)
    result = service.import_external_table(
        connection.id,
        ExternalTableImportRequest(
            project_id=project_id,
            dataset_name="External Orders",
            schema_name="public",
            table_name="orders",
            limit=500,
        ),
        datasets,
    )

    assert inspected_connection.id == connection.id
    assert tables[0].table_name == "orders"
    assert tester.inspect_configs[0].password == "secret-password"
    assert tester.table_reads[0][1:] == ("public", "orders", 500)
    assert result.source_type == "external_table"
    assert result.dataset.name == "External Orders"
    assert result.dataset.row_count == 2

    dataset, rows = datasets.list_dataset_rows(result.dataset.id)
    assert dataset.fields[0].name == "customer"
    assert rows[0]["customer"] == "Ada"

    tasks = list(session.scalars(select(TaskModel).order_by(TaskModel.created_at)))
    assert any(
        task.task_type == "external_table_import"
        and task.status == "success"
        and task.related_resource_id == result.dataset.id
        for task in tasks
    )
    logs = list(session.scalars(select(OperationLogModel).order_by(OperationLogModel.created_at)))
    assert {log.action for log in logs} >= {
        "data_source.external_schema_inspected",
        "data_source.external_table_imported",
        "dataset.created",
    }
    lineage_edges = list(session.scalars(select(LineageEdgeModel)))
    assert any(
        edge.source_type == "external_database_table"
        and edge.source_id == f"{connection.id}:public.orders"
        and edge.target_id == result.dataset.id
        for edge in lineage_edges
    )


def test_data_source_service_previews_and_imports_with_edited_fields() -> None:
    session = create_test_session()
    project_id, actor_id = create_project_in_session(session)
    tester = FakeTester()
    audit = AuditService(AuditRepository(session), actor_id=actor_id)
    tasks = TaskService(TaskRepository(session), initiator_id=actor_id)
    service = DataSourceService(
        DataSourceRepository(session),
        tester=tester,
        audit=audit,
    )
    datasets = DatasetService(
        DatasetRepository(session),
        audit=audit,
        tasks=tasks,
    )
    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="postgresql",
            host="warehouse.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )

    preview = service.preview_external_table(
        connection.id,
        ExternalTablePreviewRequest(
            project_id=project_id,
            schema_name="public",
            table_name="orders",
            limit=20,
        ),
    )
    edited_fields = [
        ImportFieldPreview(
            name="buyer_name",
            inferred_type="text",
            nullable=False,
            order=0,
        ),
        ImportFieldPreview(
            name="order_amount",
            inferred_type="decimal",
            nullable=False,
            order=1,
        ),
    ]
    result = service.import_external_table(
        connection.id,
        ExternalTableImportRequest(
            project_id=project_id,
            dataset_name="Edited External Orders",
            schema_name="public",
            table_name="orders",
            limit=20,
            fields=edited_fields,
        ),
        datasets,
    )

    assert preview.fields[0].name == "customer"
    dataset, rows = datasets.list_dataset_rows(result.dataset.id)
    assert [field.name for field in dataset.fields] == ["buyer_name", "order_amount"]
    assert rows[0]["buyer_name"] == "Ada"
    assert rows[0]["order_amount"] == 19.5

    task = next(
        task for task in tasks.list_tasks(project_id) if task.task_type == "external_table_import"
    )
    assert task.status == "success"
    assert task.retry_payload is not None
    assert task.retry_payload["fields"][0]["name"] == "buyer_name"


def test_data_source_service_imports_external_read_only_sql() -> None:
    session = create_test_session()
    project_id, actor_id = create_project_in_session(session)
    tester = FakeTester()
    audit = AuditService(AuditRepository(session), actor_id=actor_id)
    service = DataSourceService(
        DataSourceRepository(session),
        tester=tester,
        audit=audit,
    )
    datasets = DatasetService(
        DatasetRepository(session),
        audit=audit,
        tasks=TaskService(TaskRepository(session), initiator_id=actor_id),
    )
    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="mysql",
            host="mysql.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )

    result = service.import_external_sql(
        connection.id,
        ExternalSqlImportRequest(
            project_id=project_id,
            dataset_name="Regional Sales",
            sql="SELECT region, SUM(amount) AS total_amount FROM orders GROUP BY region",
            limit=100,
        ),
        datasets,
    )

    assert tester.sql_reads[0][1:] == (
        "SELECT region, SUM(amount) AS total_amount FROM orders GROUP BY region",
        100,
    )
    assert result.source_type == "external_sql"
    assert result.dataset.name == "Regional Sales"
    dataset, rows = datasets.list_dataset_rows(result.dataset.id)
    assert dataset.row_count == 1
    assert rows[0]["region"] == "West"

    lineage_edges = list(session.scalars(select(LineageEdgeModel)))
    assert any(
        edge.source_type == "external_database_sql"
        and edge.target_id == result.dataset.id
        and edge.transform_type == "external_sql_import"
        for edge in lineage_edges
    )


def test_external_table_import_retry_replays_real_external_read() -> None:
    session = create_test_session()
    project_id, actor_id = create_project_in_session(session)
    tester = FlakyTableTester()
    audit = AuditService(AuditRepository(session), actor_id=actor_id)
    tasks = TaskService(TaskRepository(session), initiator_id=actor_id)
    service = DataSourceService(
        DataSourceRepository(session),
        tester=tester,
        audit=audit,
    )
    datasets = DatasetService(
        DatasetRepository(session),
        audit=audit,
        tasks=tasks,
    )
    connection = service.create_connection(
        ExternalDatabaseConnectionCreateRequest(
            project_id=project_id,
            name="Warehouse",
            database_type="postgresql",
            host="warehouse.local",
            database_name="analytics",
            username="readonly_user",
            password="secret-password",
        )
    )

    try:
        service.import_external_table(
            connection.id,
            ExternalTableImportRequest(
                project_id=project_id,
                dataset_name="Retry External Orders",
                schema_name="public",
                table_name="orders",
                limit=100,
            ),
            datasets,
        )
    except RuntimeError as exc:
        assert "timeout" in str(exc)
    else:
        raise AssertionError("Expected first external table import to fail")

    failed_task = next(
        task for task in tasks.list_tasks(project_id) if task.task_type == "external_table_import"
    )
    assert failed_task.status == "retryable"
    assert failed_task.retry_payload is not None
    assert failed_task.retry_payload["connection_id"] == connection.id

    retry_executor = TaskRetryExecutor(
        tasks=tasks,
        imports=None,
        datasets=DatasetService(DatasetRepository(session), audit=audit, tasks=None),
        data_sources=service,
        cleaning=None,
        sql_workspace=None,
        visualizations=None,
    )
    retry_result = retry_executor.retry(failed_task.id)

    assert retry_result.original_task.status == "retryable"
    assert retry_result.retry_task.status == "success"
    assert retry_result.retry_task.related_resource_type == "dataset"
    assert len(tester.table_reads) == 2

    dataset_id = retry_result.retry_task.related_resource_id
    assert dataset_id is not None
    dataset, rows = datasets.list_dataset_rows(dataset_id)
    assert dataset.name == "Retry External Orders"
    assert rows[0]["customer"] == "Ada"


def test_external_database_connector_builds_urls_and_timeouts() -> None:
    postgres_config = ExternalDatabaseConnectionConfig(
        database_type="postgresql",
        host="db.local",
        port=5432,
        database_name="analytics db",
        username="read only",
        password="secret/pass",
    )
    mysql_config = ExternalDatabaseConnectionConfig(
        database_type="mysql",
        host="mysql.local",
        port=3306,
        database_name="orders",
        username="readonly",
        password="secret",
    )

    assert (
        build_sqlalchemy_url(postgres_config)
        == "postgresql+psycopg://read+only:secret%2Fpass@db.local:5432/analytics+db"
    )
    assert build_connect_args(postgres_config) == {"connect_timeout": 5}
    assert build_sqlalchemy_url(mysql_config) == (
        "mysql+pymysql://readonly:secret@mysql.local:3306/orders"
    )
    assert build_connect_args(mysql_config) == {
        "connect_timeout": 5,
        "read_timeout": 5,
        "write_timeout": 5,
    }
