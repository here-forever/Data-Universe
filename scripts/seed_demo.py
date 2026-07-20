from __future__ import annotations

# ruff: noqa: E402

import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if not (BACKEND_ROOT / "app").exists() and (Path("/app") / "app").exists():
    BACKEND_ROOT = Path("/app")
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.repository import AuthRepository
from app.auth.service import AuthService, User
from app.cleaning.repository import CleaningRepository
from app.cleaning.schemas import (
    CleaningExecuteRequest,
    CleaningRecipeCreateRequest,
    CleaningStepRequest,
)
from app.cleaning.service import CleaningService
from app.core.database import get_session_factory, import_models
from app.core.errors import AppError
from app.core.ids import new_id
from app.data_views.repository import DataViewRepository
from app.data_views.service import DataView, DataViewService, lineage_source_id
from app.datasets.repository import DatasetRepository
from app.datasets.schemas import DatasetCreateRequest
from app.datasets.service import Dataset, DatasetService
from app.imports.repository import ImportRepository
from app.imports.service import ImportService
from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel
from app.models.project import Project, ProjectMember
from app.models.task import Task as TaskModel
from app.projects.repository import ProjectRepository
from app.sql_workspace.schemas import SqlSaveDataViewRequest
from app.sql_workspace.service import SqlWorkspaceService
from app.tasks.repository import TaskRepository
from app.tasks.service import TaskService
from app.visualizations.repository import VisualizationRepository
from app.visualizations.schemas import ChartCreateRequest, DashboardCreateRequest
from app.visualizations.service import Chart, Dashboard, VisualizationService

PROJECT_ID = "prj_demo"
PROJECT_NAME = "Demo Analytics Workspace"
PROJECT_DESCRIPTION = (
    "Seeded demo project for the integrated data analysis MVP workflow."
)

DEMO_FILE_NAME = "demo_sales_orders.csv"
DATASET_NAME = "Demo Sales Orders"
CLEANING_RECIPE_NAME = "Demo Sales Cleanup Recipe"
CLEANED_DATASET_NAME = "Demo Sales Orders Cleaned"
DATA_VIEW_NAME = "Demo Regional Revenue View"
BAR_CHART_NAME = "Demo Regional Revenue Chart"
LINE_CHART_NAME = "Demo Channel Profit Chart"
DASHBOARD_NAME = "Demo Sales Performance Dashboard"

DEMO_URLS = {
    "workspace": "http://127.0.0.1:5173/",
    "data_sources": f"http://127.0.0.1:5173/data-sources?project_id={PROJECT_ID}",
    "datasets": f"http://127.0.0.1:5173/datasets?project_id={PROJECT_ID}",
    "cleaning": f"http://127.0.0.1:5173/cleaning?project_id={PROJECT_ID}",
    "sql": f"http://127.0.0.1:5173/sql?project_id={PROJECT_ID}",
    "charts": f"http://127.0.0.1:5173/charts?project_id={PROJECT_ID}",
    "dashboards": f"http://127.0.0.1:5173/dashboards?project_id={PROJECT_ID}",
    "tasks": f"http://127.0.0.1:5173/tasks?project_id={PROJECT_ID}",
}


@dataclass
class DemoServices:
    imports: ImportService
    datasets: DatasetService
    cleaning: CleaningService
    data_views: DataViewService
    sql_workspace: SqlWorkspaceService
    visualizations: VisualizationService


def main() -> None:
    import_models()
    session_factory = get_session_factory()
    with session_factory() as session:
        admin = ensure_admin(session)
        ensure_demo_project(session, admin)
        services = build_services(session, admin)

        dataset = ensure_demo_dataset(services)
        cleaned_dataset = ensure_cleaned_dataset(services, dataset)
        data_view = ensure_demo_data_view(services, cleaned_dataset)
        ensure_sql_data_view_trace(session, data_view)
        charts = ensure_demo_charts(services, data_view)
        dashboard = ensure_demo_dashboard(services, charts)

        print_summary(
            dataset_id=dataset.id,
            cleaned_dataset_id=cleaned_dataset.id,
            data_view_id=data_view.id,
            chart_ids=[chart.id for chart in charts],
            dashboard_id=dashboard.id,
        )


