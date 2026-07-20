# Project Agent Instructions

This project is a personal-developed, GitHub-ready integrated data analysis system.

Before making future implementation decisions, read `docs/PROJECT_MEMORY.md`.

## Core Direction

Build a professional, usable, and extensible data analysis workspace first, then evolve it step by step into an enterprise-grade data platform.

The first stage should not become an overbuilt SaaS platform, and it should not be a simple demo-only file analysis tool.

## Development Constraints

- Use Git version control for future project development.
- Keep changes scoped and commit intentionally after meaningful milestones.
- Prefer a modular monolith in the first stage, with clear boundaries for future service extraction.
- Preserve the main data flow: data source -> dataset -> cleaning recipe or SQL -> data view -> chart -> dashboard/report.
- Prioritize local development experience and Docker Compose deployment.
- Avoid implementing enterprise-only features too early unless the architecture needs a placeholder for them.
- Keep backend and frontend structure clearly layered as the system grows.
- Preserve traceability for important data and user actions through durable source retention, operation logs, and lineage records.
- Avoid data-loss-prone behavior: do not silently overwrite or hard-delete important user resources; prefer recoverable states and explicit logged operations.
- Treat durable original file storage and formal dataset materialization as foundation capabilities for the first-stage product.

## Layering Rules

- Backend routes should stay thin and delegate workflow decisions to services.
- Backend services should coordinate validation, domain workflow, task/log/lineage hooks, and repositories.
- Backend repositories should isolate persistence details from service logic.
- SQLAlchemy models should represent database structure and avoid workflow behavior.
- Frontend app shell, API access, state stores, shared UI, and feature pages should remain separated.
- New features should connect to the main data flow instead of becoming isolated demos.

## Frontend Design Constraints

- Use the Figma Community reference "Workshop Toolkit" (`https://www.figma.com/community/file/1052895535654165715`) as the primary visual-mood reference. Treat it as inspiration for atmosphere, color, friendliness, and composition rather than a screen template or asset source.
- Use the Figma Make reference "Analytics Dashboard with Cross Filtering" as an information-architecture reference, not as a visual template to copy directly.
- Borrow its useful dashboard structure: page header, global filters, KPI metric band, active selection feedback, multi-panel chart grid, full-width detail areas, and cross-filtering interactions.
- Avoid a plain white/gray dashboard look. The UI should become a softer, more artistic, colorful data workbench with gentle layered backgrounds, tasteful multi-color accents, and warm/cool contrast.
- Build the palette around airy sky blue, lilac, soft rose, mint, and warm neutral surfaces. Use these colors as layered canvas zones, analytical accents, selection states, and restrained highlights rather than one dominant hue.
- Borrow the Workshop Toolkit's friendly visual rhythm: generous breathing room at page level, confident but approachable page titles, crisp content surfaces, and occasional small sticker-like or hand-crafted accents in home, onboarding, empty, and success states.
- Keep decorative accents away from dense tables, SQL editors, cleaning controls, forms, and charts. Work surfaces must remain compact, aligned, and predictable even when the surrounding canvas feels playful.
- Do not copy or redistribute community-file artwork directly. Recreate the design language with project-owned CSS, icons, and original visual assets, and preserve attribution/license notes for any future third-party asset that is intentionally added.
- Do not push the product into a hard-core cyber/tech style or a generic gray SaaS admin template.
- Keep data readability first: color, shadows, and decorative surfaces must not reduce table legibility, form clarity, or workflow efficiency.
- Build reusable visual primitives for metrics, filters, panels, tables, status chips, and chart/report containers so future analysis pages feel coherent.

## Confirmed Technical Direction

- Backend: Python, FastAPI, PostgreSQL, SQLAlchemy, Alembic, Pydantic.
- Data processing: Pandas and Polars.
- Frontend: React, TypeScript, Vite.
- Frontend state/data: TanStack Query, Zustand.
- Tables/charts/editors: TanStack Table or AG Grid, ECharts, Monaco Editor.
- Styling: Tailwind CSS plus a custom design system.
- Deployment: local development mode plus Docker Compose.

## First-Stage Product Scope

Must support:

- Project collaboration route with resource-level permissions.
- CSV and Excel import.
- External PostgreSQL/MySQL read-only connection.
- Table import and custom read-only SQL import from external databases.
- Original file retention plus parsed data stored in PostgreSQL.
- Temporary preview data before formal dataset creation.
- Formal datasets as real database tables.
- Visual data cleaning with saveable cleaning recipes.
- SQL workspace supporting project-scoped multi-dataset queries.
- Saved SQL results as reusable data views.
- Configurable dashboards plus basic low-code free-layout report capability.
- Task center with status, progress, errors, and retry entry.
- Basic operation logs and basic data lineage.

Reserved for later:

- API data sources.
- Scheduled sync.
- Distributed task queue such as Celery or RQ.
- Field-level and row-level permissions.
- Full visual data lineage graph.
- Full flowchart-style data cleaning orchestration.
- Multi-tenant SaaS architecture.
- Kubernetes/cloud-native deployment.
