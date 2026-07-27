from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import get_db_session
from app.models.analysis import AnalysisDefinition
from app.models.audit import LineageEdge, OperationLog
from app.models.task import Task


def login(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_sales_dataset(client: TestClient, headers: dict[str, str]) -> dict:
    project_response = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "Saved Analysis Project", "description": None},
    )
    project_id = project_response.json()["id"]
    upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "orders.csv",
                (
                    b"region,channel,orders,revenue,cost\n"
                    b"East,Online,10,120,72\n"
                    b"East,Retail,6,90,61\n"
                    b"West,Online,8,110,70\n"
                    b"West,Retail,4,60,45\n"
                ),
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
            "name": "Saved Analysis Sales",
            "fields": preview["fields"],
        },
    )
    assert dataset_response.status_code == 201
    return dataset_response.json()


def definition_payload(dataset: dict) -> dict:
    return {
        "project_id": dataset["project_id"],
        "source_dataset_id": dataset["id"],
        "name": "Regional revenue model",
        "description": "Reusable regional sales analysis",
        "configuration": {
            "aggregate": {
                "dimensions": ["region"],
                "metrics": [
                    {
                        "field": "revenue",
                        "aggregation": "sum",
                        "alias": "revenue_total",
                    }
                ],
                "filters": [{"field": "channel", "operator": "eq", "value": "Online"}],
                "sort_by": "revenue_total",
                "sort_direction": "desc",
                "limit": 20,
            },
            "statistics": {
                "fields": ["revenue", "channel"],
                "filters": [],
            },
            "correlation": {
                "fields": ["revenue", "cost", "orders"],
                "filters": [],
            },
            "regression": {
                "feature": "orders",
                "target": "revenue",
                "filters": [],
            },
            "presentation": {"view_mode": "dimension", "chart_type": "line"},
        },
    }


def test_saved_analysis_can_reopen_run_and_materialize_with_lineage(
    client: TestClient,
) -> None:
    headers = login(client)
    dataset = create_sales_dataset(client, headers)

    create_response = client.post(
        "/api/analytics/definitions",
        headers=headers,
        json=definition_payload(dataset),
    )
    assert create_response.status_code == 201
    definition = create_response.json()
    assert definition["configuration_version"] == 1
    assert definition["configuration"]["aggregate"]["dimensions"] == ["region"]
    assert definition["configuration"]["presentation"]["chart_type"] == "line"

    list_response = client.get(
        "/api/analytics/definitions",
        headers=headers,
        params={"project_id": dataset["project_id"]},
    )
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["id"] == definition["id"]

    get_response = client.get(
        f"/api/analytics/definitions/{definition['id']}",
        headers=headers,
    )
    assert get_response.status_code == 200
    assert get_response.json()["configuration"] == definition["configuration"]

    run_response = client.post(
        f"/api/analytics/definitions/{definition['id']}/run",
        headers=headers,
    )
    assert run_response.status_code == 200
    run = run_response.json()
    assert run["definition"]["last_run_at"] is not None
    assert run["aggregate"]["rows"] == [
        {"region": "East", "revenue_total": 120.0},
        {"region": "West", "revenue_total": 110.0},
    ]
    assert run["statistics"]["numeric_fields"][0]["mean"] == 95.0
    assert run["correlation"]["observations"] == 4
    assert run["regression"]["r_squared"] > 0.8

    materialize_response = client.post(
        f"/api/analytics/definitions/{definition['id']}/materialize",
        headers=headers,
        json={
            "name": "Regional revenue view",
            "description": "Materialized from saved analysis",
            "result_type": "aggregate",
        },
    )
    assert materialize_response.status_code == 201
    data_view = materialize_response.json()
    assert data_view["source_type"] == "analysis_definition"
    assert data_view["source_id"] == definition["id"]
    assert data_view["row_count"] == 2
    assert [field["name"] for field in data_view["fields"]] == [
        "region",
        "revenue_total",
    ]

    preview_response = client.get(
        f"/api/data-views/{data_view['id']}/preview",
        headers=headers,
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["rows"][0]["revenue_total"] == 120.0

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        saved_model = session.get(AnalysisDefinition, definition["id"])
        actions = set(session.scalars(select(OperationLog.action)).all())
        lineage = list(session.scalars(select(LineageEdge)).all())
        task = session.scalar(
            select(Task).where(Task.task_type == "analysis_data_view_materialization")
        )
    finally:
        session.close()

    assert saved_model is not None
    assert saved_model.last_run_at is not None
    assert "analysis_definition.created" in actions
    assert "analysis_definition.executed" in actions
    assert "analysis_definition.materialized" in actions
    assert any(
        edge.source_type == "dataset"
        and edge.source_id == dataset["id"]
        and edge.target_type == "analysis_definition"
        and edge.target_id == definition["id"]
        for edge in lineage
    )
    assert any(
        edge.source_type == "analysis_definition"
        and edge.source_id == definition["id"]
        and edge.target_type == "data_view"
        and edge.target_id == data_view["id"]
        for edge in lineage
    )
    assert task is not None
    assert task.status == "success"
    assert task.related_resource_id == data_view["id"]


def test_saved_analysis_materializes_selected_correlation_result(
    client: TestClient,
) -> None:
    headers = login(client)
    dataset = create_sales_dataset(client, headers)
    definition_response = client.post(
        "/api/analytics/definitions",
        headers=headers,
        json=definition_payload(dataset),
    )
    definition = definition_response.json()

    response = client.post(
        f"/api/analytics/definitions/{definition['id']}/materialize",
        headers=headers,
        json={"name": "Correlation matrix", "result_type": "correlation"},
    )

    assert response.status_code == 201
    data_view = response.json()
    assert data_view["row_count"] == 9
    assert [field["name"] for field in data_view["fields"]] == [
        "field",
        "related_field",
        "correlation",
    ]


def test_saved_analysis_rejects_duplicate_names_invalid_fields_and_scope(
    client: TestClient,
) -> None:
    headers = login(client)
    dataset = create_sales_dataset(client, headers)
    payload = definition_payload(dataset)
    first_response = client.post(
        "/api/analytics/definitions",
        headers=headers,
        json=payload,
    )
    assert first_response.status_code == 201

    duplicate_response = client.post(
        "/api/analytics/definitions",
        headers=headers,
        json=payload,
    )
    assert duplicate_response.status_code == 409
    assert duplicate_response.json()["error"]["code"] == "analysis_name_conflict"

    invalid_payload = definition_payload(dataset)
    invalid_payload["name"] = "Invalid field analysis"
    invalid_payload["configuration"]["aggregate"]["dimensions"] = ["missing"]
    invalid_response = client.post(
        "/api/analytics/definitions",
        headers=headers,
        json=invalid_payload,
    )
    assert invalid_response.status_code == 400
    assert invalid_response.json()["error"]["code"] == "analysis_field_not_found"

    outside_payload = definition_payload(dataset)
    outside_payload["name"] = "Outside project analysis"
    outside_payload["project_id"] = "prj_other"
    outside_response = client.post(
        "/api/analytics/definitions",
        headers=headers,
        json=outside_payload,
    )
    assert outside_response.status_code == 400
    assert outside_response.json()["error"]["code"] == "analysis_dataset_project_mismatch"