def ensure_admin(session: Session) -> User:
    return AuthService(AuthRepository(session)).get_or_create_default_admin()


def ensure_demo_project(session: Session, admin: User) -> None:
    projects = ProjectRepository(session)
    project = projects.get_project(PROJECT_ID)
    if project is None:
        project = Project(
            id=PROJECT_ID,
            name=PROJECT_NAME,
            description=PROJECT_DESCRIPTION,
            owner_id=admin.id,
        )
        owner_member = ProjectMember(
            id=new_id("pm"),
            project_id=PROJECT_ID,
            user_id=admin.id,
            role="owner",
        )
        projects.save_project(project, owner_member)
        print(f"Created project: {PROJECT_ID}")
        return

    if project.owner_id != admin.id:
        project.owner_id = admin.id
        session.add(project)
        session.commit()

    projects.upsert_member(
        ProjectMember(
            id=new_id("pm"),
            project_id=PROJECT_ID,
            user_id=admin.id,
            role="owner",
        )
    )
    print(f"Using existing project: {PROJECT_ID}")


def build_services(session: Session, admin: User) -> DemoServices:
    audit = AuditService(AuditRepository(session), actor_id=admin.id)
    tasks = TaskService(TaskRepository(session), initiator_id=admin.id)
    imports = ImportService(
        ImportRepository(session),
        uploader_id=admin.id,
        audit=audit,
        tasks=tasks,
    )
    datasets = DatasetService(
        DatasetRepository(session),
        imports=imports,
        audit=audit,
        tasks=tasks,
    )
    cleaning = CleaningService(
        CleaningRepository(session),
        datasets=datasets,
        audit=audit,
        tasks=tasks,
    )
    data_views = DataViewService(DataViewRepository(session), audit=audit)
    sql_workspace = SqlWorkspaceService(
        session=session,
        datasets=datasets,
        data_views=data_views,
        audit=audit,
        tasks=tasks,
    )
    visualizations = VisualizationService(
        repository=VisualizationRepository(session),
        data_views=data_views,
        audit=audit,
        tasks=tasks,
    )
    return DemoServices(
        imports=imports,
        datasets=datasets,
        cleaning=cleaning,
        data_views=data_views,
        sql_workspace=sql_workspace,
        visualizations=visualizations,
    )


def ensure_demo_dataset(services: DemoServices) -> Dataset:
    existing = find_dataset(services.datasets, DATASET_NAME)
    if existing is not None:
        print(f"Using existing dataset: {existing.id}")
        return existing

    csv_path = PROJECT_ROOT / "examples" / DEMO_FILE_NAME
    if not csv_path.exists():
        raise RuntimeError(f"Demo CSV not found: {csv_path}")

    preview = services.imports.create_file_preview(
        project_id=PROJECT_ID,
        file_name=DEMO_FILE_NAME,
        content=csv_path.read_bytes(),
    )
    dataset = services.datasets.create_dataset(
        DatasetCreateRequest(
            project_id=PROJECT_ID,
            preview_id=preview.id,
            name=DATASET_NAME,
            fields=preview.fields,
        )
    )
    print(f"Created dataset: {dataset.id}")
    return dataset


def ensure_cleaned_dataset(services: DemoServices, dataset: Dataset) -> Dataset:
    existing = find_dataset(services.datasets, CLEANED_DATASET_NAME)
    if existing is not None:
        print(f"Using existing cleaned dataset: {existing.id}")
        return existing

    recipe = services.cleaning.create_recipe(
        CleaningRecipeCreateRequest(
            project_id=PROJECT_ID,
            source_dataset_id=dataset.id,
            name=CLEANING_RECIPE_NAME,
            description="Demo recipe: remove duplicated order IDs and normalize empty regions.",
            steps=[
                CleaningStepRequest(
                    operation="fill_null",
                    order=0,
                    config={"field": "region", "value": "Unknown"},
                ),
                CleaningStepRequest(
                    operation="deduplicate",
                    order=1,
                    config={"fields": ["order_id"]},
                ),
            ],
        )
    )
    execution = services.cleaning.execute_recipe(
        recipe_id=recipe.id,
        payload=CleaningExecuteRequest(output_name=CLEANED_DATASET_NAME),
    )
    cleaned_dataset = services.datasets.get_dataset(execution.derived_dataset_id)
    print(f"Created cleaned dataset: {cleaned_dataset.id}")
    return cleaned_dataset


