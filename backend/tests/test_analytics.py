from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.database import get_db_session
from app.models.audit import OperationLog


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
        json={"name": "Analytics Project", "description": None},
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
    preview = upload_response.json()
    dataset_response = client.post(
        "/api/datasets",
        headers=headers,
        json={
            "project_id": project_id,
            "preview_id": preview["id"],
            "name": "Sales Analytics",
            "fields": preview["fields"],
        },
    )
    assert dataset_response.status_code == 201
    return dataset_response.json()


def test_dataset_analytics_supports_aggregation_statistics_and_export(
    client: TestClient,
) -> None:
    headers = login(client)
    dataset = create_sales_dataset(client, headers)
    request = {
        "dimensions": ["region"],
        "metrics": [
            {"field": "revenue", "aggregation": "sum", "alias": "revenue_total"},
            {"field": None, "aggregation": "count", "alias": "row_count"},
        ],
        "filters": [{"field": "channel", "operator": "eq", "value": "Online"}],
        "sort_by": "revenue_total",
        "sort_direction": "desc",
        "limit": 20,
    }
    response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/aggregate",
        headers=headers,
        json=request,
    )
    assert response.status_code == 200
    result = response.json()
    assert result["filtered_row_count"] == 2
    assert result["columns"] == ["region", "revenue_total", "row_count"]
    assert result["rows"] == [
        {"region": "East", "revenue_total": 120.0, "row_count": 1},
        {"region": "West", "revenue_total": 110.0, "row_count": 1},
    ]

    statistics_response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/statistics",
        headers=headers,
        json={"fields": ["revenue", "channel"], "filters": []},
    )
    assert statistics_response.status_code == 200
    statistics = statistics_response.json()
    assert statistics["numeric_fields"][0]["mean"] == 95.0
    assert statistics["numeric_fields"][0]["median"] == 100.0
    assert statistics["categorical_fields"][0]["distinct_count"] == 2

    csv_response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/export?format=csv",
        headers=headers,
        json=request,
    )
    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert "East" in csv_response.content.decode("utf-8-sig")

    xlsx_response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/export?format=xlsx",
        headers=headers,
        json=request,
    )
    assert xlsx_response.status_code == 200
    assert xlsx_response.content.startswith(b"PK")

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        actions = set(session.scalars(select(OperationLog.action)).all())
    finally:
        session.close()
    assert "analysis.aggregated" in actions
    assert "analysis.statistics_calculated" in actions
    assert "analysis.exported" in actions


def test_dataset_analytics_supports_correlation_and_linear_regression(
    client: TestClient,
) -> None:
    headers = login(client)
    dataset = create_sales_dataset(client, headers)
    correlation_response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/correlation",
        headers=headers,
        json={"fields": ["revenue", "cost", "orders"], "filters": []},
    )
    assert correlation_response.status_code == 200
    correlation = correlation_response.json()
    assert correlation["observations"] == 4
    assert correlation["matrix"][0][0] == 1.0
    assert correlation["matrix"][0][1] > 0.9

    regression_response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/linear-regression",
        headers=headers,
        json={"feature": "orders", "target": "revenue", "filters": []},
    )
    assert regression_response.status_code == 200
    regression = regression_response.json()
    assert regression["observations"] == 4
    assert regression["slope"] > 0
    assert regression["r_squared"] > 0.8
    assert len(regression["points"]) == 4


def test_dataset_analytics_rejects_invalid_fields(client: TestClient) -> None:
    headers = login(client)
    dataset = create_sales_dataset(client, headers)
    response = client.post(
        f"/api/analytics/datasets/{dataset['id']}/aggregate",
        headers=headers,
        json={
            "dimensions": ["missing"],
            "metrics": [{"field": "revenue", "aggregation": "sum"}],
            "filters": [],
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "analysis_field_not_found"
