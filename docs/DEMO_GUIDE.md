# Demo Guide

Last updated: 2026-07-05

This guide explains how to run the current demo-ready MVP foundation.

The demo keeps the existing product route unchanged:

```text
local CSV file -> upload preview -> formal dataset -> cleaning recipe
  -> cleaned dataset -> analysis / SQL data view -> chart
  -> dashboard / report / data screen / export -> task trace
```

## What The Demo Creates

The seed script creates or reuses:

- Project: `prj_demo`
- Admin user: `admin@example.com` / `admin123`
- Uploaded file record from `examples/demo_sales_orders.csv`
- Formal dataset: `Demo Sales Orders`
- Cleaning recipe and derived dataset: `Demo Sales Orders Cleaned`
- SQL data view: `Demo Regional Revenue View`
- Two charts backed by the data view
- One dashboard layout backed by the charts
- Task records, operation logs, and lineage records created through existing services

The seed is idempotent. Running it again reuses existing demo resources instead of creating duplicates.

## Run With Docker Compose

From the repository root:

```powershell
docker compose up -d --build
docker compose exec backend python -m alembic upgrade head
docker compose exec backend python /demo/scripts/seed_demo.py
```

If the frontend container shows a Vite import error after dependencies were changed, refresh the Docker-managed frontend dependency volume with:

```powershell
docker compose exec frontend npm install
```

Then open:

```text
http://127.0.0.1:5173
```

Useful direct pages:

```text
http://127.0.0.1:5173/data-sources?project_id=prj_demo
http://127.0.0.1:5173/datasets?project_id=prj_demo
http://127.0.0.1:5173/cleaning?project_id=prj_demo
http://127.0.0.1:5173/analytics?project_id=prj_demo
http://127.0.0.1:5173/sql?project_id=prj_demo
http://127.0.0.1:5173/charts?project_id=prj_demo
http://127.0.0.1:5173/dashboards?project_id=prj_demo
http://127.0.0.1:5173/tasks?project_id=prj_demo
http://127.0.0.1:5173/governance?project_id=prj_demo
```

## Login And Auth Notes

The local frontend can use the development-only compatibility token:

```text
local-dev-token-usr_admin
```

The matching default backend user is:

```text
email: admin@example.com
password: admin123
```

Interactive login now issues an expiring signed session, passwords are stored as salted PBKDF2 hashes, and existing local plaintext password records upgrade after a successful login. The compatibility token is accepted only when `APP_ENV=development`.

## Expected Walkthrough

1. Open Data Sources to see file intake, upload history, and dataset bridge cards.
2. Open Datasets to inspect the formal PostgreSQL-backed dataset and quality overview.
3. Open Cleaning to see that the cleaned dataset is available as a derived dataset path.
4. Open Analytics to calculate grouped metrics, inspect descriptive statistics, review correlations, fit a linear model, and export CSV/Excel results.
5. Open SQL Workspace to query the seeded datasets or save another SQL result as a data view.
6. Open Charts to see ECharts rendering from `Demo Regional Revenue View`.
7. Open Dashboards to compose dashboard, free-report, or data-screen layouts.
8. Open Tasks to inspect the workflow trail for import, materialization, cleaning, SQL data view, chart, dashboard, and export actions.
9. Open Governance Center to inspect recoverable resources, trace a dashboard upstream to its source dataset, review operation logs, and manage project members.

## Verified Demo State

On the current development machine, the demo seed created:

- 2 datasets: original formal dataset plus cleaned derived dataset.
- 1 SQL-backed data view.
- 2 charts.
- 1 dashboard.
- 8 task records.
- 9 lineage records.

The frontend was checked through the running Docker Compose stack at `http://127.0.0.1:5173`.

## Current Demo Boundaries

- The demo is a usable MVP foundation, not a finished enterprise platform.
- Task execution is still synchronous inside API requests.
- External database foundations remain in the backend but are intentionally hidden from the current local-file-first product surface.
- API data sources, scheduled sync, distributed workers, and full lineage graph UI remain later-stage items.