def ensure_demo_data_view(services: DemoServices, dataset: Dataset):
    existing = find_data_view(services.data_views, DATA_VIEW_NAME)
    if existing is not None:
        print(f"Using existing data view: {existing.id}")
        return existing

    sql = build_regional_revenue_sql(dataset.id)
    data_view = services.sql_workspace.save_as_data_view(
        SqlSaveDataViewRequest(
            project_id=PROJECT_ID,
            name=DATA_VIEW_NAME,
            description="Revenue, profit, discount, and quantity grouped by region.",
            sql=sql,
            limit=100,
        )
    )
    print(f"Created data view: {data_view.id}")
    return data_view


def ensure_sql_data_view_trace(session: Session, data_view: DataView) -> None:
    ensure_sql_data_view_operation_log(session, data_view)
    ensure_sql_data_view_lineage(session, data_view)
    ensure_sql_data_view_task(session, data_view.id)


def ensure_sql_data_view_operation_log(session: Session, data_view: DataView) -> None:
    operation_log = session.scalar(
        select(OperationLogModel).where(
            OperationLogModel.project_id == PROJECT_ID,
            OperationLogModel.action == "sql.data_view_saved",
            OperationLogModel.resource_id == data_view.id,
        )
    )
    if operation_log is not None:
        return

    AuditService(AuditRepository(session), actor_id="usr_admin").record_operation(
        action="sql.data_view_saved",
        project_id=PROJECT_ID,
        resource_type="data_view",
        resource_id=data_view.id,
        detail={
            "sql": data_view.source_sql,
            "row_count": data_view.row_count,
            "seed_repaired": True,
        },
    )
    print(f"Created missing SQL data view operation log for: {data_view.id}")


def ensure_sql_data_view_lineage(session: Session, data_view: DataView) -> None:
    lineage_edge = session.scalar(
        select(LineageEdgeModel).where(
            LineageEdgeModel.project_id == PROJECT_ID,
            LineageEdgeModel.source_type == "sql_query",
            LineageEdgeModel.target_type == "data_view",
            LineageEdgeModel.target_id == data_view.id,
        )
    )
    if lineage_edge is not None:
        return

    AuditService(AuditRepository(session), actor_id="usr_admin").record_lineage(
        project_id=PROJECT_ID,
        source_type="sql_query",
        source_id=lineage_source_id(data_view),
        target_type="data_view",
        target_id=data_view.id,
        transform_type="sql_query_materialization",
        transform_id=data_view.id,
    )
    print(f"Created missing SQL data view lineage for: {data_view.id}")


def ensure_sql_data_view_task(session: Session, data_view_id: str) -> None:
    task = session.scalar(
        select(TaskModel).where(
            TaskModel.project_id == PROJECT_ID,
            TaskModel.task_type == "sql_data_view_materialization",
            TaskModel.related_resource_id == data_view_id,
        )
    )
    if task is not None:
        return

    TaskService(TaskRepository(session), initiator_id="usr_admin").record_success(
        project_id=PROJECT_ID,
        name=f"Materialized SQL data view: {DATA_VIEW_NAME}",
        task_type="sql_data_view_materialization",
        related_resource_type="data_view",
        related_resource_id=data_view_id,
    )
    print(f"Created missing SQL data view task for: {data_view_id}")


def ensure_demo_charts(services: DemoServices, data_view) -> list[Chart]:
    rows = preview_data_view_rows(services, data_view.id)
    charts_by_name = {
        chart.name: chart
        for chart in services.visualizations.list_charts(PROJECT_ID)
        if chart.data_view_id == data_view.id
    }

    bar_chart = charts_by_name.get(BAR_CHART_NAME)
    if bar_chart is None:
        bar_chart = services.visualizations.create_chart(
            ChartCreateRequest(
                project_id=PROJECT_ID,
                data_view_id=data_view.id,
                name=BAR_CHART_NAME,
                chart_type="bar",
                config={
                    "dimension": "region",
                    "metric": "total_revenue",
                    "aggregation": "sum",
                    "data_view_name": data_view.name,
                    "preview_rows": rows,
                },
            )
        )
        print(f"Created chart: {bar_chart.id}")
    else:
        print(f"Using existing chart: {bar_chart.id}")

    line_chart = charts_by_name.get(LINE_CHART_NAME)
    if line_chart is None:
        line_chart = services.visualizations.create_chart(
            ChartCreateRequest(
                project_id=PROJECT_ID,
                data_view_id=data_view.id,
                name=LINE_CHART_NAME,
                chart_type="line",
                config={
                    "dimension": "region",
                    "metric": "total_profit",
                    "aggregation": "sum",
                    "data_view_name": data_view.name,
                    "preview_rows": rows,
                },
            )
        )
        print(f"Created chart: {line_chart.id}")
    else:
        print(f"Using existing chart: {line_chart.id}")

    return [bar_chart, line_chart]


