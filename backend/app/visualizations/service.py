from dataclasses import dataclass
from typing import Any

from app.audit.service import AuditService
from app.core.errors import AppError
from app.core.ids import new_id
from app.data_views.service import DataViewService
from app.models.data_view import ChartDefinition as ChartDefinitionModel
from app.models.data_view import DashboardDefinition as DashboardDefinitionModel
from app.tasks.service import TaskService
from app.visualizations.repository import VisualizationRepository
from app.visualizations.schemas import (
    ChartCreateRequest,
    ChartResponse,
    DashboardCreateRequest,
    DashboardResponse,
)


@dataclass(frozen=True)
class Chart:
    id: str
    project_id: str
    data_view_id: str
    name: str
    chart_type: str
    config: dict[str, Any]


@dataclass(frozen=True)
class Dashboard:
    id: str
    project_id: str
    name: str
    layout: dict[str, Any]


class VisualizationService:
    def __init__(
        self,
        *,
        repository: VisualizationRepository | None = None,
        data_views: DataViewService | None = None,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
    ) -> None:
        self.repository = repository
        self.data_views = data_views
        self.audit = audit
        self.tasks = tasks
        self._charts: dict[str, Chart] = {}
        self._dashboards: dict[str, Dashboard] = {}

    def reset(self) -> None:
        self._charts = {}
        self._dashboards = {}

    def create_chart(self, payload: ChartCreateRequest) -> Chart:
        try:
            return self._create_chart(payload)
        except Exception as error:
            self._record_visualization_failure(
                project_id=payload.project_id,
                name=f"Save chart failed: {payload.name}",
                task_type="chart_save",
                error=error,
                related_resource_type="data_view",
                related_resource_id=payload.data_view_id,
                retry_payload={
                    "operation": "chart_save",
                    "project_id": payload.project_id,
                    "data_view_id": payload.data_view_id,
                    "name": payload.name,
                    "chart_type": payload.chart_type,
                    "config": payload.config,
                },
            )
            raise

    def _create_chart(self, payload: ChartCreateRequest) -> Chart:
        self._validate_data_view_scope(
            project_id=payload.project_id,
            data_view_id=payload.data_view_id,
        )
        chart_id = new_id("chart")
        if self.repository is None:
            chart_id = f"chart_{len(self._charts) + 1}"

        chart = Chart(
            id=chart_id,
            project_id=payload.project_id,
            data_view_id=payload.data_view_id,
            name=payload.name,
            chart_type=payload.chart_type,
            config=payload.config,
        )

        if self.repository is not None:
            chart = model_to_chart(
                self.repository.save_chart(
                    ChartDefinitionModel(
                        id=chart.id,
                        project_id=chart.project_id,
                        data_view_id=chart.data_view_id,
                        name=chart.name,
                        chart_type=chart.chart_type,
                        config=chart.config,
                    )
                )
            )
        else:
            self._charts[chart.id] = chart

        self._record_chart_audit(chart)
        self._record_chart_task(chart)
        return chart

    def list_charts(self, project_id: str) -> list[Chart]:
        if self.repository is not None:
            return [model_to_chart(chart) for chart in self.repository.list_charts(project_id)]

        return [chart for chart in self._charts.values() if chart.project_id == project_id]

    def get_chart(self, chart_id: str) -> Chart:
        if self.repository is not None:
            chart = self.repository.get_chart(chart_id)
            if chart is None:
                raise AppError("Chart not found", "chart_not_found", 404)
            return model_to_chart(chart)

        chart = self._charts.get(chart_id)
        if chart is None:
            raise AppError("Chart not found", "chart_not_found", 404)
        return chart

    def create_dashboard(self, payload: DashboardCreateRequest) -> Dashboard:
        try:
            return self._create_dashboard(payload)
        except Exception as error:
            self._record_visualization_failure(
                project_id=payload.project_id,
                name=f"Save dashboard failed: {payload.name}",
                task_type="dashboard_save",
                error=error,
                related_resource_type="dashboard",
                related_resource_id=None,
                retry_payload={
                    "operation": "dashboard_save",
                    "project_id": payload.project_id,
                    "name": payload.name,
                    "layout": payload.layout,
                },
            )
            raise

    def _create_dashboard(self, payload: DashboardCreateRequest) -> Dashboard:
        referenced_chart_ids = sorted(extract_chart_ids(payload.layout))
        for chart_id in referenced_chart_ids:
            chart = self.get_chart(chart_id)
            if chart.project_id != payload.project_id:
                raise AppError(
                    "Dashboard references charts outside the project",
                    "dashboard_chart_project_mismatch",
                    400,
                )

        dashboard_id = new_id("dash")
        if self.repository is None:
            dashboard_id = f"dash_{len(self._dashboards) + 1}"

        dashboard = Dashboard(
            id=dashboard_id,
            project_id=payload.project_id,
            name=payload.name,
            layout=payload.layout,
        )

        if self.repository is not None:
            dashboard = model_to_dashboard(
                self.repository.save_dashboard(
                    DashboardDefinitionModel(
                        id=dashboard.id,
                        project_id=dashboard.project_id,
                        name=dashboard.name,
                        layout=dashboard.layout,
                    )
                )
            )
        else:
            self._dashboards[dashboard.id] = dashboard

        self._record_dashboard_audit(
            dashboard=dashboard,
            referenced_chart_ids=referenced_chart_ids,
        )
        self._record_dashboard_task(dashboard)
        return dashboard

    def list_dashboards(self, project_id: str) -> list[Dashboard]:
        if self.repository is not None:
            return [
                model_to_dashboard(dashboard)
                for dashboard in self.repository.list_dashboards(project_id)
            ]

        return [
            dashboard
            for dashboard in self._dashboards.values()
            if dashboard.project_id == project_id
        ]

    def get_dashboard(self, dashboard_id: str) -> Dashboard:
        if self.repository is not None:
            dashboard = self.repository.get_dashboard(dashboard_id)
            if dashboard is None:
                raise AppError("Dashboard not found", "dashboard_not_found", 404)
            return model_to_dashboard(dashboard)

        dashboard = self._dashboards.get(dashboard_id)
        if dashboard is None:
            raise AppError("Dashboard not found", "dashboard_not_found", 404)
        return dashboard

    def _validate_data_view_scope(self, *, project_id: str, data_view_id: str) -> None:
        if self.data_views is None:
            return

        data_view = self.data_views.get_data_view(data_view_id)
        if data_view.project_id != project_id:
            raise AppError(
                "Chart data view is outside the project",
                "chart_data_view_project_mismatch",
                400,
            )

    def _record_chart_audit(self, chart: Chart) -> None:
        if self.audit is None:
            return

        self.audit.record_operation(
            action="chart.created",
            project_id=chart.project_id,
            resource_type="chart",
            resource_id=chart.id,
            detail={
                "name": chart.name,
                "chart_type": chart.chart_type,
                "data_view_id": chart.data_view_id,
            },
        )
        self.audit.record_lineage(
            project_id=chart.project_id,
            source_type="data_view",
            source_id=chart.data_view_id,
            target_type="chart",
            target_id=chart.id,
            transform_type="chart_definition",
            transform_id=chart.id,
        )

    def _record_dashboard_audit(
        self,
        *,
        dashboard: Dashboard,
        referenced_chart_ids: list[str],
    ) -> None:
        if self.audit is None:
            return

        mode = dashboard.layout.get("mode", "dashboard")
        self.audit.record_operation(
            action="dashboard.created",
            project_id=dashboard.project_id,
            resource_type="dashboard",
            resource_id=dashboard.id,
            detail={
                "name": dashboard.name,
                "mode": mode,
                "chart_ids": referenced_chart_ids,
            },
        )
        for chart_id in referenced_chart_ids:
            self.audit.record_lineage(
                project_id=dashboard.project_id,
                source_type="chart",
                source_id=chart_id,
                target_type="dashboard",
                target_id=dashboard.id,
                transform_type=f"{mode}_layout",
                transform_id=dashboard.id,
            )

    def _record_chart_task(self, chart: Chart) -> None:
        if self.tasks is None:
            return

        self.tasks.record_success(
            project_id=chart.project_id,
            name=f"Saved chart: {chart.name}",
            task_type="chart_save",
            related_resource_type="chart",
            related_resource_id=chart.id,
        )

    def _record_dashboard_task(self, dashboard: Dashboard) -> None:
        if self.tasks is None:
            return

        mode = dashboard.layout.get("mode", "dashboard")
        self.tasks.record_success(
            project_id=dashboard.project_id,
            name=f"Saved {mode}: {dashboard.name}",
            task_type="dashboard_save",
            related_resource_type="dashboard",
            related_resource_id=dashboard.id,
        )

    def _record_visualization_failure(
        self,
        *,
        project_id: str,
        name: str,
        task_type: str,
        error: Exception,
        related_resource_type: str | None,
        related_resource_id: str | None,
        retry_payload: dict[str, object] | None,
    ) -> None:
        if self.tasks is None:
            return

        self.tasks.record_exception(
            project_id=project_id,
            name=name,
            task_type=task_type,
            error=error,
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
            retry_payload=retry_payload,
        )


