from fastapi.testclient import TestClient

from app.core.database import get_db_session
from app.core.ids import new_id
from app.models.audit import LineageEdge
from app.models.data_view import DashboardDefinition
from app.models.dataset import Dataset


def login_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def create_governed_project(client: TestClient, headers: dict[str, str]) -> str:
    response = client.post(
        "/api/projects",
        headers=headers,
        json={"name": "Governance workspace", "description": None},
    )
    assert response.status_code == 201
    return response.json()["id"]


def seed_governed_resources(client: TestClient, project_id: str) -> tuple[str, str]:
    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        dataset = Dataset(
            id="ds_governed",
            project_id=project_id,
            name="Governed sales dataset",
            description=None,
            source_preview_id=None,
            row_count=4,
        )
        dashboard = DashboardDefinition(
            id="dash_governed",
            project_id=project_id,
            name="Governed sales dashboard",
            configuration_version=1,
            layout={"mode": "dashboard", "items": []},
        )
        session.add_all([dataset, dashboard])
        session.flush()
        session.add(
            LineageEdge(
                id=new_id("lineage"),
                project_id=project_id,
                source_type="dataset",
                source_id=dataset.id,
                target_type="dashboard",
                target_id=dashboard.id,
                transform_type="governance_test",
                transform_id=dashboard.id,
            )
        )
        session.commit()
        return dataset.id, dashboard.id
    finally:
        session.close()


def test_governance_resources_archive_restore_audit_and_lineage(
    client: TestClient,
) -> None:
    headers = login_headers(client)
    project_id = create_governed_project(client, headers)
    dataset_id, dashboard_id = seed_governed_resources(client, project_id)

    resources_response = client.get(
        "/api/governance/resources",
        headers=headers,
        params={"project_id": project_id},
    )
    assert resources_response.status_code == 200
    resources = resources_response.json()
    assert resources["summary"] == {
        "total": 2,
        "active": 2,
        "archived": 0,
        "with_dependents": 1,
    }
    dataset_resource = next(
        item for item in resources["items"] if item["resource_id"] == dataset_id
    )
    assert dataset_resource["direct_dependency_count"] == 1

    lineage_response = client.get(
        "/api/governance/lineage",
        headers=headers,
        params={
            "project_id": project_id,
            "resource_type": "dataset",
            "resource_id": dataset_id,
            "direction": "downstream",
            "max_depth": 3,
        },
    )
    assert lineage_response.status_code == 200
    lineage = lineage_response.json()
    assert lineage["root"]["resource_id"] == dataset_id
    assert {node["resource_id"] for node in lineage["nodes"]} == {
        dataset_id,
        dashboard_id,
    }
    assert lineage["edges"][0]["transform_type"] == "governance_test"

    archive_response = client.post(
        f"/api/governance/resources/dataset/{dataset_id}/archive",
        headers=headers,
        params={"project_id": project_id},
    )
    assert archive_response.status_code == 200
    assert archive_response.json()["status"] == "archived"

    dataset_list = client.get(
        "/api/datasets",
        headers=headers,
        params={"project_id": project_id},
    )
    assert dataset_list.status_code == 200
    assert dataset_list.json()["items"] == []

    archived_resources = client.get(
        "/api/governance/resources",
        headers=headers,
        params={"project_id": project_id, "status": "archived"},
    )
    assert archived_resources.status_code == 200
    assert [item["resource_id"] for item in archived_resources.json()["items"]] == [dataset_id]

    restore_response = client.post(
        f"/api/governance/resources/dataset/{dataset_id}/restore",
        headers=headers,
        params={"project_id": project_id},
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["status"] == "active"

    operations_response = client.get(
        "/api/governance/operations",
        headers=headers,
        params={"project_id": project_id, "resource_type": "dataset"},
    )
    assert operations_response.status_code == 200
    actions = {item["action"] for item in operations_response.json()["items"]}
    assert {"resource.archived", "resource.restored"} <= actions
