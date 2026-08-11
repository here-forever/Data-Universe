import asyncio
import codecs
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.collaboration.hub import CollaborationHub
from app.core.config import Settings
from app.core.errors import AppError
from app.data.repository import DatasetRepository
from app.data.service import particle_color
from app.data.storage import read_frame, read_page, read_sample, write_frame
from app.models import Dataset
from app.stories.exporter import pdf_font_markup, register_pdf_fonts


class FakeSocket:
    def __init__(self, *, fail_sends: bool = False) -> None:
        self.accepted = False
        self.closed: tuple[int, str] | None = None
        self.fail_sends = fail_sends
        self.messages: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def close(self, code: int, reason: str) -> None:
        self.closed = (code, reason)

    async def send_json(self, message: dict) -> None:
        if self.fail_sends:
            raise RuntimeError("stale socket")
        self.messages.append(message)


def test_parquet_pagination_projection_and_legacy_jsonl(tmp_path: Path) -> None:
    frame = pd.DataFrame(
        {
            "row_id": range(40_000),
            "category": [f"group-{index % 9}" for index in range(40_000)],
            "value": [index / 10 for index in range(40_000)],
        }
    )
    parquet = write_frame(tmp_path, "dataset", 1, frame)

    assert parquet.suffix == ".parquet"
    assert pq.ParquetFile(parquet).num_row_groups >= 3
    total, columns, page = read_page(parquet, 16_380, 12)
    assert total == 40_000
    assert columns == ["row_id", "category", "value"]
    assert page["row_id"].tolist() == list(range(16_380, 16_392))
    assert list(read_frame(parquet, ["category"]).columns) == ["category"]
    sampled = read_sample(parquet, [1, 20_001, 39_999], ["row_id", "value"])
    assert sampled["row_id"].tolist() == [1, 20_001, 39_999]

    legacy = tmp_path / "legacy.jsonl"
    frame.head(5).to_json(legacy, orient="records", lines=True)
    legacy_total, legacy_columns, legacy_page = read_page(legacy, 2, 2)
    assert legacy_total == 5
    assert legacy_columns == ["row_id", "category", "value"]
    assert legacy_page["row_id"].tolist() == [2, 3]


def test_missing_active_revision_raises_domain_error() -> None:
    dataset = Dataset(
        id="missing-revision",
        name="Missing revision",
        source_filename="missing.csv",
        file_type="csv",
        row_count=0,
        column_count=0,
        active_revision=4,
        revisions=[],
    )
    with pytest.raises(AppError) as raised:
        DatasetRepository.active_revision(dataset)
    assert raised.value.code == "dataset_revision_not_found"
    assert raised.value.status_code == 404


def test_utf16_upload_health_readiness_and_metrics(client: TestClient) -> None:
    payload = codecs.BOM_UTF16_LE + "name,value\nalpha,1\nbeta,2\n".encode("utf-16-le")
    uploaded = client.post(
        "/api/v1/datasets/upload",
        files={"file": ("utf16.csv", payload, "text/csv")},
    )
    assert uploaded.status_code == 201, uploaded.text
    assert uploaded.json()["row_count"] == 2

    live = client.get("/api/v1/health/live")
    ready = client.get("/api/v1/health/ready")
    metrics = client.get("/api/v1/metrics")
    assert live.json()["status"] == "ok"
    assert ready.status_code == 200
    assert ready.json()["checks"] == {
        "database": "ok",
        "datasets": "ok",
        "exports": "ok",
    }
    assert metrics.status_code == 200
    assert "vibe_http_requests_total" in metrics.text


def test_production_settings_reject_debug_http_llm_and_insecure_cors() -> None:
    with pytest.raises(ValidationError, match="APP_DEBUG"):
        Settings(
            app_env="production",
            app_debug=True,
            backend_cors_origins="https://data.example.com",
        )
    with pytest.raises(ValidationError, match="must use https"):
        Settings(llm_base_url="http://api.example.com/v1")
    with pytest.raises(ValidationError, match="explicit HTTPS origins"):
        Settings(app_env="production", backend_cors_origins="http://localhost:5173")


def test_collaboration_capacity_and_stale_socket_cleanup() -> None:
    hub = CollaborationHub()
    settings = Settings(
        collaboration_max_rooms=1,
        collaboration_max_connections_per_room=1,
    )
    first = FakeSocket()
    rejected_connection = FakeSocket()
    rejected_room = FakeSocket()

    async def scenario() -> None:
        assert await hub.connect("dataset-a", first, settings)
        assert not await hub.connect("dataset-a", rejected_connection, settings)
        assert not await hub.connect("dataset-b", rejected_room, settings)
        assert rejected_connection.closed == (1013, "Collaboration capacity reached")
        assert rejected_room.closed == (1013, "Collaboration capacity reached")

        stale = FakeSocket(fail_sends=True)
        hub.rooms["dataset-a"].add(stale)
        await hub.broadcast("dataset-a", {"type": "activity"})
        assert stale not in hub.rooms["dataset-a"]
        assert first.messages[-1] == {"type": "activity"}
        await hub.disconnect("dataset-a", first)
        assert "dataset-a" not in hub.rooms

    asyncio.run(scenario())


def test_particle_palette_and_pdf_markup_expand_for_mixed_content() -> None:
    colors = [particle_color(index) for index in range(18)]
    assert len(set(colors)) == 18
    assert all(color.startswith("#") and len(color) == 7 for color in colors)

    latin_font = register_pdf_fonts()
    markup = pdf_font_markup("数据 quality 2026", latin_font)
    assert '<font name="STSong-Light">数据</font>' in markup
    assert f'<font name="{latin_font}"> quality 2026</font>' in markup
