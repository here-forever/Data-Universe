import logging
from typing import Any
from uuid import uuid4

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def request_id_for(request: Request) -> str:
    request_id = getattr(request.state, "request_id", None)
    if isinstance(request_id, str) and request_id:
        return request_id
    request_id = uuid4().hex
    request.state.request_id = request_id
    return request_id


def error_response(request: Request, status_code: int, code: str, message: str) -> JSONResponse:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "request_id": request_id_for(request),
        }
    }
    return JSONResponse(status_code=status_code, content=payload)


async def app_error_handler(request: Request, error: AppError) -> JSONResponse:
    return error_response(request, error.status_code, error.code, error.message)


async def validation_error_handler(request: Request, _: RequestValidationError) -> JSONResponse:
    return error_response(request, 422, "request_validation_failed", "The request is invalid")


async def unhandled_error_handler(request: Request, error: Exception) -> JSONResponse:
    logging.getLogger("app.errors").exception(
        "unhandled_exception",
        extra={"request_id": request_id_for(request), "path": request.url.path},
        exc_info=(type(error), error, error.__traceback__),
    )
    return error_response(request, 500, "internal_server_error", "An unexpected error occurred")
