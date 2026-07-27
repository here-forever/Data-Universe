# Data Analysis System

A professional, usable, and extensible data analysis workspace built for individuals and small teams. The project starts as a modular monolith and follows a clear path toward a larger data platform without introducing enterprise complexity too early.

## Current State

The repository contains a demo-ready MVP foundation with a working end-to-end data path:

```text
CSV / Excel
  -> retained source and preview
  -> PostgreSQL-backed dataset
  -> visual cleaning / ETL
  -> statistics / metrics / dimension analysis / linear model
  -> reusable data view and ECharts chart
  -> dashboard / report / data screen / export
  -> task, audit, and lineage records
```

Implemented product surfaces include:

- Local CSV/Excel import with durable source retention, preview recovery, editable fields, and import history.
- Formal datasets materialized as physical PostgreSQL tables with pagination and quality profiling.
- Saveable cleaning recipes executed into derived datasets.
- Dataset analysis workbench with filters, grouped metrics, descriptive statistics, correlation, linear regression, and CSV/Excel export.
- Project-scoped read-only SQL with reusable Data View materialization.
- ECharts chart configuration plus dashboard, free-report, and data-screen layout modes.
- Task Center with status, errors, related-resource links, and synchronous retry for supported operations.
- Governance Center with recoverable archive/restore for core resources, focused upstream/downstream dependencies, operation-log search, and project-member role management.
- Expiring signed sessions, salted password hashing with legacy credential upgrade, development-token isolation, and owner-controlled collaboration workflows.

Detailed status and known limitations are tracked in [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). The active delivery sequence and acceptance criteria live in [`docs/NEXT_PHASE_PLAN.md`](docs/NEXT_PHASE_PLAN.md).

The current product surface is intentionally local-file-first. Existing external PostgreSQL/MySQL backend foundations remain in the repository for future reactivation, but the Data Sources UI does not expose them in this stage.

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
docker compose exec backend python /demo/scripts/validate_release.py --project-id prj_demo
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

External database passwords are encrypted at rest with the configured `EXTERNAL_CONNECTION_ENCRYPTION_KEY`. User passwords use salted PBKDF2 hashes, legacy local passwords upgrade after successful authentication, and issued sessions are signed and time-limited. Internet-facing deployments still require TLS, rate limiting, password recovery, MFA or equivalent policy, and managed secret distribution. Review [`SECURITY.md`](SECURITY.md) and [`docs/DEPLOYMENT_OPERATIONS.md`](docs/DEPLOYMENT_OPERATIONS.md) before non-local use.

## Project Direction

The main product and engineering constraints live in [`docs/PROJECT_MEMORY.md`](docs/PROJECT_MEMORY.md), with the historical MVP roadmap in [`docs/MVP_ROADMAP.md`](docs/MVP_ROADMAP.md) and the active follow-up plan in [`docs/NEXT_PHASE_PLAN.md`](docs/NEXT_PHASE_PLAN.md).

The immediate goal remains a complete personal/small-team data development and analysis system. Enterprise features such as distributed workers, scheduled sync, API sources, field/row permissions, full lineage visualization, multi-tenancy, and Kubernetes remain later-stage work.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Keep contributions scoped, preserve traceability, and use synthetic or anonymized data in tests and examples.

## License

No open-source license has been selected yet. The repository is public for evaluation, but reuse and redistribution rights should be treated as reserved until a license is added.