def ensure_demo_dashboard(
    services: DemoServices,
    charts: list[Chart],
) -> Dashboard:
    existing = find_dashboard(services.visualizations, DASHBOARD_NAME)
    if existing is not None:
        print(f"Using existing dashboard: {existing.id}")
        return existing

    dashboard = services.visualizations.create_dashboard(
        DashboardCreateRequest(
            project_id=PROJECT_ID,
            name=DASHBOARD_NAME,
            layout={
                "mode": "dashboard",
                "items": [
                    {"chart_id": charts[0].id, "x": 0, "y": 0, "w": 6, "h": 4},
                    {"chart_id": charts[1].id, "x": 6, "y": 0, "w": 6, "h": 4},
                ],
                "global_filters": [
                    {"field": "region", "type": "multi_select"},
                    {"field": "order_count", "type": "range"},
                ],
            },
        )
    )
    print(f"Created dashboard: {dashboard.id}")
    return dashboard


def build_regional_revenue_sql(dataset_id: str) -> str:
    return f"""
SELECT
  region,
  COUNT(*) AS order_count,
  SUM(revenue) AS total_revenue,
  SUM(profit) AS total_profit,
  ROUND(AVG(discount)::numeric, 4)::float AS avg_discount,
  SUM(quantity) AS total_quantity
FROM {dataset_id}
GROUP BY region
ORDER BY total_revenue DESC
""".strip()


def preview_data_view_rows(
    services: DemoServices,
    data_view_id: str,
) -> list[dict[str, str | int | float | bool | None]]:
    _data_view, rows = services.data_views.preview_data_view_rows(
        data_view_id=data_view_id,
        page=1,
        page_size=200,
    )
    return [
        {
            key: value
            for key, value in row.items()
            if key != "_das_row_id" and is_chart_json_value(value)
        }
        for row in rows
    ]


def is_chart_json_value(value: Any) -> bool:
    return value is None or isinstance(value, str | int | float | bool)


def find_dataset(datasets: DatasetService, name: str) -> Dataset | None:
    return next(
        (dataset for dataset in datasets.list_datasets(PROJECT_ID) if dataset.name == name),
        None,
    )


def find_data_view(data_views: DataViewService, name: str):
    return next(
        (data_view for data_view in data_views.list_data_views(PROJECT_ID) if data_view.name == name),
        None,
    )


def find_dashboard(visualizations: VisualizationService, name: str) -> Dashboard | None:
    return next(
        (
            dashboard
            for dashboard in visualizations.list_dashboards(PROJECT_ID)
            if dashboard.name == name
        ),
        None,
    )


def print_summary(
    *,
    dataset_id: str,
    cleaned_dataset_id: str,
    data_view_id: str,
    chart_ids: list[str],
    dashboard_id: str,
) -> None:
    print()
    print("Demo seed complete.")
    print(f"Project:         {PROJECT_ID}")
    print(f"Dataset:         {dataset_id}")
    print(f"Cleaned dataset: {cleaned_dataset_id}")
    print(f"Data view:       {data_view_id}")
    print(f"Charts:          {', '.join(chart_ids)}")
    print(f"Dashboard:       {dashboard_id}")
    print()
    print("Open these URLs after Docker Compose is running:")
    for label, url in DEMO_URLS.items():
        print(f"- {label}: {url}")


if __name__ == "__main__":
    try:
        main()
    except AppError as error:
        print(f"Seed failed: {error.message} ({error.code})", file=sys.stderr)
        raise SystemExit(1) from error
