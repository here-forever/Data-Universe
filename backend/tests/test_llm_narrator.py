import json

import httpx
import pytest
from fastapi.testclient import TestClient


def test_chat_completion_configuration_and_secret_redaction(
    client: TestClient, monkeypatch
) -> None:
    requests: list[dict] = []

    def fake_post(url, *, headers, json, timeout):
        requests.append({"url": url, "headers": headers, "json": json, "timeout": timeout})
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": "这是外部模型的证据解读。"}}]},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", fake_post)
    config = {
        "base_url": "https://llm.example.com/v1/",
        "model": "example-chat",
        "api_key": "top-secret-key",
        "api_style": "chat_completions",
    }

    checked = client.post("/api/insights/llm/check", json=config)
    assert checked.status_code == 200, checked.text
    assert checked.json() == {
        "ok": True,
        "model": "example-chat",
        "api_style": "chat_completions",
        "message": "Connection verified",
    }

    dataset_id = client.post("/api/datasets/demo").json()["id"]
    answer = client.post(
        f"/api/insights/{dataset_id}/ask",
        json={"question": "请解读最重要的关系", "llm": config},
    )
    assert answer.status_code == 200, answer.text
    assert answer.json()["mode"] == "external_llm"
    assert answer.json()["model"] == "example-chat"
    assert answer.json()["answer"] == "这是外部模型的证据解读。"

    assert all(item["url"].endswith("/chat/completions") for item in requests)
    assert requests[-1]["headers"]["Authorization"] == "Bearer top-secret-key"
    assert requests[-1]["json"]["messages"][0]["role"] == "system"

    history = client.get(f"/api/insights/{dataset_id}/history").json()
    recorded_request = history[0]["request"]
    assert recorded_request["llm"] == {
        "base_url": "https://llm.example.com/v1",
        "model": "example-chat",
        "api_style": "chat_completions",
    }
    assert "top-secret-key" not in json.dumps(history)
    assert "api_key" not in recorded_request["llm"]


def test_responses_protocol_and_provider_error(client: TestClient, monkeypatch) -> None:
    def successful_post(url, **_):
        return httpx.Response(
            200,
            json={"output_text": "OK"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", successful_post)
    config = {
        "base_url": "https://api.example.com/v1",
        "model": "example-reasoning",
        "api_key": "secret",
        "api_style": "responses",
    }
    checked = client.post("/api/insights/llm/check", json=config)
    assert checked.status_code == 200, checked.text

    def failed_post(url, **_):
        return httpx.Response(
            401,
            json={"error": {"message": "Invalid API key"}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", failed_post)
    failed = client.post("/api/insights/llm/check", json=config)
    assert failed.status_code == 502
    assert failed.json()["error"]["code"] == "llm_connection_failed"
    assert "Invalid API key" in failed.json()["error"]["message"]


@pytest.mark.parametrize(
    ("base_url", "model"),
    [
        ("https://api.example.com/v1", "   "),
        ("https://user:password@api.example.com/v1", "example-chat"),
        ("https://api.example.com/v1?token=secret", "example-chat"),
        ("https://api.example.com/v1#config", "example-chat"),
    ],
)
def test_invalid_user_llm_configuration_is_rejected(
    client: TestClient,
    base_url: str,
    model: str,
) -> None:
    response = client.post(
        "/api/insights/llm/check",
        json={
            "base_url": base_url,
            "model": model,
            "api_style": "chat_completions",
        },
    )

    assert response.status_code == 422
