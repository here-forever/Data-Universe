# Data Analysis System

A professional, usable, and extensible data analysis workspace built for individuals and small teams. The project starts as a modular monolith and follows a clear path toward a larger data platform without introducing enterprise complexity too early.

## Current State

The repository contains a demo-ready MVP foundation with a working end-to-end data path:

```text
CSV / Excel / external PostgreSQL or MySQL
  -> retained source and preview
  -> PostgreSQL-backed dataset
  -> visual cleaning or read-only SQL
  -> reusable data view
  -> ECharts chart
  -> dashboard/report
  -> task, audit, and lineage records
```

Implemented product surfaces include:

- Local CSV/Excel import with durable source retention, preview recovery, editable fields, and import history.
- Formal datasets materialized as physical PostgreSQL tables with pagination and quality profiling.
- External PostgreSQL/MySQL read-only connections, discovery, preview, table/SQL import, history, and retry.
- Saveable cleaning recipes executed into derived datasets.
- Project-scoped read-only SQL with reusable Data View materialization.
- ECharts chart configuration and dashboard/report layout foundations.
- Task Center with status, errors, related-resource links, and synchronous retry for supported operations.
- Basic project collaboration, resource permissions, operation logs, and data lineage.

Detailed status and known limitations are tracked in [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md).

## Technology

- Backend: Python 3.13, FastAPI, SQLAlchemy, Alembic, Pydantic, PostgreSQL.
- Data processing: current tabular parsing foundation with Pandas/Polars reserved for broader processing milestones.
- Frontend: React, TypeScript, Vite, TanStack Query, Zustand, Tailwind CSS, ECharts.
- Development deployment: Docker Compose with PostgreSQL, Redis, backend, and frontend services.

## Run The Demo

Prerequisites: Docker Desktop with Docker Compose.

```powershell
docker compose up -d --build
docker compose exec backend python -m alembic upgrade head
docker compose exec backend python /demo/scripts/seed_demo.py
```

Open `http://127.0.0.1:5173` and use the seeded project `prj_demo`.

The seed is idempotent and creates synthetic demo resources for the full workflow. See [`docs/DEMO_GUIDE.md`](docs/DEMO_GUIDE.md) for direct page links and the expected walkthrough.

## Local Development

Copy `.env.example` to `.env` and replace every placeholder before using local services outside the default Docker demo environment.

Setup, migration, test, and troubleshooting commands are documented in [`docs/DEVELOPMENT_SETUP.md`](docs/DEVELOPMENT_SETUP.md). Backend- and frontend-specific notes are also available in [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md).

## Validation

```powershell
backend\.venv\Scripts\python -m ruff check backend
backend\.venv\Scripts\python -m pytest backend\tests -q
cd frontend
npm.cmd run lint
npm.cmd test -- --run
npm.cmd run build
```

GitHub Actions runs the equivalent backend and frontend checks for pushes and pull requests.

## Security And Privacy

The tracked demo data is synthetic. Runtime uploads, local storage, `.env` files, credentials, database files, and private key formats are ignored by Git.

External database passwords are encrypted at rest with the configured `EXTERNAL_CONNECTION_ENCRYPTION_KEY`, and legacy development records are upgraded after a successful connection test. Authentication and key management remain development-oriented, so do not expose this MVP directly to the public internet. Review [`SECURITY.md`](SECURITY.md) before deployment or connector testing with non-demo systems.

## Project Direction

The main product and engineering constraints live in [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md), with the staged roadmap in [`docs/MVP_ROADMAP.md`](docs/MVP_ROADMAP.md).

The immediate goal remains a complete personal/small-team data development and analysis system. Enterprise features such as distributed workers, scheduled sync, API sources, field/row permissions, full lineage visualization, multi-tenancy, and Kubernetes remain later-stage work.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Keep contributions scoped, preserve traceability, and use synthetic or anonymized data in tests and examples.

## License

No open-source license has been selected yet. The repository is public for evaluation, but reuse and redistribution rights should be treated as reserved until a license is added.
