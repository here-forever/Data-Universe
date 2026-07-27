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
    report_export_storage_root: str = "./storage/exports"
    report_export_max_rows_per_chart: int = Field(default=10_000, gt=0, le=100_000)
    import_max_file_size_bytes: int = Field(default=256 * 1024 * 1024, gt=0)
    import_max_rows: int = Field(default=2_000_000, gt=0)
    import_parse_timeout_seconds: float = Field(default=120, gt=0)
    import_inference_sample_size: int = Field(default=1_000, gt=0)
    import_preview_sample_size: int = Field(default=20, gt=0)
    import_materialization_batch_size: int = Field(default=1_000, gt=0)
    import_storage_chunk_size_bytes: int = Field(default=1024 * 1024, gt=0)
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
