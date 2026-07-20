# Implementation Status

Last updated: 2026-07-16

This document records what has already been implemented so the project can continue without losing context.

## Current Position

The project is in the first-stage foundation period. The target is still:

```text
professional data analysis workspace
  -> usable MVP
  -> extensible modular monolith
  -> later enterprise-grade data platform
```

Current implementation has moved beyond pure planning. The repository now has backend, frontend, Docker, database model, collaboration, import preview, formal dataset materialization, cleaning, SQL data views, chart/dashboard, audit/lineage hooks, task center foundations, and external database intake with preview, history, retry, and formal dataset materialization.

The project now also has a demo-ready MVP seed path for `prj_demo`, so the current implementation can be opened as a real working demo instead of only being exercised through isolated API/tests.

## Implemented Documentation

- Project memory and technical constraints: `docs/PROJECT_MEMORY.md`.
- MVP development roadmap: `docs/MVP_ROADMAP.md`.
- Local and Docker development setup: `docs/DEVELOPMENT_SETUP.md`.
- Agent/development instructions: `AGENTS.md`.
- Docker service notes: `docker/README.md`.
- Demo walkthrough and seed instructions: `docs/DEMO_GUIDE.md`.

## Implemented Backend Foundation

- FastAPI application factory and API router.
- Health check endpoint: `/api/health`.
- Environment configuration with Pydantic settings.
- CORS configuration.
- Structured application errors.
- Logging setup.
- SQLAlchemy base/session setup.
- Alembic migration foundation.
- Auth, project, permission, import, and dataset route modules.

## Implemented Backend Product Modules

- Development login flow with a default admin account.
- Project creation API.
- Project member API foundation.
- Resource permission API foundation.
- CSV and Excel parsing.
- File import preview API.
- Persisted uploaded-file metadata.
- Staged uploaded-file storage before parsing, with upload status and parse error metadata.
- Project-scoped upload/import history API showing successful and failed file access attempts.
- Persisted import-preview metadata and sample rows.
- Saved import-preview retrieval API for reopening parsed upload records.
- Dataset metadata creation API.
- Project-scoped duplicate dataset name protection.
- Formal dataset materialization into physical database tables.
- Dataset list, detail, and paged preview APIs.
- Dataset quality profile API with null, distinct, duplicate, sample, and warning summaries.
- Visual cleaning recipe creation, preview, and execution into derived datasets.
- SQL workspace metadata, read-only query execution, and saved SQL results as reusable data views.
- Data view creation, list, and paged preview APIs.
- Chart definition creation/list APIs backed by data views.
- Dashboard/report layout creation/list APIs backed by chart resources.
- Task center API for project-scoped workflow task status visibility.
- Task failure records for import parsing, dataset materialization, cleaning execution, SQL execution/materialization, and chart/dashboard save actions.
- Task retry API with persisted retry metadata and in-process synchronous replay for selected safe operations.
- Retryable task execution currently covers dataset materialization, external table import, external SQL import, cleaning recipe execution, SQL data view materialization, chart save, and dashboard/report save.
- External PostgreSQL/MySQL connection metadata APIs.
- Project-scoped external database connection list API.
- External database connection creation with first-stage read-only policy enforcement.
- External database connection test API using SQLAlchemy adapters for PostgreSQL and MySQL.
- External database connection responses intentionally omit stored passwords.
- External database passwords are encrypted at rest with a versioned Fernet credential format and a dedicated environment key, with read compatibility and test-time upgrade for legacy base64 records.
- External database connections support metadata updates, optional password rotation, recoverable archive, and restore flows with operation logs.
- External PostgreSQL/MySQL schema and table discovery API.
- External table and read-only SQL preview APIs before formal import.
- External table import into formal PostgreSQL-backed datasets.
- External custom read-only SQL import into formal PostgreSQL-backed datasets.
- External imports support edited field names, types, and nullability before materialization.
- External import history/detail APIs backed by task records and retry metadata.
- External database imports are connected to task center, operation logs, basic lineage, dataset preview, and dataset quality profiling.
- Basic operation log and lineage records for implemented workflow actions.
- Persisted dataset fields and physical table name mapping.
- Demo seed script that creates/reuses a fixed `prj_demo` project, imports example CSV data, creates a cleaned dataset, saves a SQL data view, saves charts, saves a dashboard, and keeps task/lineage traceability.

## Implemented Database Foundation

Initial core tables have been modeled and migrated:

- `users`
- `projects`
- `project_members`
- `resource_permissions`
- `uploaded_files`
- `file_import_previews`
- `datasets`
- `dataset_fields`
- `dataset_table_maps`
- `tasks`
- `operation_logs`
- `lineage_edges`
- `external_database_connections`

## Implemented Frontend Foundation

