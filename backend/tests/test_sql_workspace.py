from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import get_db_session
from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )

    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_project(client: TestClient, headers: dict[str, str], name: str = "SQL Project") -> str:
    response = client.post(
        "/api/projects",
        headers=headers,
        json={"name": name, "description": None},
    )

    assert response.status_code == 201
    return response.json()["id"]


def create_dataset(client: TestClient, headers: dict[str, str], project_id: str) -> dict:
    upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "orders.csv",
                b"customer,amount,region\nAda,19.5,West\nLin,42.0,East\n",
                "text/csv",
            )
        },
    )
    assert upload_response.status_code == 201
    preview = upload_response.json()

    dataset_response = client.post(
        "/api/datasets",
        headers=headers,
        json={
            "project_id": project_id,
            "preview_id": preview["id"],
            "name": "Orders",
            "fields": preview["fields"],
        },
    )
    assert dataset_response.status_code == 201
    return dataset_response.json()


def test_sql_workspace_runs_project_scoped_read_only_query(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    dataset = create_dataset(client, headers, project_id)

    metadata_response = client.get(
        "/api/sql/metadata",
        headers=headers,
        params={"project_id": project_id},
    )
    assert metadata_response.status_code == 200
    metadata = metadata_response.json()
    assert metadata["datasets"][0]["table_alias"] == dataset["id"]

    query_response = client.post(
        "/api/sql/run",
        headers=headers,
        json={
            "project_id": project_id,
            "sql": f"SELECT customer, amount FROM {dataset['id']} WHERE region = 'West'",
            "limit": 20,
        },
    )

    assert query_response.status_code == 200
    result = query_response.json()
    assert result["columns"] == ["customer", "amount"]
    assert result["row_count"] == 1
    assert result["rows"][0] == {"customer": "Ada", "amount": 19.5}
    assert dataset["physical_table_name"] in result["executed_sql"]

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        operation_log = session.scalar(
            select(OperationLogModel).where(OperationLogModel.action == "sql.query_executed")
        )
    finally:
        session.close()

    assert operation_log is not None
    assert operation_log.project_id == project_id
    assert operation_log.detail["row_count"] == 1


def test_sql_workspace_rejects_write_operations(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)

    response = client.post(
        "/api/sql/run",
        headers=headers,
        json={"project_id": project_id, "sql": "DELETE FROM dataset_1", "limit": 20},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "sql_not_read_only"


def test_sql_workspace_rejects_unknown_dataset_alias(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    create_dataset(client, headers, project_id)

    response = client.post(
        "/api/sql/run",
        headers=headers,
        json={
            "project_id": project_id,
            "sql": "SELECT * FROM dataset_outside_project",
            "limit": 20,
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "sql_unknown_dataset"


def test_sql_workspace_saves_query_result_as_data_view(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    dataset = create_dataset(client, headers, project_id)

    save_response = client.post(
        "/api/sql/save-data-view",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "West Orders View",
            "description": "Reusable SQL result",
            "sql": f"SELECT * FROM {dataset['id']} WHERE region = 'West'",
            "limit": 100,
        },
    )

    assert save_response.status_code == 200
    data_view = save_response.json()
    assert data_view["name"] == "West Orders View"
    assert data_view["source_type"] == "sql_query"
    assert data_view["row_count"] == 1
    assert [field["name"] for field in data_view["fields"]] == ["customer", "amount", "region"]
    assert data_view["fields"][1]["inferred_type"] == "decimal"

    preview_response = client.get(
        f"/api/data-views/{data_view['id']}/preview",
        headers=headers,
        params={"page": 1, "page_size": 20},
    )
    assert preview_response.status_code == 200
    preview = preview_response.json()
    assert preview["rows"][0] == {
        "_das_row_id": 1,
        "customer": "Ada",
        "amount": 19.5,
        "region": "West",
    }

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        saved_log = session.scalar(
            select(OperationLogModel).where(OperationLogModel.action == "sql.data_view_saved")
        )
    finally:
        session.close()

    assert saved_log is not None
    assert saved_log.resource_id == data_view["id"]
    assert saved_log.detail["row_count"] == 1


def test_sql_data_view_lineage_uses_stable_short_reference_for_long_sql(
    client: TestClient,
) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    dataset = create_dataset(client, headers, project_id)
    long_sql = f"""
SELECT
  customer,
  amount,
  region,
  amount AS amount_copy,
  region AS region_copy
FROM {dataset["id"]}
WHERE region = 'West' OR region = 'East'
ORDER BY customer
"""

    save_response = client.post(
        "/api/sql/save-data-view",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Long SQL View",
            "description": "Reusable long SQL result",
            "sql": long_sql,
            "limit": 100,
        },
    )

    assert save_response.status_code == 200
    data_view = save_response.json()
    assert data_view["source_sql"] == long_sql

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        lineage_edge = session.scalar(
            select(LineageEdgeModel).where(
                LineageEdgeModel.target_id == data_view["id"],
                LineageEdgeModel.source_type == "sql_query",
            )
        )
    finally:
        session.close()

    assert lineage_edge is not None
    assert lineage_edge.source_id.startswith("sql_query_")
    assert len(lineage_edge.source_id) <= 128
