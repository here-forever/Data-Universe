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


def create_project(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "Data View Project", "description": None},
    )

    assert response.status_code == 201
    return response.json()["id"]


def test_create_list_and_preview_data_view(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)

    create_response = client.post(
        "/api/data-views",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Regional Revenue",
            "description": "Reusable chart source",
            "source_type": "manual_test",
            "source_id": "manual_1",
            "source_sql": None,
            "fields": [
                {"name": "region", "inferred_type": "text", "nullable": False, "order": 0},
                {"name": "revenue", "inferred_type": "decimal", "nullable": False, "order": 1},
            ],
            "rows": [
                {"region": "East", "revenue": 42.0},
                {"region": "West", "revenue": 19.5},
            ],
        },
    )

    assert create_response.status_code == 201
    data_view = create_response.json()
    assert data_view["name"] == "Regional Revenue"
    assert data_view["physical_table_name"].startswith("dv_")
    assert data_view["row_count"] == 2

    list_response = client.get(
        "/api/data-views",
        headers=headers,
        params={"project_id": project_id},
    )
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["id"] == data_view["id"]

    preview_response = client.get(
        f"/api/data-views/{data_view['id']}/preview",
        headers=headers,
        params={"page": 1, "page_size": 1},
    )
    assert preview_response.status_code == 200
    preview = preview_response.json()
    assert preview["total_rows"] == 2
    assert preview["rows"][0]["region"] == "East"
    assert preview["rows"][0]["revenue"] == 42.0

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        operation_log = session.scalar(
            select(OperationLogModel).where(OperationLogModel.action == "data_view.created")
        )
        lineage_edge = session.scalar(
            select(LineageEdgeModel).where(LineageEdgeModel.target_id == data_view["id"])
        )
    finally:
        session.close()

    assert operation_log is not None
    assert operation_log.resource_id == data_view["id"]
    assert lineage_edge is not None
    assert lineage_edge.source_type == "manual_test"
    assert lineage_edge.target_type == "data_view"
