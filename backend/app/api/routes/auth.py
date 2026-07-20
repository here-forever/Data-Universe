from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth.dependencies import get_auth_service, get_current_user
from app.auth.schemas import CurrentUserResponse, LoginRequest, TokenResponse
from app.auth.service import AuthService, User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    auth: Annotated[AuthService, Depends(get_auth_service)],
) -> TokenResponse:
    token = auth.authenticate(payload.email, payload.password)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=CurrentUserResponse)
def me(current_user: Annotated[User, Depends(get_current_user)]) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=current_user.id,
        email=current_user.email,
        display_name=current_user.display_name,
        is_active=current_user.is_active,
        is_platform_admin=current_user.is_platform_admin,
    )
