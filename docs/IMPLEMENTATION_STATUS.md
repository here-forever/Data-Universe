# Implementation Status

Last updated: 2026-07-27

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

The active product scope is now local-file-first. CSV/Excel intake is the only data-source workflow shown in the frontend; existing external database backend foundations are retained but paused from current product development.

The project now also has a demo-ready MVP seed path for `prj_demo`, so the current implementation can be opened as a real working demo instead of only being exercised through isolated API/tests. Phases 1 through 5 are delivered: local intake, reliable large imports, reusable analysis assets, versioned report/export delivery, and governance/release hardening now form a traceable end-to-end workflow.

## Implemented Documentation

- Project memory and technical constraints: `docs/PROJECT_MEMORY.md`.
- MVP development roadmap: `docs/MVP_ROADMAP.md`.
- Local and Docker development setup: `docs/DEVELOPMENT_SETUP.md`.
- Agent/development instructions: `AGENTS.md`.
- Docker service notes: `docker/README.md`.
- Demo walkthrough and seed instructions: `docs/DEMO_GUIDE.md`.
- Deployment, upgrade, backup, restore, and recovery runbook: `docs/DEPLOYMENT_OPERATIONS.md`.

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

- PBKDF2 password hashing with transparent upgrade of legacy plaintext credentials after successful authentication.
- Time-limited Fernet-signed sessions, with fixed development tokens restricted to explicit development mode.
- Current-user and logout flows for authenticated frontend sessions.
- Project creation API.
- Project member list, add, role-update, and remove workflows with owner/self-protection and project-role authorization.
- Resource permission API foundation.
- CSV and Excel parsing.
- Bounded-memory CSV row streaming and read-only Excel worksheet iteration.
- Configurable local-import byte, row-count, parse-time, inference-sample, preview-sample, storage-chunk, and materialization-batch limits.
- Exact preview row counts with bounded type-inference and preview samples.
- File import preview API.
- Persisted uploaded-file metadata.
- Staged uploaded-file storage before parsing, with upload status and parse error metadata.
- Project-scoped upload/import history API showing successful and failed file access attempts.
- Persisted import-preview metadata and sample rows.
- Saved import-preview retrieval API for reopening parsed upload records.
- Dataset metadata creation API.
- Project-scoped duplicate dataset name protection.
- Formal dataset materialization into physical database tables.
- Batched physical-table inserts from reopenable row iterators, with source row-count drift detection before commit.
- Dataset list, detail, and paged preview APIs.
- Dataset quality profile API with null, distinct, duplicate, sample, and warning summaries.
- Visual cleaning recipe creation, preview, and execution into derived datasets.
- SQL workspace metadata, read-only query execution, and saved SQL results as reusable data views.
- Data view creation, list, and paged preview APIs.
- Chart definition creation/list APIs backed by data views.
- Dashboard/report layout creation/list APIs backed by chart resources.
- Versioned dashboard/report configuration read/update APIs with legacy-layout normalization and optimistic concurrency control.
- Durable dashboard exports in CSV, XLSX, and printable PDF formats, including export history and artifact download APIs.
- Report export source snapshots, task records, operation logs, and lineage edges from dashboards to generated artifacts.
- Task center API for project-scoped workflow task status visibility.
- Persisted parsing and dataset-materialization progress checkpoints with the last completed checkpoint retained on failure.
- Task failure records for import parsing, dataset materialization, cleaning execution, SQL execution/materialization, and chart/dashboard save actions.
- Task retry API with persisted retry metadata and in-process synchronous replay for selected safe operations.
- Retryable task execution currently covers dataset materialization, external table import, external SQL import, cleaning recipe execution, SQL data view materialization, chart save, and dashboard/report save.
- Report export failures retain retry metadata and can be replayed through the task retry workflow.
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
- Project-scoped governance APIs for searchable resources, recoverable archive/restore, operation logs, and four-level focused lineage traversal.
- Recoverable archive state for datasets, data views, analysis definitions, cleaning recipes, charts, and dashboards.
- SQL data-view lineage from referenced datasets to materialized views, preserving report provenance through the local import path.
- Dataset analytics API with validated filters, multi-dimension grouped metrics, descriptive statistics, Pearson correlation, and single-feature linear regression.
- Saved analysis definition APIs for validated, project-scoped configuration persistence, reopening, rerunning, and result materialization.
- Analysis result materialization into physical data views for aggregate, numeric-statistics, categorical-statistics, correlation, and regression outputs, with task, operation-log, and lineage records.
- CSV and Excel analysis-result export with audit records.
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
- `analysis_definitions`
- `dashboard_definitions`
- `report_exports`

## Implemented Frontend Foundation

