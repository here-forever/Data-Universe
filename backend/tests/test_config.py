from app.core.config import Settings, get_settings


def test_settings_have_development_defaults() -> None:
    settings = Settings()

    assert settings.app_name == "Data Analysis System"
    assert settings.app_env == "development"
    assert settings.app_debug is True
    assert settings.api_prefix == "/api"
    assert settings.database_url.startswith("postgresql+psycopg://")


def test_get_settings_returns_cached_instance() -> None:
    first = get_settings()
    second = get_settings()

    assert first is second
