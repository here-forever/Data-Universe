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

## Local Auth and Project API

Current local development endpoints include:

- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/projects`
- `GET /api/projects`
- `POST /api/projects/{project_id}/members`
- `GET /api/projects/{project_id}/members`
- `POST /api/permissions/resources`
- `GET /api/permissions/resources?project_id=...`

The initial development account is:

```text
email: admin@example.com
password: admin123
```

The auth, project, project member, and resource permission endpoints use SQLAlchemy repositories. Tests run against isolated in-memory SQLite, while Docker development uses PostgreSQL.

## File Import Preview API

Current local development import endpoints include:

- `POST /api/imports/file-previews`
- `POST /api/datasets`

The import preview endpoint supports CSV and Excel files, returns inferred fields, row count, and sample rows. Import previews, uploaded file metadata, dataset metadata, dataset fields, and dataset table maps use SQLAlchemy repositories. Physical PostgreSQL dataset data tables will be added in the next dataset materialization step.

## Docker Development

From the repository root:

```powershell
docker compose up --build backend postgres redis
```

The backend container uses:

```text
DATABASE_URL=postgresql+psycopg://data_analysis_user:data_analysis_password@postgres:5432/data_analysis_system
REDIS_URL=redis://redis:6379/0
```

## Database Migrations

Run Alembic migrations inside the backend container:

```powershell
docker compose exec backend python -m alembic upgrade head
```

The initial migration creates core MVP metadata tables for users, projects, project members, resource permissions, uploaded files, file import previews, datasets, dataset fields, dataset table maps, tasks, operation logs, and lineage edges.
