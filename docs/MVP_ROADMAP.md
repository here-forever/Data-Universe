# MVP Roadmap

Last updated: 2026-07-04

## 1. MVP Goal

The MVP should build a professional, usable, and extensible data analysis workspace. It must validate the main product loop without overbuilding enterprise-only features too early.

Core MVP flow:

```text
login/project -> data source -> file import -> dataset -> cleaning recipe or SQL -> data view -> chart -> dashboard
```

The MVP is not intended to finish every advanced capability. It should make every core module usable enough to prove the system direction.

## 2. MVP Boundary

### Must Build

- User login and basic project collaboration.
- CSV and Excel import.
- Data preview, field recognition, and confirmed formal dataset creation.
- Basic saveable cleaning recipes.
- SQL workspace with read-only project-scoped queries.
- Save SQL query results as reusable data views.
- Basic chart configuration.
- Basic configurable dashboard.
- Basic task center.
- Basic operation logs and data lineage.
- Docker Compose and local development modes.
- Git milestone-based version control.

### Defer Beyond MVP

- API data sources.
- Scheduled sync.
- Complete low-code report designer.
- Full flowchart-style cleaning orchestration.
- Field-level and row-level permissions.
- Enterprise tenant isolation.
- Kubernetes deployment.

## 3. MVP Module Breakdown

| Module | MVP Responsibility |
| --- | --- |
| Authentication | Login, initial admin/user setup, JWT authentication. |
| Users and Projects | Project creation, project list, project members, project roles. |
| Permissions | Project-level roles and basic resource-level permissions. |
| Data Sources | File data sources first; reserve database/API source structure. |
| File Import | CSV/Excel upload, parsing, preview, and validation. |
| Datasets | Dataset metadata, physical table mapping, fields, preview. |
| Task Center | Import, cleaning, SQL materialization task status and errors. |
| Cleaning | Save cleaning recipes and execute basic cleaning steps. |
| SQL Workspace | Project-scoped read-only SQL, execution history, saved queries. |
| Data Views | Reusable results from datasets, cleaning recipes, or SQL queries. |
| Charts | Chart configuration based on data views. |
| Dashboards | Multi-chart dashboard layout, save, and view. |
| Logs and Lineage | Key operation logs and basic source-to-output lineage records. |

## 4. MVP Page Breakdown

| Page | Purpose |
| --- | --- |
| Login | User authentication. |
| Project List | View and create projects. |
| Project Workspace Home | Project overview, recent datasets, recent tasks. |
| Data Sources | File import entry; later database/API source entries. |
| Data Import Wizard | Upload file, preview data, confirm fields, submit import. |
| Dataset List | View project datasets. |
| Dataset Detail | Field structure, data preview, source information, lineage entry. |
| Cleaning Workspace | Configure steps, preview result, save recipe, execute recipe. |
| SQL Workspace | Write SQL, execute query, save query, generate data view. |
| Data View List/Detail | Manage reusable analysis outputs. |
| Chart Builder | Select data view, dimensions, metrics, and chart type. |
| Dashboard | Add charts, adjust layout, save and view dashboard. |
| Task Center | View task status, failures, progress, and retry entry. |
| Project Members | Manage members and project roles. |
| Operation Logs | View key project operation records. |

## 5. Conceptual Database Tables

| Table | Purpose |
| --- | --- |
| `users` | User accounts. |
| `projects` | Project workspaces. |
| `project_members` | Project membership and project roles. |
| `resource_permissions` | Resource-level authorization records. |
| `data_sources` | Unified data source records for files, databases, and future APIs. |
| `uploaded_files` | Original uploaded file metadata. |
| `tasks` | General task center records. |
| `import_tasks` | Import-specific task details. |
| `datasets` | Formal dataset metadata. |
| `dataset_fields` | Dataset field names, types, order, and sensitivity markers. |
| `dataset_table_maps` | Dataset-to-physical-table mapping. |
| `cleaning_recipes` | Saved cleaning plans. |
| `cleaning_steps` | Ordered cleaning step configuration. |
| `sql_queries` | Saved SQL queries and execution metadata. |
| `data_views` | Reusable analysis views generated from datasets, cleaning, or SQL. |
| `charts` | Chart configuration. |
| `dashboards` | Dashboard metadata and settings. |
| `dashboard_widgets` | Dashboard widget layout and component configuration. |
| `operation_logs` | User operation audit records. |
| `lineage_edges` | Basic data lineage links between sources, datasets, views, charts, and dashboards. |

Formal dataset physical table naming convention:

```text
ds_<project_id>_<dataset_id>
```

Materialized data view physical table naming convention:

```text
dv_<project_id>_<view_id>
```

## 6. Development Order

