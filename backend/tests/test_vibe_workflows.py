from io import BytesIO

from fastapi.testclient import TestClient
from openpyxl import Workbook

CSV_SAMPLE = b"""department,study_hours,sleep_hours,score
Design,4,7,75
Science,5,8,82
Design,,6,70
Science,7,7,91
Design,4,7,75
Business,6,8,86
Engineering,8,6,94
Science,3,7,68
"""


def upload_csv(client: TestClient) -> dict:
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("student-rhythm.csv", CSV_SAMPLE, "text/csv")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_health_and_supported_file_uploads(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["status"] == "ok"

    csv_dataset = upload_csv(client)
    assert csv_dataset["profile"]["missing_cells"] == 1
    assert csv_dataset["profile"]["duplicate_rows"] == 1
    assert csv_dataset["preview"][0]["department"] == "Design"

    json_response = client.post(
        "/api/datasets/upload",
        files={
            "file": (
                "observations.json",
                b'{"records":[{"label":"A","value":2},{"label":"B","value":5}]}',
                "application/json",
            )
        },
    )
    assert json_response.status_code == 201
    assert json_response.json()["row_count"] == 2

    txt_response = client.post(
        "/api/datasets/upload",
        files={"file": ("notes.txt", b"alpha\nbeta\ngamma", "text/plain")},
    )
    assert txt_response.status_code == 201
    assert txt_response.json()["column_count"] == 1

    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["week", "energy"])
    sheet.append([1, 63])
    sheet.append([2, 78])
    stream = BytesIO()
    workbook.save(stream)
    excel_response = client.post(
        "/api/datasets/upload",
        files={
            "file": (
                "energy.xlsx",
                stream.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert excel_response.status_code == 201
    assert excel_response.json()["file_type"] == "xlsx"

    unsupported = client.post(
        "/api/datasets/upload",
        files={"file": ("query.sql", b"select 1", "text/plain")},
    )
    assert unsupported.status_code == 400
    assert unsupported.json()["error"]["code"] == "unsupported_file_type"


def test_profile_rows_and_versioned_cleaning(client: TestClient) -> None:
    dataset = upload_csv(client)
    dataset_id = dataset["id"]

    rows = client.get(f"/api/datasets/{dataset_id}/rows", params={"offset": 2, "limit": 3})
    assert rows.status_code == 200
    assert rows.json()["total"] == 8
    assert len(rows.json()["rows"]) == 3

    cleaned = client.post(
        f"/api/datasets/{dataset_id}/clean",
        json={
            "label": "Ready for exploration",
            "steps": [
                {"action": "drop_duplicates"},
                {
                    "action": "fill_missing",
                    "column": "study_hours",
                    "strategy": "mean",
                },
                {"action": "flag_outliers", "column": "score"},
            ],
        },
    )
    assert cleaned.status_code == 200, cleaned.text
    payload = cleaned.json()
    assert payload["active_revision"] == 2
    assert payload["row_count"] == 7
    assert payload["profile"]["missing_cells"] == 0
    assert "score__outlier" in {column["name"] for column in payload["profile"]["columns"]}
    assert [step["action"] for step in payload["transformations"]] == [
        "drop_duplicates",
        "fill_missing",
        "flag_outliers",
    ]


def test_exploration_questions_and_advanced_statistics(client: TestClient) -> None:
    demo = client.post("/api/datasets/demo")
    assert demo.status_code == 201
    dataset_id = demo.json()["id"]

    exploration = client.post(f"/api/insights/{dataset_id}/explore")
    assert exploration.status_code == 200, exploration.text
    assert exploration.json()["correlations"]["matrix"]
    assert exploration.json()["charts"]

    linked = client.post(
        f"/api/insights/{dataset_id}/explore",
        json={"filters": [{"field": "department", "value": "Science"}]},
    )
    assert linked.status_code == 200, linked.text
    assert linked.json()["overview"]["row_count"] < linked.json()["overview"]["source_row_count"]
    assert linked.json()["overview"]["filters"][0]["value"] == "Science"

    answer = client.post(
        f"/api/insights/{dataset_id}/ask",
        json={"question": "哪些字段关系最强，为什么值得关注？"},
    )
    assert answer.status_code == 200
    assert answer.json()["mode"] == "statistical_engine"
    assert answer.json()["evidence"]

    english_answer = client.post(
        f"/api/insights/{dataset_id}/ask",
        json={
            "question": "Which fields have the strongest relationship?",
            "locale": "en-US",
        },
    )
    assert english_answer.status_code == 200
    assert "correlation" in english_answer.json()["answer"].lower()
    assert "rows" in english_answer.json()["evidence"][0]
    assert english_answer.json()["suggested_chart"]["reason"] in {
        "A time field and a numeric measure support trend exploration",
        "Compare a numeric measure across groups",
        "Inspect relationship, clusters, and unusual observations",
        "Reveal skew, concentration, and outliers",
    }

    regression = client.post(
        f"/api/insights/{dataset_id}/advanced",
        json={"method": "regression", "feature": "study_hours", "target": "course_score"},
    )
    assert regression.status_code == 200, regression.text
    assert regression.json()["result"]["r_squared"] > 0

    hypothesis = client.post(
        f"/api/insights/{dataset_id}/advanced",
        json={
            "method": "hypothesis",
            "target": "course_score",
            "group_field": "department",
            "group_a": "Design",
            "group_b": "Science",
        },
    )
    assert hypothesis.status_code == 200, hypothesis.text
    assert len(hypothesis.json()["result"]["groups"]) == 2

    clustering = client.post(
        f"/api/insights/{dataset_id}/advanced",
        json={
            "method": "clustering",
            "fields": ["study_hours", "sleep_hours", "course_score"],
            "clusters": 3,
        },
    )
    assert clustering.status_code == 200, clustering.text
    assert len(clustering.json()["result"]["centers"]) == 3

    history = client.get(f"/api/insights/{dataset_id}/history")
    assert history.status_code == 200
    assert len(history.json()) == 7


def test_particles_and_websocket_collaboration(client: TestClient) -> None:
    dataset_id = client.post("/api/datasets/demo").json()["id"]
    particles = client.post(
        f"/api/datasets/{dataset_id}/particles",
        json={
            "x": "study_hours",
            "y": "sleep_hours",
            "z": "course_score",
            "color": "department",
            "limit": 120,
        },
    )
    assert particles.status_code == 200, particles.text
    assert len(particles.json()["points"]) == 120
    assert len({point["color"] for point in particles.json()["points"]}) == 4

    with client.websocket_connect(f"/api/collaboration/{dataset_id}/ws") as socket:
        presence = socket.receive_json()
        assert presence == {"type": "presence", "online": 1}
        socket.send_json(
            {
                "type": "selection",
                "actor": "测试成员",
                "payload": {"field": "department", "value": "Science"},
            }
        )
        event = socket.receive_json()
        assert event["type"] == "selection"
        assert event["payload"]["value"] == "Science"


def test_story_edit_export_and_delete(client: TestClient) -> None:
    dataset_id = client.post("/api/datasets/demo").json()["id"]
    created = client.post(
        "/api/stories",
        json={
            "dataset_id": dataset_id,
            "title": "校园节律观察",
            "locale": "en-US",
        },
    )
    assert created.status_code == 201, created.text
    story = created.json()
    assert story["blocks"]
    assert "observations" in story["summary"]

    updated = client.patch(
        f"/api/stories/{story['id']}",
        json={"summary": "从学习、睡眠与成绩之间寻找可验证的关系。"},
    )
    assert updated.status_code == 200
    assert updated.json()["summary"].startswith("从学习")

    html = client.get(
        f"/api/stories/{story['id']}/export",
        params={"format": "html", "locale": "en-US"},
    )
    assert html.status_code == 200
    assert "校园节律观察" in html.content.decode("utf-8")
    assert '<html lang="en-US">' in html.content.decode("utf-8")

    pdf = client.get(f"/api/stories/{story['id']}/export", params={"format": "pdf"})
    assert pdf.status_code == 200
    assert pdf.content.startswith(b"%PDF")

    deleted = client.delete(f"/api/stories/{story['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/stories/{story['id']}").status_code == 404

    removed_dataset = client.delete(f"/api/datasets/{dataset_id}")
    assert removed_dataset.status_code == 204
    assert client.get(f"/api/datasets/{dataset_id}").status_code == 404
