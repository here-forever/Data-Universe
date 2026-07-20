# Project Memory: Integrated Data Analysis System

Last updated: 2026-07-16

## 1. Project Positioning

The project will follow this route:

> Build a professional, usable, and extensible data analysis workspace first, then gradually evolve it into an enterprise-grade data platform.

The system should serve ordinary users, advanced users, and data analysts. It should not be limited to a simple report generator, and it should not start as an overcomplicated enterprise SaaS system.

The first stage should be a lightweight multi-user web data analysis platform with project collaboration, local development friendliness, and Docker Compose deployability.

## 2. Main Product Direction

The system should provide an integrated data workflow:

```text
File / external database / future API
  -> data source
  -> import or sync task
  -> dataset
  -> cleaning recipe / SQL query
  -> data view
  -> chart
  -> dashboard / report / export
```

All future features should connect to this main workflow unless there is a strong reason not to.

## 3. Confirmed First-Stage Route

### System Type

- Lightweight multi-user web data analysis platform.
- Project collaboration version first.
- Later upgrade path toward enterprise data platform.

### User Model

The system should support multiple user levels:

- Platform administrator.
- Project owner.
- Project editor/member.
- Read-only project member.

The first stage should use project-level roles plus resource-level permissions.

### Target Users

- Ordinary users: need visual workflows and clear guidance.
- Advanced users: need configurable rules, SQL, data views, and dashboards.
- Data analysts: need reusable views, multi-dataset queries, cleaning recipes, and report flexibility.

## 4. Data Operation Model

Data operation should have three layers:

### Layer 1: Basic Visual Operations

- File import.
- Field recognition.
- Filtering.
- Sorting.
- Grouping.
- Aggregation.
- Missing-value handling.
- Deduplication.
- Field renaming.
- Type conversion.
- Simple calculated fields.
- Data preview and summary statistics.

### Layer 2: Enhanced Visual Processing

- Multi-condition filters.
- Field splitting and merging.
- Conditional fields.
- Grouped aggregation.
- Pivot-style analysis.
- Multi-table joins.
- Row/column transformations.
- Regex extraction.
- Outlier detection.
- Batch cleaning rules.
- Saveable cleaning recipes.

### Layer 3: SQL Query Analysis

- Project-scoped SQL workspace.
- Multi-dataset query support.
- Join, filter, aggregation, sorting.
- Query history.
- Saved SQL queries.
- Save SQL results as reusable data views.
- SQL results can feed charts and dashboards.

SQL must be controlled and safe in the first stage: allow read-only query workflows only.

## 5. Data Storage Direction

Use the combined approach:

- Keep original source files for traceability and reprocessing.
- Parse confirmed data into PostgreSQL for query, cleaning, analysis, and reporting.
- Use temporary preview structures before formal dataset creation.
- Formal datasets should be real database tables.

The selected model is:

```text
Uploaded file
  -> original file storage
  -> temporary parsing/preview area
  -> field preview and type confirmation
  -> formal dataset table
  -> cleaning / SQL / data view / report flow
```

This avoids polluting the database before users confirm field settings, while keeping formal analysis data performant and SQL-friendly.

## 6. Data Source Strategy

First stage:

- CSV import.
- Excel import.
- External PostgreSQL read-only connection.
- External MySQL read-only connection.
- External table import.
- Custom read-only SQL import from external databases.

Reserved for later:

- API data sources.
- Scheduled sync.
- Incremental sync.
- More database types such as SQL Server, Oracle, ClickHouse.

External database connections should primarily import data into the system's PostgreSQL database. Real-time external querying can be reserved or limited because it introduces more permission, performance, and reliability complexity.

## 7. Cleaning Workflow

First stage: saveable cleaning recipes.

The workflow should be:

```text
Source dataset
  -> cleaning recipe
  -> multiple cleaning steps
  -> preview result
  -> execute
  -> derived dataset or data view
```

Cleaning recipes should support:

- Rename fields.
- Convert field types.
- Fill missing values.
- Delete null rows.
- Remove duplicate rows.
- Split fields.
- Merge fields.
- Create conditional fields.
- Regex extraction.
- String cleaning.
- Numeric processing.
- Date formatting and date part extraction.
- Grouped aggregation.
- Multi-table join.

The internal model should treat each cleaning step as a future workflow node so that later flowchart-style orchestration can reuse the same concept.

## 8. SQL and Data View Strategy

SQL functionality should support:

- Project-scoped multi-dataset queries.
- Read-only SQL.
- Query validation.
- Timeout and row-count limits.
- Query history.
- Saved queries.
- Save query results as data views.

Data views are key reusable assets. A data view may come from:

- Original/formal dataset.
- Cleaning recipe output.
- SQL query output.

Charts, dashboards, and reports should prefer data views as stable data inputs.

## 9. Report and Dashboard Direction

First stage: configurable dashboards plus a basic low-code free-layout report mode.

Standard dashboard mode should support:

- Select data source or data view.
- Select chart type.
- Configure dimensions and metrics.
- Add metric cards, bar charts, line charts, pie charts, tables, and similar components.
- Layout adjustment.
- Global filters.
- Save, preview, and export.

Advanced design mode should support:

- Drag chart, text, table, filter, and container components.
- Adjust component size and position.
- Configure each component's data source.
- Basic component linkage reserved or partly implemented.
- Theme and style configuration.

Product principle:

> Ordinary users configure; advanced users compose.

## 10. Permissions

First stage:

- Project-level roles.
- Resource-level permissions.

Resource-level permissions should cover:

- Data source.
- Dataset.
- Data view.
- Cleaning recipe.
- SQL query.
- Chart.
- Dashboard/report.

Common operations:

- View.
- Edit.
- Delete.
- Export.
- Share.
- Execute.

Reserved for later:

- Field-level permissions.
- Row-level permissions.
- Data masking rules.

The data model should reserve space for sensitive field markers, masking strategies, and row filter policies.

## 11. Task Center

First stage product capability: full task center.

Technical implementation can be lightweight at first, but the product experience should show task visibility.

Task types:

- File upload and parsing.
- CSV/Excel import.
- External database table import.
- External database custom SQL import.
- Cleaning recipe execution.
- SQL query materialization into data view.
- Report export.
- Future API fetch.
- Future scheduled sync.

Task states:

```text
pending -> running -> success
                 -> failed -> retryable
```

The task center should show:

- Task name.
- Task type.
- Project.
- Initiator.
- Status.
- Progress.
- Start/end time.
- Duration.
- Error message.
- Retry entry.
- Related dataset/report entry.

Future technical upgrade path:

```text
FastAPI -> Redis -> Celery/RQ worker -> PostgreSQL task status -> WebSocket/SSE updates
```

## 12. Operation Logs and Data Lineage

First stage should include:

- Basic operation logs.
- Basic data lineage records.

Operation logs should record:

- Login/logout.
- Project creation.
- Member management.
- File upload.
- External connection creation.
- Dataset import.
- Cleaning execution.
- SQL execution.
- Data view creation.
- Chart creation.
- Dashboard modification.
- Report export.
- Resource deletion/archive.

Basic lineage should track:

```text
Original file / external database table
  -> dataset
  -> cleaning recipe / SQL query
  -> data view
  -> chart
  -> dashboard/report
```

This supports future questions such as:

- Where did this report data come from?
- Why did this metric change?
- Can this dataset be deleted?
- Which reports depend on this data view?
- Who ran this cleaning operation?

## 13. Backend Technical Direction

Use Python/FastAPI first because the core value of the system is data processing.

Recommended backend stack:

- FastAPI.
- PostgreSQL.
- SQLAlchemy.
- Alembic.
- Pydantic.
- Pandas.
- Polars.
- openpyxl.
- pyarrow when useful.
- Redis reserved for task/cache use.
- Celery or RQ reserved for later distributed tasks.

Architecture style:

- Modular monolith first.
- Clear module boundaries.
- Future service extraction possible.

Backend modules should include:

- Authentication and user module.
- Project and member module.
- Permission module.
- Data source module.
- File upload module.
- Dataset module.
- Import/parser module.
- Cleaning module.
- SQL query module.
- Data view module.
- Chart/report module.
- Task module.
- Operation log module.
- Data lineage module.

## 13.1 Engineering Structure Constraints

The project must keep a clear layered structure while it grows. New backend code should generally follow this direction:

```text
api route
  -> application service
  -> repository / infrastructure adapter
  -> SQLAlchemy model / external dependency
```

Rules:

- Routes should handle HTTP inputs, authentication dependencies, and response conversion only.
- Services should own business workflow decisions, validation, task/log/lineage hooks, and cross-module orchestration.
- Repositories should own persistence details and transaction boundaries where appropriate.
- Models should describe database structure, not product workflow.
- Shared low-level helpers should live under `core`, but domain behavior should stay inside domain modules.
- Frontend should keep app shell, shared UI/design primitives, API clients, stores, and feature pages separated.
- Do not put unrelated domain logic into a generic utility module just because it is reusable once.
- When a feature touches multiple modules, keep the main product flow visible in code and tests.

The project is allowed to be a modular monolith in the first stage, but it should avoid becoming a single tangled application layer.

## 13.2 Traceability and Data Durability Constraints

The system must be designed so that important data paths are traceable and user data is not easy to lose.

Rules:

- Keep original uploaded files in durable local storage or a future object storage adapter.
- Keep parsed metadata in PostgreSQL so imports can be inspected and resumed.
- Formal datasets should be backed by physical database tables, not only in-memory previews.
- Important actions should create operation log records once the related module exists.
- Data transformations should create lineage records from source resource to target resource.
- Do not silently overwrite source files, datasets, views, charts, or reports.
- Prefer archive/disable behavior for destructive product actions; hard deletion should be explicit and logged.
- Use stable resource IDs in logs and lineage so reports can be traced back to source data.
- Keep enough metadata to reprocess a dataset from its source file or external source when possible.
- Tests for import, dataset creation, cleaning, SQL materialization, and report generation should include traceability expectations as those modules mature.

This constraint should guide implementation order: durable source retention, dataset materialization, operation logs, and lineage hooks are foundation work, not optional polish.

## 14. Frontend Technical Direction

Use React + TypeScript.

Recommended frontend stack:

- Vite.
- React.
- TypeScript.
- React Router.
- TanStack Query.
- Zustand.
- TanStack Table or AG Grid.
- ECharts.
- Monaco Editor.
- dnd-kit or react-grid-layout.
- React Hook Form.
- Zod.
- Tailwind CSS plus custom design system.
- lucide-react.

Frontend style:

- Combine professional technology style with lightweight modern style.
- Use the Figma Community "Workshop Toolkit" (`https://www.figma.com/community/file/1052895535654165715`) as the main visual-mood reference, not as a page template or reusable asset library.
- Daily work areas should be clean and readable.
- Analysis/report pages can be more colorful and data-rich.
- Do not build a generic gray admin template.
- Do not make pages overly decorative at the expense of data readability.
- Use the Figma Make reference "Analytics Dashboard with Cross Filtering" as an information-architecture reference, not as a visual template to copy directly.
- Borrow its useful dashboard structure: clear page header, global filters, KPI/summary metric band, active selection feedback, multi-panel chart grid, full-width detail chart/table areas, and cross-filtering interactions between visuals.
- Avoid the reference's overly plain white/gray feeling. The product should use a softer, more artistic data-workbench style with gentle layered backgrounds, tasteful multi-color accents, warm/cool contrast, and color-coded analytical surfaces.
- Translate the Workshop Toolkit mood into airy sky blue, lilac, soft rose, mint, and warm neutral canvas layers, with clear white or lightly tinted work surfaces above them.
- Use friendly, confident page titles and occasional small sticker-like accents for workspace home, onboarding, empty states, and completion feedback. Keep those accents original to this project and away from dense data operations.
- Preserve compact professional density in tables, SQL editors, cleaning forms, task lists, and chart controls. The surrounding shell can feel playful, but the work surface must remain stable, legible, and efficient.
- Do not directly copy community-file artwork. Any future third-party visual asset must have a compatible license, documented source, and tracked attribution.
- The interface should feel friendly and creative while still being professional: soft canvas tones, restrained shadows, subtle borders, calm typography, and polished spacing.
- Do not make the system look like a hard-core dark cyber/tech dashboard, a generic SaaS admin template, or a single-hue BI clone.
- Keep data readability first: colorful surfaces must not reduce table legibility, chart contrast, form clarity, or dense workflow efficiency.
- Prefer reusable visual primitives for metrics, filters, panels, data tables, status chips, and chart containers so future SQL, chart, dashboard, and report pages share a coherent style.
- For dashboard/report pages, support cross-filtering and visible active selection states as a first-class interaction pattern.

