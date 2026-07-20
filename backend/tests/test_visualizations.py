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
        json={"name": "Visualization Project", "description": None},
    )

    assert response.status_code == 201
    return response.json()["id"]


def create_data_view(client: TestClient, headers: dict[str, str], project_id: str) -> dict:
    response = client.post(
        "/api/data-views",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Revenue View",
            "description": None,
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

    assert response.status_code == 201
    return response.json()


def test_chart_and_dashboard_resources_use_data_views(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    data_view = create_data_view(client, headers, project_id)

    chart_response = client.post(
        "/api/charts",
        headers=headers,
        json={
            "project_id": project_id,
            "data_view_id": data_view["id"],
            "name": "Revenue by Region",
            "chart_type": "bar",
            "config": {
                "dimension": "region",
                "metric": "revenue",
                "data_view_name": data_view["name"],
            },
        },
    )

    assert chart_response.status_code == 201
    chart = chart_response.json()
    assert chart["data_view_id"] == data_view["id"]
    assert chart["config"]["dimension"] == "region"

    dashboard_response = client.post(
        "/api/dashboards",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Regional Revenue Dashboard",
            "layout": {
                "mode": "dashboard",
                "items": [
                    {"chart_id": chart["id"], "x": 0, "y": 0, "w": 6, "h": 4},
                ],
            },
        },
    )

    assert dashboard_response.status_code == 201
    dashboard = dashboard_response.json()
    assert dashboard["layout"]["items"][0]["chart_id"] == chart["id"]

    chart_list_response = client.get(
        "/api/charts",
        headers=headers,
        params={"project_id": project_id},
    )
    assert chart_list_response.status_code == 200
    assert chart_list_response.json()["items"][0]["id"] == chart["id"]

    dashboard_list_response = client.get(
        "/api/dashboards",
        headers=headers,
        params={"project_id": project_id},
    )
    assert dashboard_list_response.status_code == 200
    assert dashboard_list_response.json()["items"][0]["id"] == dashboard["id"]

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        chart_log = session.scalar(
            select(OperationLogModel).where(OperationLogModel.action == "chart.created")
        )
        dashboard_log = session.scalar(
            select(OperationLogModel).where(OperationLogModel.action == "dashboard.created")
        )
        chart_lineage = session.scalar(
            select(LineageEdgeModel).where(LineageEdgeModel.target_id == chart["id"])
        )
        dashboard_lineage = session.scalar(
            select(LineageEdgeModel).where(LineageEdgeModel.target_id == dashboard["id"])
        )
    finally:
        session.close()

    assert chart_log is not None
    assert chart_log.resource_id == chart["id"]
    assert dashboard_log is not None
    assert dashboard_log.resource_id == dashboard["id"]
    assert chart_lineage is not None
    assert chart_lineage.source_id == data_view["id"]
    assert chart_lineage.target_type == "chart"
    assert dashboard_lineage is not None
    assert dashboard_lineage.source_id == chart["id"]
    assert dashboard_lineage.target_type == "dashboard"


def test_chart_rejects_data_view_from_another_project(client: TestClient) -> None:
    headers = login(client)
    source_project_id = create_project(client, headers)
    target_project_id = create_project(client, headers)
    data_view = create_data_view(client, headers, source_project_id)

    response = client.post(
        "/api/charts",
        headers=headers,
        json={
            "project_id": target_project_id,
            "data_view_id": data_view["id"],
            "name": "Invalid Chart",
            "chart_type": "bar",
            "config": {},
        },
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "chart_data_view_project_mismatch"
