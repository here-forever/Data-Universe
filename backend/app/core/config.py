import os
from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.ssrf_guard import UnsafeUrlError, validate_outbound_https_url


class Settings(BaseSettings):
    app_name: str = "Vibe Data Universe"
    app_version: str = "1.1.0"
    app_env: Literal["development", "test", "production"] = "development"
    app_debug: bool = False
    api_prefix: str = "/api/v1"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = "sqlite+pysqlite:///./storage/vibe-data.db"
    data_storage_root: str = "./storage/datasets"
    export_storage_root: str = "./storage/exports"
    upload_max_bytes: int = Field(default=128 * 1024 * 1024, gt=0)
    upload_chunk_bytes: int = Field(default=1024 * 1024, ge=64 * 1024, le=8 * 1024 * 1024)
    upload_spool_max_bytes: int = Field(default=4 * 1024 * 1024, ge=64 * 1024)
    dataset_max_rows: int = Field(default=500_000, gt=0)
    dataset_max_columns: int = Field(default=300, gt=0)
    preview_rows: int = Field(default=30, gt=0, le=200)
    particle_sample_rows: int = Field(default=1_500, gt=0, le=10_000)
    database_pool_size: int = Field(default=5, ge=1, le=50)

    collaboration_max_rooms: int = Field(default=100, ge=1, le=10_000)
    collaboration_max_connections_per_room: int = Field(default=20, ge=1, le=1_000)
    collaboration_max_message_bytes: int = Field(default=16 * 1024, ge=256, le=1024 * 1024)
    collaboration_rate_limit_messages: int = Field(default=30, ge=1, le=10_000)
    collaboration_rate_limit_window_seconds: float = Field(default=10, gt=0, le=3600)

    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str | None = None
    llm_model: str = "gpt-5-mini"
    llm_api_style: Literal["responses", "chat_completions"] = "responses"
    llm_timeout_seconds: float = Field(default=30, gt=0)
    llm_input_cost_per_million: float = Field(default=0, ge=0)
    llm_output_cost_per_million: float = Field(default=0, ge=0)

    model_config = SettingsConfigDict(
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_environment(self) -> Self:
        try:
            self.llm_base_url = validate_outbound_https_url(
                self.llm_base_url,
                resolve_dns=False,
            )
        except UnsafeUrlError as error:
            raise ValueError(str(error)) from error
        if self.app_env == "production" and self.app_debug:
            raise ValueError("APP_DEBUG must be false when APP_ENV=production")
        if self.app_env == "production":
            origins = self.cors_origins_list
            if not origins or any(
                origin == "*" or not origin.startswith("https://") for origin in origins
            ):
                raise ValueError(
                    "BACKEND_CORS_ORIGINS must contain only explicit HTTPS origins in production"
                )
        if self.upload_spool_max_bytes > self.upload_max_bytes:
            self.upload_spool_max_bytes = self.upload_max_bytes
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    if app_env not in {"development", "test", "production"}:
        app_env = "development"
    return Settings(
        _env_file=(
            "../.env",
            ".env",
            f"../.env.{app_env}",
            f".env.{app_env}",
        )
    )