Layout direction:

```text
Left project navigation
Top project/user/task status bar
Main workspace
Contextual right-side configuration panels where needed
```

## 15. Deployment and GitHub Direction

This is a personal development project that should later be published to the user's personal GitHub.

Development should support:

- Local frontend dev server.
- Local FastAPI backend.
- PostgreSQL/Redis via Docker when convenient.
- Local file storage.

Deployment/experience should support:

- Docker Compose.
- Frontend container.
- Backend container.
- PostgreSQL container.
- Redis container.
- MinIO or local volume reserved.
- Worker container reserved.

Repository should eventually include:

- `README.md`.
- `.env.example`.
- Development startup instructions.
- Docker Compose startup instructions.
- Database initialization/migration instructions.
- Example CSV/Excel data.
- Screenshots or demo notes.
- Basic test instructions.

Expected structure:

```text
data-analysis-system/
  frontend/
  backend/
  docker/
  docs/
  examples/
  scripts/
  docker-compose.yml
  README.md
  .env.example
```

## 16. Git Version Control Constraint

Future development must use Git version control.

Guidelines:

- Commit meaningful milestones.
- Keep commits focused.
- Avoid mixing unrelated refactors with feature work.
- Before large work, check `git status`.
- Do not overwrite or discard user changes without explicit approval.
- Prefer branches for significant features.
- Keep documentation updated when architecture decisions change.

Suggested early milestones:

1. Project documentation and initial architecture notes.
2. Backend scaffold.
3. Frontend scaffold.
4. Docker Compose development environment.
5. Authentication and project model.
6. File import pipeline.
7. Dataset and data view model.
8. Cleaning recipe MVP.
9. SQL workspace MVP.
10. Dashboard/report MVP.

## 17. First-Stage Must-Haves

- CSV/Excel import.
- External PostgreSQL/MySQL read-only import.
- Custom read-only SQL import.
- Original file retention.
- Parsed formal datasets in PostgreSQL.
- Temporary preview before formal dataset creation.
- Saveable cleaning recipes.
- SQL results saved as reusable data views.
- Configurable dashboards.
- Basic low-code free-layout report capability.
- Task center.
- Operation logs.
- Basic data lineage.
- Resource-level permissions.
- Local development mode.
- Docker Compose deployment mode.
- Git version control.

## 18. Explicit Later-Stage Items

Do not overbuild these in the first stage unless needed for architectural placeholders:

- API data sources.
- Scheduled sync.
- Incremental sync.
- Distributed task queue.
- Full visual workflow orchestration.
- Full data lineage graph.
- Field-level and row-level permissions.
- Enterprise tenant isolation.
- SaaS billing.
- Kubernetes/cloud-native deployment.

## 19. Next Recommended Step

The next theoretical design step should be a phased roadmap:

- MVP boundary.
- Phase 1 module list.
- Phase 1 page list.
- Database conceptual model.
- API boundary draft.
- Development milestone order.

Only after the user approves the roadmap should implementation begin.
