# Backend FastAPI Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend FastAPI foundation with configuration, application factory, health endpoint, error handling, database session scaffolding, Alembic, and pytest verification.

**Architecture:** The backend uses a modular monolith layout under `backend/app`, with `core` for configuration/errors/database, `api` for route registration, and `tests` for behavior verification. PostgreSQL is configured but not required to be running in this milestone; database connection objects are created lazily and tested without opening a real database connection.

**Tech Stack:** Python 3.13, FastAPI, Pydantic Settings, SQLAlchemy 2, Alembic, Pytest, HTTPX, Ruff.

---

## Scope

This plan implements Milestone 2 from `docs/MVP_ROADMAP.md`: Backend Skeleton.

It creates:

- Backend Python package structure.
- Dependency and tooling configuration.
- FastAPI app factory.
- Versioned API router.
- Health check endpoint.
- Settings management.
- Unified application error model.
- SQLAlchemy engine/session/Base scaffolding.
- Alembic migration environment.
- Pytest test suite.

This milestone does not implement authentication, project models, real database migrations, file upload, or frontend code.

## File Structure

- Create: `backend/pyproject.toml` — Python project metadata, dependencies, pytest, and Ruff config.
- Create: `backend/README.md` — backend-specific setup and commands.
- Create: `backend/alembic.ini` — Alembic CLI config.
- Create: `backend/alembic/env.py` — Alembic runtime env connected to app metadata/settings.
- Create: `backend/alembic/versions/.gitkeep` — empty migration directory placeholder.
- Create: `backend/app/__init__.py` — backend package marker.
- Create: `backend/app/main.py` — FastAPI application factory and module-level app.
- Create: `backend/app/api/__init__.py` — API package marker.
- Create: `backend/app/api/router.py` — versioned API router composition.
- Create: `backend/app/api/routes/__init__.py` — route package marker.
- Create: `backend/app/api/routes/health.py` — health route.
- Create: `backend/app/core/__init__.py` — core package marker.
- Create: `backend/app/core/config.py` — Pydantic settings.
- Create: `backend/app/core/database.py` — SQLAlchemy Base, engine factory, session factory.
- Create: `backend/app/core/errors.py` — app error class and handler.
- Create: `backend/app/core/logging.py` — logging setup helper.
- Create: `backend/tests/__init__.py` — tests package marker.
- Create: `backend/tests/conftest.py` — FastAPI test client fixture.
- Create: `backend/tests/test_config.py` — settings tests.
- Create: `backend/tests/test_health.py` — health endpoint tests.
- Create: `backend/tests/test_errors.py` — error handling tests.
- Create: `backend/tests/test_database.py` — database scaffolding tests.
- Modify: `.gitignore` — add backend generated cache/build entries if missing.
- Modify: `README.md` — add backend milestone status and backend commands.
- Modify: `docs/DEVELOPMENT_SETUP.md` — add backend local setup commands.

## Task 1: Configure Backend Python Project

**Files:**
- Create: `backend/pyproject.toml`
- Modify: `.gitignore`
- Test: command-level verification only; no production code in this task.

- [ ] **Step 1: Create `backend/pyproject.toml`**

```toml
[project]
name = "data-analysis-system-backend"
version = "0.1.0"
description = "FastAPI backend for the Data Analysis System."
readme = "README.md"
requires-python = ">=3.13"
dependencies = [
    "alembic>=1.17.0",
    "email-validator>=2.3.0",
    "fastapi>=0.121.0",
    "httpx>=0.28.0",
    "pydantic-settings>=2.11.0",
    "psycopg[binary]>=3.2.0",
    "python-dotenv>=1.2.0",
    "sqlalchemy>=2.0.0",
    "uvicorn[standard]>=0.38.0",
]

[dependency-groups]
dev = [
    "pytest>=9.0.0",
    "ruff>=0.14.0",
]

[tool.pytest.ini_options]
addopts = "-q"
testpaths = ["tests"]
pythonpath = ["."]

[tool.ruff]
line-length = 100
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
line-ending = "auto"
```

- [ ] **Step 2: Update `.gitignore` with backend build entries**

Ensure `.gitignore` includes these lines under the Python or generated files sections:

```gitignore
*.egg-info/
.eggs/
```

- [ ] **Step 3: Install backend dependencies**

Run from repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -e ".[dev]"
cd ..
```

Expected: dependencies install successfully. If network fails, stop and report the dependency installation failure.

- [ ] **Step 4: Verify tooling imports**

Run:

```powershell
backend\.venv\Scripts\python -c "import fastapi, sqlalchemy, alembic, pydantic_settings, pytest; print('backend tooling ok')"
```

Expected output includes:

```text
backend tooling ok
```

## Task 2: Add Settings Management With TDD

**Files:**
- Create: `backend/app/__init__.py`
- Create: `backend/app/core/__init__.py`
- Create: `backend/app/core/config.py`
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_config.py`

- [ ] **Step 1: Write failing settings tests**

Create `backend/tests/test_config.py`:

