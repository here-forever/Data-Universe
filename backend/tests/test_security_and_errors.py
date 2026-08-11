from fastapi import APIRouter
from fastapi.testclient import TestClient

from app.core.config import get_settings


def test_ssrf_targets_and_plain_http_are_rejected(client: TestClient) -> None:
    blocked_urls = [
        "http://api.example.com/v1",
        "https://127.0.0.1/v1",
        "https://169.254.169.254/latest",
        "https://10.0.0.8/v1",
        "https://192.168.1.20/v1",
        "https://[::1]/v1",
        "https://[fc00::1]/v1",
        "https://localhost/v1",
    ]
    for base_url in blocked_urls:
        response = client.post(
            "/api/v1/insights/llm/check",
            json={
                "base_url": base_url,
                "model": "example-model",
                "api_style": "responses",
            },
        )
        assert response.status_code == 422, base_url
        assert response.json()["error"]["code"] == "request_validation_failed"


def test_dns_resolution_to_private_address_is_rejected(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(
        "app.core.ssrf_guard.resolve_host_addresses", lambda _host, _port: ("127.0.0.1",)
    )
    response = client.post(
        "/api/v1/insights/llm/check",
        json={
            "base_url": "https://provider.example/v1",
            "model": "example-model",
            "api_style": "responses",
        },
    )
    assert response.status_code == 502
    assert response.json()["error"]["message"] == (
        "Unable to connect to the language model: The provider URL is not allowed"
    )


def test_upload_limit_is_enforced_while_streaming(client: TestClient) -> None:
    constrained = get_settings().model_copy(
        update={"upload_max_bytes": 16, "upload_chunk_bytes": 8, "upload_spool_max_bytes": 8}
    )
    client.app.dependency_overrides[get_settings] = lambda: constrained
    try:
        oversized = client.post(
            "/api/v1/datasets/upload",
            files={"file": ("too-large.csv", b"name,value\nalpha,123456", "text/csv")},
        )
        boundary = client.post(
            "/api/v1/datasets/upload",
            files={"file": ("boundary.csv", b"a,b\n1,2\n3,4\n", "text/csv")},
        )
    finally:
        client.app.dependency_overrides.pop(get_settings, None)
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "file_too_large"
    assert boundary.status_code == 201, boundary.text


def test_validation_and_unhandled_errors_use_json_contract(client: TestClient) -> None:
    invalid = client.get("/api/v1/datasets/not-present/rows", params={"limit": 0})
    assert invalid.status_code == 422
    assert invalid.headers["X-Request-ID"]
    assert invalid.json()["error"] == {
        "code": "request_validation_failed",
        "message": "The request is invalid",
        "request_id": invalid.headers["X-Request-ID"],
    }

    router = APIRouter()

    @router.get("/__test/unhandled")
    def fail() -> None:
        raise RuntimeError("sensitive traceback content")

    client.app.include_router(router)
    with TestClient(client.app, raise_server_exceptions=False) as safe_client:
        failed = safe_client.get("/__test/unhandled")
    assert failed.status_code == 500
    assert failed.headers["content-type"].startswith("application/json")
    assert failed.json()["error"]["code"] == "internal_server_error"
    assert "sensitive traceback content" not in failed.text


def test_invalid_request_id_is_replaced(client: TestClient) -> None:
    response = client.get(
        "/api/v1/health",
        headers={"X-Request-ID": "unsafe request id"},
    )
    assert response.status_code == 200
    assert response.headers["X-Request-ID"] != "unsafe request id"
    assert len(response.headers["X-Request-ID"]) == 32
