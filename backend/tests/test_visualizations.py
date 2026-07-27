from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import load_workbook
from sqlalchemy import select

from app.core.database import get_db_session
from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel
from app.models.data_view import ReportExport as ReportExportModel
from app.models.task import Task as TaskModel


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


def test_dashboard_reopens_updates_and_exports_with_traceability(client: TestClient) -> None:
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
                "aggregation": "sum",
            },
        },
    )
    chart = chart_response.json()
    dashboard_response = client.post(
        "/api/dashboards",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Regional Revenue Report",
            "layout": {
                "mode": "report",
                "theme": "warm",
                "items": [{"chart_id": chart["id"], "x": 0, "y": 0, "w": 12, "h": 6}],
                "global_filters": [
                    {
                        "id": "filter_region",
                        "field": "region",
                        "operator": "neq",
                        "value": "West",
                        "data_view_id": data_view["id"],
                    }
                ],
                "active_selections": [
                    {"chart_id": chart["id"], "field": "region", "value": "East"}
                ],
            },
        },
    )
    assert dashboard_response.status_code == 201
    dashboard = dashboard_response.json()
    assert dashboard["configuration_version"] == 1
    assert dashboard["layout"]["theme"] == "warm"

    update_response = client.patch(
        f"/api/dashboards/{dashboard['id']}",
        headers=headers,
        json={
            "expected_version": 1,
            "name": "Regional Revenue Delivery",
            "layout": {
                **dashboard["layout"],
                "theme": "aurora",
            },
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["configuration_version"] == 2
    assert updated["name"] == "Regional Revenue Delivery"
    assert updated["layout"]["global_filters"][0]["field"] == "region"
    assert updated["layout"]["active_selections"][0]["value"] == "East"

    conflict_response = client.patch(
        f"/api/dashboards/{dashboard['id']}",
        headers=headers,
        json={"expected_version": 1, "name": "Stale overwrite"},
    )
    assert conflict_response.status_code == 409
    assert conflict_response.json()["error"]["code"] == "dashboard_version_conflict"

    csv_response = client.post(
        f"/api/dashboards/{dashboard['id']}/exports",
        headers=headers,
        params={"format": "csv"},
    )
    assert csv_response.status_code == 200
    assert csv_response.headers["x-source-resource-id"] == dashboard["id"]
    assert dashboard["id"] in csv_response.content.decode("utf-8-sig")
    assert data_view["id"] in csv_response.content.decode("utf-8-sig")

    xlsx_response = client.post(
        f"/api/dashboards/{dashboard['id']}/exports",
        headers=headers,
        params={"format": "xlsx"},
    )
    assert xlsx_response.status_code == 200
    workbook = load_workbook(BytesIO(xlsx_response.content), read_only=True)
    assert workbook["Report"]["B2"].value == dashboard["id"]

    pdf_response = client.post(
        f"/api/dashboards/{dashboard['id']}/exports",
        headers=headers,
        params={"format": "pdf"},
    )
    assert pdf_response.status_code == 200
    assert pdf_response.content.startswith(b"%PDF")
    pdf_export_id = pdf_response.headers["x-report-export-id"]

    export_list_response = client.get(
        f"/api/dashboards/{dashboard['id']}/exports",
        headers=headers,
    )
    assert export_list_response.status_code == 200
    assert len(export_list_response.json()["items"]) == 3
    assert export_list_response.json()["items"][0]["dashboard_id"] == dashboard["id"]

    download_response = client.get(
        f"/api/dashboards/{dashboard['id']}/exports/{pdf_export_id}",
        headers=headers,
    )
    assert download_response.status_code == 200
    assert download_response.content == pdf_response.content

    reopened_response = client.get(f"/api/dashboards/{dashboard['id']}", headers=headers)
    assert reopened_response.status_code == 200
    assert reopened_response.json()["layout"] == updated["layout"]

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        export_records = list(
            session.scalars(
                select(ReportExportModel).where(ReportExportModel.dashboard_id == dashboard["id"])
            )
        )
        export_task = session.scalar(
            select(TaskModel).where(
                TaskModel.task_type == "report_export",
                TaskModel.related_resource_id == pdf_export_id,
            )
        )
        export_log = session.scalar(
            select(OperationLogModel).where(
                OperationLogModel.action == "report.exported",
                OperationLogModel.resource_id == pdf_export_id,
            )
        )
        export_lineage = session.scalar(
            select(LineageEdgeModel).where(
                LineageEdgeModel.target_type == "report_export",
                LineageEdgeModel.target_id == pdf_export_id,
            )
        )
    finally:
        session.close()

    assert len(export_records) == 3
    assert export_records[0].source_snapshot["dashboard_id"] == dashboard["id"]
    assert export_task is not None
    assert export_task.status == "success"
    assert export_log is not None
    assert export_log.detail["dashboard_id"] == dashboard["id"]
    assert export_lineage is not None
    assert export_lineage.source_id == dashboard["id"]
