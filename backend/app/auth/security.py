from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken

from app.core.errors import AppError

PASSWORD_SCHEME = "pbkdf2_sha256"
TOKEN_PREFIX = "das1"


def hash_password(password: str, *, iterations: int) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return "$".join(
        (
            PASSWORD_SCHEME,
            str(iterations),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        )
    )


def verify_password(password: str, encoded: str) -> bool:
    if not encoded.startswith(f"{PASSWORD_SCHEME}$"):
        return hmac.compare_digest(encoded, password)

    try:
        _scheme, iterations_value, salt_value, digest_value = encoded.split("$", 3)
        iterations = int(iterations_value)
        salt = base64.urlsafe_b64decode(salt_value.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_value.encode("ascii"))
    except (ValueError, TypeError):
        return False

    actual = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)


def password_needs_upgrade(encoded: str, *, iterations: int) -> bool:
    if not encoded.startswith(f"{PASSWORD_SCHEME}$"):
        return True
    try:
        return int(encoded.split("$", 2)[1]) < iterations
    except (ValueError, IndexError):
        return True


@dataclass(frozen=True)
class AuthTokenManager:
    secret_key: str
    ttl_seconds: int

    def issue(self, user_id: str) -> str:
        payload = json.dumps(
            {"sub": user_id},
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        return f"{TOKEN_PREFIX}.{self._fernet().encrypt(payload).decode('ascii')}"

    def read_user_id(self, token: str) -> str:
        prefix, separator, encrypted = token.partition(".")
        if separator != "." or prefix != TOKEN_PREFIX or not encrypted:
            raise_invalid_token()

        try:
            payload = self._fernet().decrypt(
                encrypted.encode("ascii"),
                ttl=self.ttl_seconds,
            )
            claims = json.loads(payload.decode("utf-8"))
            user_id = claims.get("sub")
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            raise_invalid_token()

        if not isinstance(user_id, str) or not user_id:
            raise_invalid_token()
        return user_id

    def _fernet(self) -> Fernet:
        digest = hashlib.sha256(self.secret_key.encode("utf-8")).digest()
        return Fernet(base64.urlsafe_b64encode(digest))


def raise_invalid_token() -> None:
    raise AppError(
        message="Authentication token is invalid or expired",
        code="not_authenticated",
        status_code=401,
    )
