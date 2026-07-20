from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Data Analysis System"
    app_env: str = "development"
    app_debug: bool = True
    app_secret_key: str = "change-me-in-local-env"
    api_prefix: str = "/api"

    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = Field(
        default="postgresql+psycopg://data_analysis_user:data_analysis_password"
        "@127.0.0.1:5432/data_analysis_system"
    )

    redis_url: str = "redis://127.0.0.1:6379/0"
    local_storage_root: str = "./storage"
    upload_storage_root: str = "./storage/uploads"
    access_token_expire_minutes: int = 1440
    password_hash_scheme: str = "bcrypt"
    external_connection_encryption_key: str | None = None

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
