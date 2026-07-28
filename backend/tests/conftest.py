from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings
from app.core.database import Base, get_db_session, import_models, reset_database_bindings
from app.main import create_app


@pytest.fixture
def client(tmp_path, monkeypatch) -> Generator[TestClient]:
    monkeypatch.setenv("DATABASE_URL", f"sqlite+pysqlite:///{tmp_path / 'vibe-test.db'}")
    monkeypatch.setenv("DATA_STORAGE_ROOT", str(tmp_path / "datasets"))
    monkeypatch.setenv("EXPORT_STORAGE_ROOT", str(tmp_path / "exports"))
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    get_settings.cache_clear()
    reset_database_bindings()
    import_models()
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    app = create_app()

    def override_get_db_session():
        session: Session = session_factory()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db_session] = override_get_db_session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(engine)
        engine.dispose()
        get_settings.cache_clear()
        reset_database_bindings()
