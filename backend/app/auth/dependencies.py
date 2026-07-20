from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.orm import Session

from app.auth.repository import AuthRepository
from app.auth.service import AuthService, User
from app.core.database import get_db_session
from app.core.errors import AppError


def get_auth_service(session: Annotated[Session, Depends(get_db_session)]) -> AuthService:
    return AuthService(AuthRepository(session))


def get_current_user(
    auth: Annotated[AuthService, Depends(get_auth_service)],
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    if authorization is None or not authorization.lower().startswith("bearer "):
        raise AppError(
            message="Authentication is required",
            code="not_authenticated",
            status_code=401,
        )

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise AppError(
            message="Authentication is required",
            code="not_authenticated",
            status_code=401,
        )

    return auth.get_user_by_token(token)
