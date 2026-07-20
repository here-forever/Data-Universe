from io import BytesIO

from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.database import get_db_session


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
        json={"name": "Import Project", "description": None},
    )

    assert response.status_code == 201
    return response.json()["id"]


def test_csv_upload_creates_preview_and_dataset(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)

    upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "sales.csv",
                b"order_id,amount,order_date\n1,19.5,2026-01-01\n2,42.0,2026-01-02\n",
                "text/csv",
            )
        },
    )

    assert upload_response.status_code == 201
    preview = upload_response.json()
    assert preview["file_name"] == "sales.csv"
    assert preview["uploaded_file_id"].startswith("file_")
    assert preview["upload_status"] == "parsed"
    assert preview["row_count"] == 2
    assert preview["fields"] == [
        {"name": "order_id", "inferred_type": "integer", "nullable": False, "order": 0},
        {"name": "amount", "inferred_type": "decimal", "nullable": False, "order": 1},
        {"name": "order_date", "inferred_type": "date", "nullable": False, "order": 2},
    ]
    assert preview["sample_rows"][0]["amount"] == 19.5

    dataset_response = client.post(
        "/api/datasets",
        headers=headers,
        json={
            "project_id": project_id,
            "preview_id": preview["id"],
            "name": "Sales Orders",
            "fields": preview["fields"],
        },
    )

    assert dataset_response.status_code == 201
    dataset = dataset_response.json()
    assert dataset["name"] == "Sales Orders"
    assert dataset["source_preview_id"] == preview["id"]
    assert dataset["physical_table_name"].startswith("ds_")

    session = next(client.app.dependency_overrides[get_db_session]())
    try:
        rows = session.execute(
            text(f'SELECT order_id, amount, order_date FROM "{dataset["physical_table_name"]}"')
        ).all()
    finally:
        session.close()

    assert len(rows) == 2
    assert rows[0].order_id == 1
    assert rows[0].amount == 19.5

    list_response = client.get(
        "/api/datasets",
        headers=headers,
        params={"project_id": project_id},
    )
    assert list_response.status_code == 200
    assert list_response.json()["items"][0]["id"] == dataset["id"]

    detail_response = client.get(f"/api/datasets/{dataset['id']}", headers=headers)
    assert detail_response.status_code == 200
    assert detail_response.json()["fields"] == preview["fields"]

    preview_response = client.get(
        f"/api/datasets/{dataset['id']}/preview",
        headers=headers,
        params={"page": 1, "page_size": 1},
    )
    assert preview_response.status_code == 200
    preview_page = preview_response.json()
    assert preview_page["total_rows"] == 2
    assert preview_page["page"] == 1
    assert preview_page["page_size"] == 1
    assert len(preview_page["rows"]) == 1
    assert preview_page["rows"][0]["_das_row_id"] == 1
    assert preview_page["rows"][0]["order_date"] == "2026-01-01"

    second_page_response = client.get(
        f"/api/datasets/{dataset['id']}/preview",
        headers=headers,
        params={"page": 2, "page_size": 1},
    )
    assert second_page_response.status_code == 200
    assert second_page_response.json()["rows"][0]["order_id"] == 2

    invalid_page_size_response = client.get(
        f"/api/datasets/{dataset['id']}/preview",
        headers=headers,
        params={"page": 1, "page_size": 500},
    )
    assert invalid_page_size_response.status_code == 400
    assert invalid_page_size_response.json()["error"]["code"] == "invalid_page_size"

    quality_response = client.get(
        f"/api/datasets/{dataset['id']}/quality",
        headers=headers,
    )
    assert quality_response.status_code == 200
    quality = quality_response.json()
    assert quality["row_count"] == 2
    assert quality["field_count"] == 3
    assert quality["null_cell_count"] == 0
    assert quality["duplicate_row_count"] == 0
    assert quality["field_profiles"][1]["name"] == "amount"
    assert quality["field_profiles"][1]["distinct_count"] == 2
    assert quality["field_profiles"][1]["sample_values"] == [19.5, 42.0]

    duplicate_dataset_response = client.post(
        "/api/datasets",
        headers=headers,
        json={
            "project_id": project_id,
            "preview_id": preview["id"],
            "name": "Sales Orders",
            "fields": preview["fields"],
        },
    )
    assert duplicate_dataset_response.status_code == 409
    assert duplicate_dataset_response.json()["error"]["code"] == "dataset_name_conflict"


