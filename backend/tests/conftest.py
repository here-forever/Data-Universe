from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth.service import auth_service
from app.cleaning.service import cleaning_service
from app.core.config import get_settings
from app.core.database import Base, get_db_session, import_models
from app.data_sources.service import data_source_service
from app.data_views.service import data_view_service
from app.datasets.service import dataset_service
from app.imports.service import import_service
from app.main import create_app
from app.permissions.service import permission_service
from app.projects.service import project_service
from app.tasks.service import task_service
from app.visualizations.service import visualization_service


@pytest.fixture(autouse=True)
def reset_development_services() -> None:
    auth_service.reset()
    project_service.reset()
    permission_service.reset()
    import_service.reset()
    dataset_service.reset()
    cleaning_service.reset()
    data_view_service.reset()
    data_source_service.reset()
    task_service.reset()
    visualization_service.reset()


@pytest.fixture
def client(tmp_path, monkeypatch) -> Generator[TestClient]:
    monkeypatch.setenv("UPLOAD_STORAGE_ROOT", str(tmp_path / "uploads"))
    get_settings.cache_clear()
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
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()
