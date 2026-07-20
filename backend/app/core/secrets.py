from base64 import b64decode, urlsafe_b64encode
from hashlib import sha256

from cryptography.fernet import Fernet, InvalidToken

SECRET_PREFIX = "fernet:v1:"


class SecretDecryptionError(ValueError):
    pass


class CredentialCipher:
    def __init__(self, secret_key: str) -> None:
        if not secret_key.strip():
            raise ValueError("Credential encryption key must not be empty")
        derived_key = urlsafe_b64encode(sha256(secret_key.encode("utf-8")).digest())
        self._fernet = Fernet(derived_key)

    def encrypt(self, value: str) -> str:
        token = self._fernet.encrypt(value.encode("utf-8")).decode("ascii")
        return f"{SECRET_PREFIX}{token}"

    def decrypt(self, value: str) -> str:
        if value.startswith(SECRET_PREFIX):
            token = value.removeprefix(SECRET_PREFIX)
            try:
                return self._fernet.decrypt(token.encode("ascii")).decode("utf-8")
            except (InvalidToken, UnicodeDecodeError) as error:
                raise SecretDecryptionError(
                    "Stored credential cannot be decrypted with the configured key"
                ) from error

        try:
            return b64decode(value.encode("ascii"), validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as error:
            raise SecretDecryptionError("Stored credential has an unsupported format") from error

    @staticmethod
    def is_legacy(value: str) -> bool:
        return not value.startswith(SECRET_PREFIX)