def test_excel_upload_creates_preview(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    workbook = BytesIO()

    from openpyxl import Workbook

    sheet = Workbook()
    active = sheet.active
    active.append(["customer", "score"])
    active.append(["Ada", 98])
    active.append(["Lin", 87])
    sheet.save(workbook)
    workbook.seek(0)

    response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "scores.xlsx",
                workbook.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert response.status_code == 201
    assert response.json()["fields"][1] == {
        "name": "score",
        "inferred_type": "integer",
        "nullable": False,
        "order": 1,
    }


def test_unsupported_file_type_is_rejected(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)

    response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "unsupported_file_type"

    task_response = client.get(
        "/api/tasks",
        headers=headers,
        params={"project_id": project_id},
    )
    assert task_response.status_code == 200
    failed_task = task_response.json()["items"][0]
    assert failed_task["related_resource_id"].startswith("file_")
    assert failed_task["can_retry"] is False


def test_import_upload_history_lists_success_and_failed_records(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)
    other_project_id = create_project(client, headers)

    upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "sales.csv",
                b"order_id,amount\n1,19.5\n2,42.0\n",
                "text/csv",
            )
        },
    )
    assert upload_response.status_code == 201
    preview = upload_response.json()

    failed_upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={"file": ("notes.txt", b"hello", "text/plain")},
    )
    assert failed_upload_response.status_code == 400

    other_upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": other_project_id},
        files={
            "file": (
                "other.csv",
                b"region,total\nNorth,10\n",
                "text/csv",
            )
        },
    )
    assert other_upload_response.status_code == 201

    history_response = client.get(
        "/api/imports/uploads",
        headers=headers,
        params={"project_id": project_id},
    )

    assert history_response.status_code == 200
    uploads = history_response.json()["items"]
    upload_by_name = {upload["file_name"]: upload for upload in uploads}
    assert set(upload_by_name) == {"sales.csv", "notes.txt"}

    success_upload = upload_by_name["sales.csv"]
    assert success_upload["id"] == preview["uploaded_file_id"]
    assert success_upload["project_id"] == project_id
    assert success_upload["file_type"] == "csv"
    assert success_upload["status"] == "parsed"
    assert success_upload["error_message"] is None
    assert success_upload["preview_id"] == preview["id"]
    assert success_upload["preview_row_count"] == 2
    assert success_upload["created_at"]
    assert success_upload["updated_at"]

    failed_upload = upload_by_name["notes.txt"]
    assert failed_upload["project_id"] == project_id
    assert failed_upload["file_type"] == "txt"
    assert failed_upload["status"] == "failed"
    assert failed_upload["error_message"] == "Only CSV and Excel files are supported"
    assert failed_upload["preview_id"] is None
    assert failed_upload["preview_row_count"] is None


def test_saved_file_preview_can_be_reopened_from_history(client: TestClient) -> None:
    headers = login(client)
    project_id = create_project(client, headers)

    upload_response = client.post(
        "/api/imports/file-previews",
        headers=headers,
        data={"project_id": project_id},
        files={
            "file": (
                "customers.csv",
                b"customer,score\nAda,98\nLin,87\n",
                "text/csv",
            )
        },
    )
    assert upload_response.status_code == 201
    created_preview = upload_response.json()

    history_response = client.get(
        "/api/imports/uploads",
        headers=headers,
        params={"project_id": project_id},
    )
    assert history_response.status_code == 200
    upload = history_response.json()["items"][0]
    assert upload["preview_id"] == created_preview["id"]

    preview_response = client.get(
        f"/api/imports/file-previews/{upload['preview_id']}",
        headers=headers,
    )

    assert preview_response.status_code == 200
    preview = preview_response.json()
    assert preview["id"] == created_preview["id"]
    assert preview["uploaded_file_id"] == upload["id"]
    assert preview["file_name"] == "customers.csv"
    assert preview["row_count"] == 2
    assert preview["fields"][0]["name"] == "customer"
    assert preview["sample_rows"][0]["score"] == 98

    missing_preview_response = client.get(
        "/api/imports/file-previews/preview_missing",
        headers=headers,
    )
    assert missing_preview_response.status_code == 404
    assert missing_preview_response.json()["error"]["code"] == "preview_not_found"