- React + TypeScript + Vite skeleton.
- React Router route structure.
- TanStack Query provider.
- Zustand workspace store.
- Tailwind CSS tokens and base styling.
- Basic app shell and navigation.
- Dataset workspace page with project dataset list, schema, and paged preview.
- Data source center focused on local CSV/Excel intake, upload outcomes, failed-parse traceability, preview recovery, and formal dataset bridge links.
- Data source center now supports direct file selection and drag-and-drop, local format validation, selected-file metadata, one-step preview creation, upload-history status filters and search, and responsive mobile-first workflow ordering.
- Import wizard page for CSV/Excel preview and dataset creation.
- Import wizard upload status and failure recovery hints.
- Import wizard upload history panel with parsed/failed file records and task trace links.
- Import wizard can reopen saved parsed previews from upload history and continue dataset creation.
- Dataset workspace quality overview for materialized datasets.
- Cleaning workbench page for visual recipe preview, save, and execution.
- SQL workspace page for project-scoped query execution and data view saving.
- Chart configuration page with real Data View fields and ECharts rendering.
- Dashboard/report source page with dashboard, free-layout report, and data-screen modes.
- Report workbench with persisted chart ordering and sizing, global filters, active chart selections, chart cross-filtering, and Aurora/Warm/Focus themes.
- Version-aware report updates with conflict feedback and backward-compatible recovery of earlier dashboard layouts.
- CSV/XLSX/PDF export actions plus durable export history and artifact re-download.
- Task center page with project filtering, status summary, workflow coverage, and recent task table.
- Task center retry entry controlled by backend retry eligibility, with immediate list refresh and completion feedback.
- Task center related-resource links for datasets, data views, charts, and dashboards, with target pages reading route query parameters for selection/highlighting.
- External database UI is intentionally paused for the current local-file-first scope; the previously implemented backend connector APIs remain available for future work.
- Tailwind design tokens now include the Workshop Toolkit-inspired sky, lilac, rose, and mint palette for gradual frontend visual-system adoption.
- Placeholder pages remain only for features not yet implemented beyond the current data intake, dataset, cleaning, SQL, chart, dashboard, and task surfaces.
- Workspace home page now acts as a demo entry screen linking into the main implemented workflow surfaces.
- Analysis workbench for dataset selection, global filtering, metric aggregation, dimension breakdown, descriptive statistics, correlation matrix, linear regression visualization, and CSV/Excel export.
- Reusable analysis toolbar for saving, route-based reopening, rerunning, and materializing active results, with direct promotion into chart and dashboard/report builders.
- Authentication gate, dedicated login page, signed-session API access, real current-user display, and logout handling.
- Governance center with resource vault, archive/restore confirmations, focused dependency view, searchable operation trail, and owner-facing member administration.
- Mobile app-shell navigation uses a compact, horizontally scrollable bottom rail below 560px so work surfaces retain full viewport width.
- Frontend API client tests.

## Implemented Docker Foundation

- Docker Compose development stack.
- PostgreSQL service.
- Redis service.
- Backend service.
- Frontend service.
- Backend and frontend Dockerfiles.
- `.env.example` for local configuration.
- Release validation script covering configuration, migration, health, seed, and workflow checks.
- Compose-aware database plus retained-file backup and restore scripts with a manifest and explicit recovery steps.

## Verified So Far

- Docker services can build and start successfully.
- Frontend is reachable at `http://127.0.0.1:5173`.
- Backend health check is reachable at `http://127.0.0.1:8000/api/health`.
- Alembic migration has been applied to Docker PostgreSQL.
- Login, project creation, member/permission creation, CSV/Excel preview upload, formal dataset creation, cleaning execution, SQL data view saving, chart/dashboard saving, task center listing, failure task recording, retry request flow, related-resource navigation, external PostgreSQL/MySQL connection create/list/test flows, schema discovery, external preview, field-edited import, external table import retry, external import history/detail, external table import, and external read-only SQL import were verified through tests or API flows.
- Backend test suite passed in the Compose backend: 79 tests.
- Frontend test suite passed: 43 tests across 15 files.
- Frontend lint passed.
- Frontend build passed, with only the existing ECharts chunk-size warning.
- Demo seed has been executed successfully through Docker Compose.
- Frontend demo pages were checked through a headless Edge/Playwright pass against the running Docker stack: home, datasets, charts, dashboards, and tasks loaded expected demo content, and the chart page rendered an ECharts canvas.
- The local Data Sources page was re-verified in the in-app browser at the default desktop viewport and at a 390 × 844 mobile viewport: file selection state, clear/reset behavior, upload-history search feedback, responsive workflow ordering, page width, and console health all passed.
- Phase 3 was verified in the in-app browser against Docker PostgreSQL: save, route-based reopen, rerun, data-view materialization, chart/dashboard promotion, desktop rendering, mobile width containment, and console health all passed.
- Phase 4 was verified in the in-app browser at desktop and 390 x 844 mobile widths: saved report recovery, layout editing, themes, global filtering, active chart selections, cross-filtering, export history refresh, responsive containment, and console health all passed.
- Phase 4 CSV, XLSX, and PDF artifacts were generated from the seeded workflow and inspected: CSV aggregates were correct, the XLSX workbook contained five readable worksheets, and the two-page A4 PDF rendered successfully.
- Phase 5 governance was verified in the in-app browser at desktop and 390 x 844 mobile widths: archive confirmation, restoration, four-level source lineage, archive/restore operation records, member administration, responsive containment, bottom navigation, and console health all passed.
- A combined Phase 5 backup was generated and restored into an isolated PostgreSQL database; the restored project count was `1` and the migration head was `20260727_0010` before the temporary recovery database was removed.