- React + TypeScript + Vite skeleton.
- React Router route structure.
- TanStack Query provider.
- Zustand workspace store.
- Tailwind CSS tokens and base styling.
- Basic app shell and navigation.
- Dataset workspace page with project dataset list, schema, and paged preview.
- Data source center page for local file intake, upload outcomes, dataset bridge links, and reserved connector states.
- Import wizard page for CSV/Excel preview and dataset creation.
- Import wizard upload status and failure recovery hints.
- Import wizard upload history panel with parsed/failed file records and task trace links.
- Import wizard can reopen saved parsed previews from upload history and continue dataset creation.
- Dataset workspace quality overview for materialized datasets.
- Cleaning workbench page for visual recipe preview, save, and execution.
- SQL workspace page for project-scoped query execution and data view saving.
- Chart configuration page with real Data View fields and ECharts rendering.
- Dashboard/report source page with basic free-layout report mode.
- Task center page with project filtering, status summary, workflow coverage, and recent task table.
- Task center retry entry controlled by backend retry eligibility, with immediate list refresh and completion feedback.
- Task center related-resource links for datasets, data views, charts, and dashboards, with target pages reading route query parameters for selection/highlighting.
- Data source center external database panel for PostgreSQL/MySQL connection creation, encrypted credential rotation, metadata editing, recoverable archive/restore, saved connection listing, status display, connection error display, manual connection testing, schema discovery, preview-before-import, editable field confirmation, external table import, advanced read-only SQL import, and external import history/detail.
- Tailwind design tokens now include the Workshop Toolkit-inspired sky, lilac, rose, and mint palette for gradual frontend visual-system adoption.
- Placeholder pages remain only for features not yet implemented beyond the current data intake, dataset, cleaning, SQL, chart, dashboard, and task surfaces.
- Workspace home page now acts as a demo entry screen linking into the main implemented workflow surfaces.
- Frontend API client tests.

## Implemented Docker Foundation

- Docker Compose development stack.
- PostgreSQL service.
- Redis service.
- Backend service.
- Frontend service.
- Backend and frontend Dockerfiles.
- `.env.example` for local configuration.

## Verified So Far

- Docker services can build and start successfully.
- Frontend is reachable at `http://127.0.0.1:5173`.
- Backend health check is reachable at `http://127.0.0.1:8000/api/health`.
- Alembic migration has been applied to Docker PostgreSQL.
- Login, project creation, member/permission creation, CSV/Excel preview upload, formal dataset creation, cleaning execution, SQL data view saving, chart/dashboard saving, task center listing, failure task recording, retry request flow, related-resource navigation, external PostgreSQL/MySQL connection create/list/test flows, schema discovery, external preview, field-edited import, external table import retry, external import history/detail, external table import, and external read-only SQL import were verified through tests or API flows.
- Backend test suite passed locally: 59 tests.
- Frontend test suite passed: 28 tests.
- Frontend lint passed.
- Frontend build passed, with only the existing ECharts chunk-size warning.
- Demo seed has been executed successfully through Docker Compose.
- Frontend demo pages were checked through a headless Edge/Playwright pass against the running Docker stack: home, datasets, charts, dashboards, and tasks loaded expected demo content, and the chart page rendered an ECharts canvas.

## Current Limitations

- Uploaded file bytes are saved in durable local storage, with metadata in PostgreSQL.
- Uploads are staged before parsing, so failed parse attempts can be traced to an uploaded file record.
- Upload/import history is queryable by project and shows uploaded-file status, parse errors, and linked preview metadata when parsing succeeds.
- Import preview stores sample rows for confirmation before formal dataset creation.
- Parsed upload history records can restore their saved preview metadata without re-uploading the source file.
- Data Sources now acts as the main local file intake overview and links into import previews, task traces, and formal datasets.
- Formal dataset creation creates and populates a physical table.
- Dataset names are unique within a project to avoid accidental overwrite-like workflows.
- Dataset quality profiling is computed on demand from materialized rows and is not yet cached or task-backed.
- Operation logs and lineage records exist for the implemented workflow actions, but the lineage graph UI is not implemented yet.
- Task center records synchronous workflow actions as completed or failed/retryable tasks.
- Retry execution is synchronous inside the API request for selected safe operations; it is not yet backed by Redis/Celery/RQ or a distributed worker.
- File preview parse failures are recorded against staged uploaded files; user-correctable validation failures remain non-retryable, while unexpected parse failures can keep retry metadata.
- Authentication is still development-oriented and not production JWT/auth hardening.
- External database imports currently preview and materialize bounded snapshots through row limits; scheduled sync, incremental sync, and streaming/large-table import are not implemented yet.
- External table/SQL import retry is synchronous inside the API request and replays the read/import operation, but it is not yet backed by a distributed worker.
- External connection passwords use application-level encrypted storage, but production deployments still need protected key distribution, backup, and rotation procedures or a managed secret store.
- External connection testing validates basic connectivity through the configured adapter and product-level read-only policy, but it does not yet prove the external database user lacks write privileges.
- External custom SQL import uses the shared read-only SQL validator, but it is still not a full SQL firewall or database privilege audit.
- If frontend dependencies change while using Docker Compose, the named `frontend_node_modules` volume may need `docker compose exec frontend npm install` or a volume reset to refresh installed packages.
- API data sources are still reserved for later milestones.
- Scheduled sync and distributed worker execution are not implemented yet.

## Updated Engineering Constraints

Future work must preserve these boundaries:

- Keep project structure layered and readable.
- Keep important data paths traceable from source to final report/dashboard.
- Keep original source data durable so imports can be inspected or reprocessed.
- Avoid silent overwrites and accidental hard deletion of user assets.
- Prefer small, meaningful Git commits after each milestone.
- Keep the first stage as a modular monolith with clear future extraction boundaries.
- Use the Figma Community "Workshop Toolkit" as the primary visual-mood reference while retaining the existing analytics-dashboard reference for information architecture. The product should combine soft pastel layers and friendly accents with compact, professional data work surfaces.

## Recommended Next Build Step

The next implementation step should make larger imports reliable without jumping directly to a distributed platform:

1. Add chunked reads and batched PostgreSQL writes for larger file and external-database imports.
2. Move long-running imports behind the existing task boundary with progress updates and cancellation-safe failure records.
3. Introduce a lightweight worker adapter that can later switch to Redis/Celery or RQ before scheduled sync is added.

This order keeps the main data workflow traceable while avoiding premature Celery/RQ complexity.
