from dataclasses import dataclass

from app.auth.repository import AuthRepository
from app.auth.security import (
    AuthTokenManager,
    hash_password,
    password_needs_upgrade,
    verify_password,
)
from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.core.ids import new_id
from app.models.user import User as UserModel


@dataclass(frozen=True)
class User:
    id: str
    email: str
    display_name: str
    password: str
    is_active: bool = True
    is_platform_admin: bool = False


class AuthService:
    def __init__(
        self,
        repository: AuthRepository | None = None,
        settings: Settings | None = None,
    ) -> None:
        self.repository = repository
        self.settings = settings or get_settings()
        self.tokens = AuthTokenManager(
            secret_key=self.settings.app_secret_key,
            ttl_seconds=self.settings.access_token_expire_minutes * 60,
        )
        self._users_by_email: dict[str, User] = {}
        self.reset()

    def reset(self) -> None:
        if self.repository is not None:
            self._users_by_email = {}
            return
        self._users_by_email = {
            "admin@example.com": User(
                id="usr_admin",
                email="admin@example.com",
                display_name="System Administrator",
                password=self._hash_password(self.settings.default_admin_password),
                is_platform_admin=True,
            )
        }

    def authenticate(self, email: str, password: str) -> str:
        if self.repository is not None:
            user = self.repository.get_user_by_email(email)
            if user is None and email.lower() == "admin@example.com":
                user = user_to_model(self.get_or_create_default_admin())
            if (
                user is None
                or not user.is_active
                or not verify_password(password, user.password_hash)
            ):
                raise_invalid_credentials()

            if password_needs_upgrade(
                user.password_hash,
                iterations=self.settings.password_hash_iterations,
            ):
                user = self.repository.update_password_hash(
                    user,
                    self._hash_password(password),
                )

            return self.tokens.issue(user.id)

        user = self._users_by_email.get(email.lower())
        if user is None or not user.is_active or not verify_password(password, user.password):
            raise_invalid_credentials()

        return self.tokens.issue(user.id)

    def get_user_by_token(self, token: str) -> User:
        if self.settings.app_env == "development" and token.startswith("local-dev-token-"):
            return self.get_user_by_id(token.removeprefix("local-dev-token-"))
        return self.get_user_by_id(self.tokens.read_user_id(token))

    def get_user_by_id(self, user_id: str) -> User:
        if self.repository is not None:
            user = self.repository.get_user_by_id(user_id)
            if user is None:
                raise AppError(message="User not found", code="user_not_found", status_code=404)
            return model_to_user(user)

        for user in self._users_by_email.values():
            if user.id == user_id:
                return user

        raise AppError(message="User not found", code="user_not_found", status_code=404)

    def ensure_user(self, email: str) -> User:
        if self.repository is not None:
            normalized_email = email.lower()
            user = self.repository.get_user_by_email(normalized_email)
            if user is not None:
                return model_to_user(user)

            user = UserModel(
                id=new_id("usr"),
                email=normalized_email,
                display_name=normalized_email.split("@")[0].replace(".", " ").title(),
                password_hash="!",
                is_active=True,
                is_platform_admin=False,
            )
            return model_to_user(self.repository.save_user(user))

        normalized_email = email.lower()
        user = self._users_by_email.get(normalized_email)
        if user is not None:
            return user

        user = User(
            id=f"usr_{len(self._users_by_email) + 1}",
            email=normalized_email,
            display_name=normalized_email.split("@")[0].replace(".", " ").title(),
            password="!",
        )
        self._users_by_email[normalized_email] = user
        return user

    def get_or_create_default_admin(self) -> User:
        if self.repository is None:
            return self._users_by_email["admin@example.com"]

        existing = self.repository.get_user_by_email("admin@example.com")
        if existing is not None:
            return model_to_user(existing)

        user = UserModel(
            id="usr_admin",
            email="admin@example.com",
            display_name="System Administrator",
            password_hash=self._hash_password(self.settings.default_admin_password),
            is_active=True,
            is_platform_admin=True,
        )
        return model_to_user(self.repository.save_user(user))

    def _hash_password(self, password: str) -> str:
        return hash_password(
            password,
            iterations=self.settings.password_hash_iterations,
        )


def raise_invalid_credentials() -> None:
    raise AppError(
        message="Invalid email or password",
        code="invalid_credentials",
        status_code=401,
    )


def model_to_user(user: UserModel) -> User:
    return User(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        password=user.password_hash,
        is_active=user.is_active,
        is_platform_admin=user.is_platform_admin,
    )


def user_to_model(user: User) -> UserModel:
    return UserModel(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        password_hash=user.password,
        is_active=user.is_active,
        is_platform_admin=user.is_platform_admin,
    )


auth_service = AuthService()
