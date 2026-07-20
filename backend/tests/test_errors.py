from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import AppError
from app.main import create_app


def test_app_error_handler_returns_standard_payload() -> None:
    app = create_app()

    @app.get("/raise-app-error")
    def raise_app_error() -> None:
        raise AppError(message="Example failure", code="example_failure", status_code=418)

    response = TestClient(app).get("/raise-app-error")

    assert response.status_code == 418
    assert response.json() == {
        "error": {
            "code": "example_failure",
            "message": "Example failure",
        }
    }


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)
