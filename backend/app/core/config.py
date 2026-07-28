from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Vibe Data Universe"
    app_env: str = "development"
    app_debug: bool = True
    api_prefix: str = "/api"

    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    backend_cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    database_url: str = "sqlite+pysqlite:///./storage/vibe-data.db"
    data_storage_root: str = "./storage/datasets"
    export_storage_root: str = "./storage/exports"
    upload_max_bytes: int = Field(default=128 * 1024 * 1024, gt=0)
    dataset_max_rows: int = Field(default=500_000, gt=0)
    dataset_max_columns: int = Field(default=300, gt=0)
    preview_rows: int = Field(default=30, gt=0, le=200)
    particle_sample_rows: int = Field(default=1_500, gt=0, le=10_000)

    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str | None = None
    llm_model: str = "gpt-5-mini"
    llm_api_style: Literal["responses", "chat_completions"] = "responses"
    llm_timeout_seconds: float = Field(default=30, gt=0)

    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