```python
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
```

Create empty package files:

```text
backend/app/__init__.py
backend/app/core/__init__.py
backend/tests/__init__.py
```

- [ ] **Step 2: Run settings tests to verify RED**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_config.py -q
```

Expected: FAIL because `app.core.config` does not exist.

- [ ] **Step 3: Implement settings**

Create `backend/app/core/config.py`:

```python
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
```

- [ ] **Step 4: Run settings tests to verify GREEN**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_config.py -q
```

Expected: PASS.

## Task 3: Add FastAPI App Factory and Health Endpoint With TDD

**Files:**
- Create: `backend/app/main.py`
- Create: `backend/app/api/__init__.py`
- Create: `backend/app/api/router.py`
- Create: `backend/app/api/routes/__init__.py`
- Create: `backend/app/api/routes/health.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_health.py`

- [ ] **Step 1: Write failing health tests**

Create `backend/tests/conftest.py`:

```python
import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())
```

Create `backend/tests/test_health.py`:

```python
from fastapi.testclient import TestClient


def test_health_endpoint_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "Data Analysis System",
        "environment": "development",
    }


def test_openapi_schema_uses_project_title(client: TestClient) -> None:
    response = client.get("/openapi.json")

    assert response.status_code == 200
    assert response.json()["info"]["title"] == "Data Analysis System"
```

Create empty package files:

```text
backend/app/api/__init__.py
backend/app/api/routes/__init__.py
```

- [ ] **Step 2: Run health tests to verify RED**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_health.py -q
```

Expected: FAIL because `app.main` does not exist.

- [ ] **Step 3: Implement health route, router, and app factory**

Create `backend/app/api/routes/health.py`:

```python
from fastapi import APIRouter

from app.core.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str]:
    settings = get_settings()
    return {
        "status": "ok",
        "service": settings.app_name,
        "environment": settings.app_env,
    }
```

Create `backend/app/api/router.py`:

```python
from fastapi import APIRouter

from app.api.routes import health

api_router = APIRouter()
api_router.include_router(health.router)
```

Create `backend/app/main.py`:

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
    )
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
```

- [ ] **Step 4: Run health tests to verify GREEN**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_health.py -q
```

Expected: PASS.

## Task 4: Add Unified App Error Handling With TDD

**Files:**
- Create: `backend/app/core/errors.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_errors.py`

- [ ] **Step 1: Write failing error handling test**

Create `backend/tests/test_errors.py`:

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import AppError
from app.main import create_app


def test_app_error_handler_returns_standard_payload() -> None:
    app = create_app()

    @app.get("/raise-app-error")
    def raise_app_error() -> None:
        raise AppError(message="Example failure", code="example_failure", status_code=418)

    response = TestClient(app).get("/raise-app-error")

    assert response.status_code == 418
    assert response.json() == {
        "error": {
            "code": "example_failure",
            "message": "Example failure",
        }
    }


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()

    assert isinstance(app, FastAPI)
```

- [ ] **Step 2: Run error tests to verify RED**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_errors.py -q
```

Expected: FAIL because `app.core.errors` does not exist.

- [ ] **Step 3: Implement error class and handler**

Create `backend/app/core/errors.py`:

```python
from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, message: str, code: str = "app_error", status_code: int = 400) -> None:
        self.message = message
        self.code = code
        self.status_code = status_code
        super().__init__(message)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,
            }
        },
    )
```

Modify `backend/app/main.py`:

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import AppError, app_error_handler


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
    )
    app.add_exception_handler(AppError, app_error_handler)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
```

- [ ] **Step 4: Run error tests to verify GREEN**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_errors.py -q
```

Expected: PASS.

## Task 5: Add SQLAlchemy Database Scaffolding With TDD

**Files:**
- Create: `backend/app/core/database.py`
- Create: `backend/tests/test_database.py`

- [ ] **Step 1: Write failing database scaffolding tests**

Create `backend/tests/test_database.py`:

```python
from sqlalchemy.orm import DeclarativeBase, Session

from app.core.database import Base, get_engine, get_session_factory


def test_base_is_declarative_base() -> None:
    assert issubclass(Base, DeclarativeBase)


def test_engine_uses_settings_database_url() -> None:
    engine = get_engine("sqlite+pysqlite:///:memory:")

    assert str(engine.url) == "sqlite+pysqlite:///:memory:"


def test_session_factory_creates_session() -> None:
    engine = get_engine("sqlite+pysqlite:///:memory:")
    session_factory = get_session_factory(engine)

    session = session_factory()
    try:
        assert isinstance(session, Session)
    finally:
        session.close()
```

- [ ] **Step 2: Run database tests to verify RED**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_database.py -q
```

Expected: FAIL because `app.core.database` does not exist.

- [ ] **Step 3: Implement database scaffolding**

Create `backend/app/core/database.py`:

```python
from collections.abc import Generator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import get_settings


class Base(DeclarativeBase):
    pass


def get_engine(database_url: str | None = None) -> Engine:
    settings = get_settings()
    return create_engine(database_url or settings.database_url, pool_pre_ping=True)


def get_session_factory(engine: Engine | None = None) -> sessionmaker[Session]:
    return sessionmaker(
        bind=engine or get_engine(),
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )


def get_db_session() -> Generator[Session, None, None]:
    session_factory = get_session_factory()
    session = session_factory()
    try:
        yield session
    finally:
        session.close()
```

- [ ] **Step 4: Run database tests to verify GREEN**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests\test_database.py -q
```

Expected: PASS.

## Task 6: Add Logging Setup and Alembic Environment

**Files:**
- Create: `backend/app/core/logging.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/.gitkeep`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add logging setup helper**

Create `backend/app/core/logging.py`:

```python
import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
```

Modify `backend/app/main.py`:

```python
from fastapi import FastAPI

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import AppError, app_error_handler
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
    )
    app.add_exception_handler(AppError, app_error_handler)
    app.include_router(api_router, prefix=settings.api_prefix)
    return app


app = create_app()
```

- [ ] **Step 2: Add Alembic config**

Create `backend/alembic.ini`:

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
sqlalchemy.url = postgresql+psycopg://data_analysis_user:data_analysis_password@127.0.0.1:5432/data_analysis_system

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

Create `backend/alembic/env.py`:

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.core.database import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

settings = get_settings()
config.set_main_option("sqlalchemy.url", settings.database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Create empty file:

```text
backend/alembic/versions/.gitkeep
```

- [ ] **Step 3: Run current tests after logging/Alembic additions**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests -q
```

Expected: all tests PASS.

## Task 7: Add Backend README and Root Documentation Updates

**Files:**
- Create: `backend/README.md`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT_SETUP.md`

- [ ] **Step 1: Create `backend/README.md`**

```markdown
# Backend

FastAPI backend for the Data Analysis System.

## Local Setup

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -e ".[dev]"
```

## Run Tests

From the repository root:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests -q
```

## Run Development Server

From the repository root:

```powershell
backend\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --reload
```

Health check:

```text
http://127.0.0.1:8000/api/health
```

## Notes

PostgreSQL is configured in `.env.example`, but a running database is not required for the current backend skeleton tests.
```

- [ ] **Step 2: Update root `README.md`**

Append this section to `README.md`:

```markdown

## Backend Skeleton

The backend skeleton provides:

- FastAPI app factory.
- `/api/health` endpoint.
- Pydantic settings.
- Standard application error response.
- SQLAlchemy base, engine, and session factory.
- Alembic environment.
- Pytest test suite.

Backend commands are documented in `backend/README.md`.
```

- [ ] **Step 3: Update `docs/DEVELOPMENT_SETUP.md`**

Append this section:

```markdown

## Backend Commands

Create and install the backend environment:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python -m pip install --upgrade pip
.\.venv\Scripts\python -m pip install -e ".[dev]"
cd ..
```

Run backend tests:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests -q
```

Run backend dev server:

```powershell
backend\.venv\Scripts\python -m uvicorn app.main:app --app-dir backend --reload
```
```

- [ ] **Step 4: Verify documentation files can be read**

Run:

```powershell
Get-Content backend\README.md
Get-Content README.md
Get-Content docs\DEVELOPMENT_SETUP.md
```

Expected: output includes backend commands and health endpoint URL.

## Task 8: Run Full Backend Verification and Commit

**Files:**
- All backend skeleton files and docs from Tasks 1-7.

- [ ] **Step 1: Run full backend tests**

Run:

```powershell
backend\.venv\Scripts\python -m pytest backend\tests -q
```

Expected: all tests PASS.

- [ ] **Step 2: Run Ruff check**

Run:

```powershell
backend\.venv\Scripts\python -m ruff check backend
```

Expected: no lint errors.

- [ ] **Step 3: Run Ruff format check**

Run:

```powershell
backend\.venv\Scripts\python -m ruff format --check backend
```

Expected: all files already formatted.

- [ ] **Step 4: Check Git status**

Run:

```powershell
git status --short
```

Expected: backend files, docs, and plan file are modified or untracked.

- [ ] **Step 5: Stage files**

Run:

```powershell
git add backend README.md docs/DEVELOPMENT_SETUP.md docs/superpowers/plans/2026-07-04-backend-fastapi-skeleton-plan.md .gitignore
```

- [ ] **Step 6: Commit files**

Run:

```powershell
git commit -m "chore: add backend fastapi skeleton"
```

Expected: commit succeeds.

- [ ] **Step 7: Verify clean working tree**

Run:

```powershell
git status --short
```

Expected: no modified or untracked files.

## Self-Review

- Spec coverage: Covers app entrypoint, configuration, database connection scaffolding, SQLAlchemy Base, Alembic setup, unified error handling, structured logging setup, and health endpoint.
- Placeholder scan: No TBD/TODO placeholders are present.
- Type consistency: `Settings`, `create_app`, `AppError`, `Base`, `get_engine`, and `get_session_factory` are defined before later tests use them.