## Current Limitations

- Uploaded file bytes are saved in durable local storage, with metadata in PostgreSQL.
- HTTP uploads are copied from FastAPI's spooled upload stream to durable storage in bounded chunks.
- Uploads are staged before parsing, so failed parse attempts can be traced to an uploaded file record.
- Upload/import history is queryable by project and shows uploaded-file status, parse errors, and linked preview metadata when parsing succeeds.
- Import preview stores sample rows for confirmation before formal dataset creation.
- Import preview scans the complete source for an exact guarded row count while retaining only configured inference and preview samples in application memory.
- Parsed upload history records can restore their saved preview metadata without re-uploading the source file.
- Data Sources now acts as the main local file intake overview and links into import previews, task traces, and formal datasets.
- Formal dataset creation creates and populates a physical table.
- Local-file formal datasets are populated in configurable batches inside one rollback boundary; source row-count changes abort the dataset rather than committing inconsistent metadata.
- Dataset names are unique within a project to avoid accidental overwrite-like workflows.
- Dataset quality profiling is computed on demand from materialized rows and is not yet cached or task-backed.
- Operation logs and lineage records are exposed through a focused four-level governance view; a full free-form lineage graph remains a later-stage capability.
- Task center records synchronous workflow actions as completed or failed/retryable tasks.
- Retry execution is synchronous inside the API request for selected safe operations; it is not yet backed by Redis/Celery/RQ or a distributed worker.
- File preview parse failures are recorded against staged uploaded files; user-correctable validation failures remain non-retryable, while unexpected parse failures can keep retry metadata.
- Authentication now uses password hashing and time-limited signed sessions, but SSO, MFA, password-reset delivery, session revocation lists, and enterprise identity integration remain future work.
- External database imports currently preview and materialize bounded snapshots through row limits; scheduled sync, incremental sync, and streaming/large-table import are not implemented yet.
- External table/SQL import retry is synchronous inside the API request and replays the read/import operation, but it is not yet backed by a distributed worker.
- External connection passwords use application-level encrypted storage, but production deployments still need protected key distribution, backup, and rotation procedures or a managed secret store.
- External connection testing validates basic connectivity through the configured adapter and product-level read-only policy, but it does not yet prove the external database user lacks write privileges.
- External custom SQL import uses the shared read-only SQL validator, but it is still not a full SQL firewall or database privilege audit.
- If frontend dependencies change while using Docker Compose, the named `frontend_node_modules` volume may need `docker compose exec frontend npm install` or a volume reset to refresh installed packages.
- API data sources are still reserved for later milestones.
- Scheduled sync and distributed worker execution are not implemented yet.
- The interactive analysis service currently accepts datasets up to 250,000 rows per request and runs in the application process; larger workloads should move behind the task boundary in a later milestone.
- Saved analysis definitions remain immutable create/read assets for configuration changes, but they now support recoverable archive and restore through governance.
- Recoverable archive currently covers six core analytical resource types; source-file retention and formal dataset tables remain intentionally protected from silent hard deletion.
- Report exports execute synchronously inside the API request while also recording task state; a future worker boundary is still needed for genuinely long-running exports.
- Report exports are bounded by the configured per-chart row limit so very large report jobs cannot exhaust the application process.

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

The active phased plan is maintained in `docs/NEXT_PHASE_PLAN.md`. Phases 1 through 5 are delivered and the first-stage local analysis workflow now includes durable intake, reusable processing, reporting/export, recoverable governance, and release operations.

The next roadmap should be approved before implementation. The strongest candidate is reliability at scale: move long imports, analysis, and report exports behind a real worker boundary while preserving the existing task, retry, audit, and lineage contracts.
