from fastapi.testclient import TestClient


def login(client: TestClient) -> str:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@example.com", "password": "admin123"},
    )

    assert response.status_code == 200
    return response.json()["access_token"]


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_login_returns_bearer_token_and_current_user(client: TestClient) -> None:
    token = login(client)

    response = client.get("/api/auth/me", headers=auth_headers(token))

    assert response.status_code == 200
    assert response.json() == {
        "id": "usr_admin",
        "email": "admin@example.com",
        "display_name": "System Administrator",
        "is_active": True,
        "is_platform_admin": True,
    }


def test_me_requires_valid_token(client: TestClient) -> None:
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


def test_create_and_list_projects(client: TestClient) -> None:
    token = login(client)

    create_response = client.post(
        "/api/projects",
        headers=auth_headers(token),
        json={"name": "Sales Analysis", "description": "Quarterly sales workspace"},
    )

    assert create_response.status_code == 201
    project = create_response.json()
    assert project["name"] == "Sales Analysis"
    assert project["role"] == "owner"

    list_response = client.get("/api/projects", headers=auth_headers(token))

    assert list_response.status_code == 200
    assert list_response.json()[0]["id"] == project["id"]


def test_project_members_can_be_added(client: TestClient) -> None:
    token = login(client)
    project = client.post(
        "/api/projects",
        headers=auth_headers(token),
        json={"name": "Customer Analytics", "description": None},
    ).json()

    response = client.post(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(token),
        json={"email": "analyst@example.com", "role": "editor"},
    )

    assert response.status_code == 201
    assert response.json()["role"] == "editor"

    members_response = client.get(
        f"/api/projects/{project['id']}/members",
        headers=auth_headers(token),
    )

    assert members_response.status_code == 200
    assert [member["email"] for member in members_response.json()] == [
        "admin@example.com",
        "analyst@example.com",
    ]


def test_resource_permissions_can_be_recorded(client: TestClient) -> None:
    token = login(client)
    project = client.post(
        "/api/projects",
        headers=auth_headers(token),
        json={"name": "Dataset Governance", "description": None},
    ).json()

    response = client.post(
        "/api/permissions/resources",
        headers=auth_headers(token),
        json={
            "project_id": project["id"],
            "resource_type": "dataset",
            "resource_id": "ds_sales",
            "principal_type": "project_role",
            "principal_id": "viewer",
            "actions": ["view", "export"],
        },
    )

    assert response.status_code == 201
    assert response.json()["actions"] == ["view", "export"]

    list_response = client.get(
        "/api/permissions/resources",
        headers=auth_headers(token),
        params={"project_id": project["id"]},
    )

    assert list_response.status_code == 200
    assert list_response.json()[0]["resource_type"] == "dataset"
