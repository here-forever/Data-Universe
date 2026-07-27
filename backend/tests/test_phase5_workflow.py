from fastapi.testclient import TestClient


def login_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_local_file_to_report_governance_workflow_is_traceable_and_recoverable(
    client: TestClient,
) -> None:
    headers = login_headers(client)
    project_response = client.post(
        "/api/projects",
        headers=headers,
        json={
            "name": "Phase 5 release workflow",
            "description": "End-to-end governance acceptance",
        },
    )
    assert project_response.status_code == 201
    project_id = project_response.json()["id"]

    preview_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "phase5-sales.csv",
                (
                    b"customer,region,amount\n"
                    b"Ada,East,19.5\n"
                    b"Ada,East,19.5\n"
                    b"Lin,West,42.0\n"
                    b"Kai,,30.0\n"
                ),
                "text/csv",
            )
        },
    )
    assert preview_response.status_code == 201
    preview = preview_response.json()

    dataset_response = client.post(
        "/api/datasets",
        headers=headers,
        json={
            "project_id": project_id,
            "preview_id": preview["id"],
            "name": "Phase 5 Sales",
            "fields": preview["fields"],
        },
    )
    assert dataset_response.status_code == 201
    source_dataset = dataset_response.json()

    recipe_response = client.post(
        "/api/cleaning/recipes",
        headers=headers,
        json={
            "project_id": project_id,
            "source_dataset_id": source_dataset["id"],
            "name": "Phase 5 Sales Cleanup",
            "description": "Fill region and remove duplicate rows",
            "steps": [
                {
                    "operation": "fill_null",
                    "order": 0,
                    "config": {"field": "region", "value": "Unknown"},
                },
                {
                    "operation": "deduplicate",
                    "order": 1,
                    "config": {"fields": ["customer", "region", "amount"]},
                },
            ],
        },
    )
    assert recipe_response.status_code == 201
    recipe = recipe_response.json()

    execution_response = client.post(
        f"/api/cleaning/recipes/{recipe['id']}/execute",
        headers=headers,
        json={"output_name": "Phase 5 Sales Cleaned"},
    )
    assert execution_response.status_code == 200
    cleaned_dataset_id = execution_response.json()["derived_dataset_id"]

    data_view_response = client.post(
        "/api/sql/save-data-view",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Phase 5 Regional Sales",
            "description": "Governed SQL aggregate",
            "sql": (
                "SELECT region, SUM(amount) AS total_amount "
                f"FROM {cleaned_dataset_id} GROUP BY region ORDER BY total_amount DESC"
            ),
            "limit": 100,
        },
    )
    assert data_view_response.status_code == 200
    data_view = data_view_response.json()

    chart_response = client.post(
        "/api/charts",
        headers=headers,
        json={
            "project_id": project_id,
            "data_view_id": data_view["id"],
            "name": "Phase 5 Regional Sales Chart",
            "chart_type": "bar",
            "config": {
                "dimension": "region",
                "metric": "total_amount",
                "aggregation": "sum",
                "data_view_name": data_view["name"],
            },
        },
    )
    assert chart_response.status_code == 201
    chart = chart_response.json()

    dashboard_response = client.post(
        "/api/dashboards",
        headers=headers,
        json={
            "project_id": project_id,
            "name": "Phase 5 Governed Report",
            "layout": {
                "mode": "report",
                "theme": "warm",
                "items": [{"chart_id": chart["id"], "x": 0, "y": 0, "w": 12, "h": 5}],
                "global_filters": [],
                "active_selections": [],
            },
        },
    )
    assert dashboard_response.status_code == 201
    dashboard = dashboard_response.json()

    export_response = client.post(
        f"/api/dashboards/{dashboard['id']}/exports",
        headers=headers,
        params={"format": "csv"},
    )
    assert export_response.status_code == 200
    assert b"total_amount" in export_response.content

    lineage_response = client.get(
        "/api/governance/lineage",
        headers=headers,
        params={
            "project_id": project_id,
            "resource_type": "dashboard",
            "resource_id": dashboard["id"],
            "direction": "upstream",
            "max_depth": 5,
        },
    )
    assert lineage_response.status_code == 200
    lineage = lineage_response.json()
    node_ids = {node["resource_id"] for node in lineage["nodes"]}
    assert {
        source_dataset["id"],
        recipe["id"],
        cleaned_dataset_id,
        data_view["id"],
        chart["id"],
        dashboard["id"],
    } <= node_ids

    operations_response = client.get(
        "/api/governance/operations",
        headers=headers,
        params={"project_id": project_id, "limit": 200},
    )
    assert operations_response.status_code == 200
    actions = {item["action"] for item in operations_response.json()["items"]}
    assert {
        "import.file_preview_created",
        "dataset.created",
        "cleaning.recipe_executed",
        "sql.data_view_saved",
        "chart.created",
        "dashboard.created",
        "report.exported",
    } <= actions

    archive_response = client.post(
        f"/api/governance/resources/dataset/{source_dataset['id']}/archive",
        headers=headers,
        params={"project_id": project_id},
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["direct_dependency_count"] >= 1

    active_datasets = client.get(
        "/api/datasets",
        headers=headers,
        params={"project_id": project_id},
    ).json()["items"]
    assert source_dataset["id"] not in {item["id"] for item in active_datasets}
    assert cleaned_dataset_id in {item["id"] for item in active_datasets}

    restore_response = client.post(
        f"/api/governance/resources/dataset/{source_dataset['id']}/restore",
        headers=headers,
        params={"project_id": project_id},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "active"