def extract_chart_ids(value: Any) -> set[str]:
    if isinstance(value, dict):
        chart_ids: set[str] = set()
        for key, nested_value in value.items():
            if key == "chart_id" and isinstance(nested_value, str):
                chart_ids.add(nested_value)
            else:
                chart_ids.update(extract_chart_ids(nested_value))
        return chart_ids
    if isinstance(value, list):
        chart_ids = set()
        for item in value:
            chart_ids.update(extract_chart_ids(item))
        return chart_ids
    return set()


def model_to_chart(chart: ChartDefinitionModel) -> Chart:
    return Chart(
        id=chart.id,
        project_id=chart.project_id,
        data_view_id=chart.data_view_id,
        name=chart.name,
        chart_type=chart.chart_type,
        config=chart.config,
    )


def model_to_dashboard(dashboard: DashboardDefinitionModel) -> Dashboard:
    return Dashboard(
        id=dashboard.id,
        project_id=dashboard.project_id,
        name=dashboard.name,
        layout=dashboard.layout,
    )


def to_chart_response(chart: Chart) -> ChartResponse:
    return ChartResponse(
        id=chart.id,
        project_id=chart.project_id,
        data_view_id=chart.data_view_id,
        name=chart.name,
        chart_type=chart.chart_type,
        config=chart.config,
    )


def to_dashboard_response(dashboard: Dashboard) -> DashboardResponse:
    return DashboardResponse(
        id=dashboard.id,
        project_id=dashboard.project_id,
        name=dashboard.name,
        layout=dashboard.layout,
    )


visualization_service = VisualizationService()