### Milestone 1: Project Infrastructure

Create the base repository structure:

```text
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

The goal is to make the repository understandable before feature work begins.

### Milestone 2: Backend Skeleton

Build the FastAPI foundation:

- App entrypoint.
- Configuration management.
- Database connection.
- SQLAlchemy base setup.
- Alembic setup.
- Unified error handling.
- Structured logging.
- Health check endpoint.

### Milestone 3: Frontend Skeleton

Build the React foundation:

- Vite + React + TypeScript.
- React Router.
- TanStack Query setup.
- Zustand setup.
- Base app layout.
- Tailwind CSS and design token foundation.
- API client wrapper.

### Milestone 4: Docker Compose Development Environment

Add Docker Compose support for:

- PostgreSQL.
- Redis.
- Backend container.
- Frontend container.
- Local storage volume.
- Reserved worker service placeholder.

### Milestone 5: Authentication, Projects, and Permissions

Implement:

- Login.
- Current user endpoint.
- Project creation and listing.
- Project members.
- Project roles.
- Basic resource permission model.

### Milestone 6: File Import Pipeline

Implement:

- CSV upload.
- Excel upload.
- Original file metadata storage.
- File parsing.
- Data preview.
- Field type inference.
- Field confirmation.
- Formal dataset table creation.
- Dataset metadata creation.

### Milestone 7: Dataset Management

Implement:

- Dataset list.
- Dataset detail.
- Field list.
- Data preview.
- Physical table mapping.
- Source metadata.
- Basic lineage from uploaded file to dataset.

### Milestone 8: Task Center MVP

Implement:

- Generic task records.
- Task status changes.
- Task progress.
- Error messages.
- Retry entry design.
- Task center page.

### Milestone 9: Cleaning Recipe MVP

Implement saveable cleaning recipes with these first operations:

- Rename field.
- Convert field type.
- Fill missing values.
- Remove null rows.
- Remove duplicate rows.
- Split field.
- Merge fields.

Cleaning execution should produce a derived dataset or data view.

### Milestone 10: SQL Workspace and Data Views

Implement:

- Project-scoped SQL editor.
- Dataset/data view explorer.
- Read-only SQL validation.
- Query execution with row and timeout limits.
- Query result preview.
- Saved SQL query.
- Save query result as data view.

### Milestone 11: Chart and Dashboard MVP

Implement:

- Data view selection.
- Basic chart types: table, metric card, bar chart, line chart, pie chart.
- Chart configuration persistence.
- Dashboard creation.
- Add chart to dashboard.
- Dashboard widget layout persistence.

### Milestone 12: Operation Logs and Basic Lineage

Implement operation records for:

- Login.
- Project creation.
- File upload.
- Dataset import.
- Cleaning execution.
- SQL execution.
- Data view creation.
- Chart creation.
- Dashboard modification.

Implement lineage records for:

```text
file/database source -> dataset -> cleaning/SQL -> data view -> chart -> dashboard
```

### Milestone 13: External Database Import Basic Version

Implement:

- PostgreSQL read-only connection.
- MySQL read-only connection.
- Connection test.
- Schema/table/field browsing.
- Select-table import.
- Custom read-only SQL import.
- Import to internal PostgreSQL dataset.

### Milestone 14: GitHub Readiness

Add or polish:

- README.
- `.env.example`.
- Development startup guide.
- Docker Compose startup guide.
- Database migration guide.
- Example CSV/Excel files.
- Screenshots or demo notes.
- Basic testing instructions.

## 7. Suggested Git Milestones

Recommended commit sequence:

```text
docs: add mvp roadmap
chore: scaffold backend and frontend
chore: add docker compose dev environment
feat: add auth and project workspace
feat: add file import pipeline
feat: add dataset management
feat: add task center
feat: add cleaning recipe mvp
feat: add sql workspace and data views
feat: add dashboard mvp
feat: add external database import mvp
docs: polish github usage guide
```

## 8. MVP Acceptance Criteria

The MVP is acceptable when a user can:

1. Log in and enter a project.
2. Upload a CSV or Excel file.
3. Preview data and confirm fields.
4. Create a formal dataset.
5. Open the dataset and inspect fields and rows.
6. Create and execute a cleaning recipe.
7. Save the cleaned result as a data view.
8. Write a project-scoped read-only SQL query.
9. Save SQL results as another data view.
10. Build a chart from a data view.
11. Add charts to a dashboard.
12. See task status in the task center.
13. See basic operation logs and lineage records.
14. Run the project locally.
15. Start the project with Docker Compose.

## 9. Implementation Rule

Do not begin implementation until the roadmap and first implementation plan are approved. Each major milestone should be developed with focused Git commits and verified before moving to the next milestone.
