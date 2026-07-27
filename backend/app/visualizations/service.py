from dataclasses import dataclass
from datetime import UTC, datetime
from math import ceil
from typing import Any

from app.audit.service import AuditService
from app.core.errors import AppError
from app.core.ids import new_id
from app.data_views.service import DataViewService
from app.models.data_view import ChartDefinition as ChartDefinitionModel
from app.models.data_view import DashboardDefinition as DashboardDefinitionModel
from app.models.data_view import ReportExport as ReportExportModel
from app.tasks.service import TaskService
from app.visualizations.exporter import (
    CONTENT_TYPES,
    ReportChartData,
    ReportDocument,
    export_report,
    safe_report_filename,
)
from app.visualizations.repository import VisualizationRepository
from app.visualizations.schemas import (
    ChartCreateRequest,
    ChartResponse,
    DashboardCreateRequest,
    DashboardLayoutDefinition,
    DashboardResponse,
    DashboardUpdateRequest,
    ReportExportFormat,
    ReportExportResponse,
)
from app.visualizations.storage import ReportExportStorage


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
    configuration_version: int
    layout: DashboardLayoutDefinition
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class ReportExport:
    id: str
    project_id: str
    dashboard_id: str
    created_by_id: str | None
    export_format: ReportExportFormat
    file_name: str
    content_type: str
    byte_size: int
    storage_path: str
    source_snapshot: dict[str, Any]
    created_at: datetime


class VisualizationService:
    def __init__(
        self,
        *,
        repository: VisualizationRepository | None = None,
        data_views: DataViewService | None = None,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
        report_export_storage: ReportExportStorage | None = None,
        created_by_id: str | None = None,
        max_export_rows_per_chart: int = 10_000,
    ) -> None:
        self.repository = repository
        self.data_views = data_views
        self.audit = audit
        self.tasks = tasks
        self.report_export_storage = report_export_storage
        self.created_by_id = created_by_id
        self.max_export_rows_per_chart = max_export_rows_per_chart
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
                    "layout": payload.layout.model_dump(mode="json"),
                },
            )
            raise

    def _create_dashboard(self, payload: DashboardCreateRequest) -> Dashboard:
        referenced_chart_ids = sorted(item.chart_id for item in payload.layout.items)
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

        now = datetime.now(UTC)
        dashboard = Dashboard(
            id=dashboard_id,
            project_id=payload.project_id,
            name=payload.name,
            configuration_version=1,
            layout=payload.layout,
            created_at=now,
            updated_at=now,
        )

        if self.repository is not None:
            dashboard = model_to_dashboard(
                self.repository.save_dashboard(
                    DashboardDefinitionModel(
                        id=dashboard.id,
                        project_id=dashboard.project_id,
                        name=dashboard.name,
                        configuration_version=dashboard.configuration_version,
                        layout=dashboard.layout.model_dump(mode="json"),
                    )
                )
            )
        else:
            self._dashboards[dashboard.id] = dashboard

        self._record_dashboard_audit(
            dashboard=dashboard,
            referenced_chart_ids=referenced_chart_ids,
            action="dashboard.created",
        )
        self._record_dashboard_task(dashboard, task_type="dashboard_save")
        return dashboard

    def update_dashboard(
        self,
        dashboard_id: str,
        payload: DashboardUpdateRequest,
    ) -> Dashboard:
        dashboard = self.get_dashboard(dashboard_id)
        if dashboard.configuration_version != payload.expected_version:
            raise AppError(
                "Dashboard was updated by another operation; reload before saving",
                "dashboard_version_conflict",
                409,
            )
        next_layout = payload.layout or dashboard.layout
        next_name = payload.name or dashboard.name
        referenced_chart_ids = sorted(item.chart_id for item in next_layout.items)
        for chart_id in referenced_chart_ids:
            chart = self.get_chart(chart_id)
            if chart.project_id != dashboard.project_id:
                raise AppError(
                    "Dashboard references charts outside the project",
                    "dashboard_chart_project_mismatch",
                    400,
                )

        if self.repository is None:
            updated = Dashboard(
                id=dashboard.id,
                project_id=dashboard.project_id,
                name=next_name,
                configuration_version=dashboard.configuration_version + 1,
                layout=next_layout,
                created_at=dashboard.created_at,
                updated_at=datetime.now(UTC),
            )
            self._dashboards[updated.id] = updated
        else:
            model = self.repository.update_dashboard(
                dashboard.id,
                expected_version=payload.expected_version,
                name=next_name,
                layout=next_layout.model_dump(mode="json"),
            )
            if model is None:
                raise AppError(
                    "Dashboard was updated by another operation; reload before saving",
                    "dashboard_version_conflict",
                    409,
                )
            updated = model_to_dashboard(model)

        self._record_dashboard_audit(
            dashboard=updated,
            referenced_chart_ids=referenced_chart_ids,
            action="dashboard.updated",
        )
        self._record_dashboard_task(updated, task_type="dashboard_update")
        return updated

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

    def export_dashboard(
        self,
        dashboard_id: str,
        export_format: ReportExportFormat,
        *,
        task_id: str | None = None,
    ) -> tuple[ReportExport, bytes]:
        dashboard = self.get_dashboard(dashboard_id)
        owned_task_id = task_id
        if self.tasks is not None and owned_task_id is None:
            task = self.tasks.create_task(
                project_id=dashboard.project_id,
                name=f"Export {dashboard.layout.mode}: {dashboard.name}",
                task_type="report_export",
                related_resource_type="dashboard",
                related_resource_id=dashboard.id,
                retry_payload={
                    "operation": "report_export",
                    "dashboard_id": dashboard.id,
                    "format": export_format,
                },
            )
            owned_task_id = task.id
            self.tasks.mark_running(task.id, progress=10)

        try:
            result = self._export_dashboard(
                dashboard=dashboard,
                export_format=export_format,
                task_id=owned_task_id,
            )
        except Exception as error:
            if self.tasks is not None and task_id is None and owned_task_id is not None:
                self.tasks.mark_exception(
                    owned_task_id,
                    error,
                    retry_payload={
                        "operation": "report_export",
                        "dashboard_id": dashboard.id,
                        "format": export_format,
                    },
                )
            raise

        artifact, content = result
        if self.tasks is not None and task_id is None and owned_task_id is not None:
            self.tasks.mark_success(
                owned_task_id,
                related_resource_type="report_export",
                related_resource_id=artifact.id,
            )
        return artifact, content

    def _export_dashboard(
        self,
        *,
        dashboard: Dashboard,
        export_format: ReportExportFormat,
        task_id: str | None,
    ) -> tuple[ReportExport, bytes]:
        if self.repository is None or self.data_views is None or self.report_export_storage is None:
            raise AppError(
                "Report export service is not configured",
                "report_export_not_configured",
                503,
            )
        export_id = new_id("export")
        charts: list[ReportChartData] = []
        item_count = max(1, len(dashboard.layout.items))
        for index, item in enumerate(dashboard.layout.items):
            chart = self.get_chart(item.chart_id)
            data_view = self.data_views.get_data_view(chart.data_view_id)
            row_limit = min(data_view.row_count, self.max_export_rows_per_chart)
            rows: list[dict[str, object | None]] = []
            for page in range(1, ceil(row_limit / 200) + 1):
                _, page_rows = self.data_views.preview_data_view_rows(
                    data_view_id=data_view.id,
                    page=page,
                    page_size=min(200, row_limit - len(rows)),
                )
                rows.extend(page_rows)
            charts.append(
                ReportChartData(
                    chart_id=chart.id,
                    chart_name=chart.name,
                    chart_type=chart.chart_type,
                    data_view_id=chart.data_view_id,
                    dimension=read_chart_config(chart.config, "dimension"),
                    metric=read_chart_config(chart.config, "metric"),
                    aggregation=read_chart_config(chart.config, "aggregation", "sum"),
                    rows=rows,
                )
            )
            if self.tasks is not None and task_id is not None:
                self.tasks.update_progress(task_id, 15 + int(((index + 1) / item_count) * 55))

        generated_at = datetime.now(UTC)
        document = ReportDocument(
            export_id=export_id,
            dashboard_id=dashboard.id,
            dashboard_name=dashboard.name,
            dashboard_mode=dashboard.layout.mode,
            dashboard_version=dashboard.configuration_version,
            generated_at=generated_at,
            filters=dashboard.layout.global_filters,
            selections=dashboard.layout.active_selections,
            charts=charts,
        )
        content = export_report(document, export_format)
        if self.tasks is not None and task_id is not None:
            self.tasks.update_progress(task_id, 80)
        file_name = safe_report_filename(dashboard.name, dashboard.id, export_format)
        stored = self.report_export_storage.save(
            project_id=dashboard.project_id,
            export_id=export_id,
            suffix=export_format,
            content=content,
        )
        source_snapshot: dict[str, Any] = {
            "dashboard_id": dashboard.id,
            "dashboard_name": dashboard.name,
            "dashboard_version": dashboard.configuration_version,
            "mode": dashboard.layout.mode,
            "chart_ids": [item.chart_id for item in dashboard.layout.items],
            "layout": dashboard.layout.model_dump(mode="json"),
            "generated_at": generated_at.isoformat(),
        }
        artifact = model_to_report_export(
            self.repository.save_report_export(
                ReportExportModel(
                    id=export_id,
                    project_id=dashboard.project_id,
                    dashboard_id=dashboard.id,
                    created_by_id=self.created_by_id,
                    export_format=export_format,
                    file_name=file_name,
                    content_type=CONTENT_TYPES[export_format],
                    byte_size=stored.byte_size,
                    storage_path=stored.path,
                    source_snapshot=source_snapshot,
                )
            )
        )
        self._record_export_audit(dashboard, artifact)
        if self.tasks is not None and task_id is not None:
            self.tasks.update_progress(task_id, 95)
        return artifact, content

    def list_report_exports(self, dashboard_id: str) -> list[ReportExport]:
        dashboard = self.get_dashboard(dashboard_id)
        if self.repository is None:
            return []
        return [
            model_to_report_export(item)
            for item in self.repository.list_report_exports(dashboard.id)
        ]

    def get_report_export(self, dashboard_id: str, export_id: str) -> ReportExport:
        dashboard = self.get_dashboard(dashboard_id)
        if self.repository is None:
            raise AppError("Report export not found", "report_export_not_found", 404)
        model = self.repository.get_report_export(export_id)
        if model is None or model.dashboard_id != dashboard.id:
            raise AppError("Report export not found", "report_export_not_found", 404)
        return model_to_report_export(model)

    def read_report_export(self, dashboard_id: str, export_id: str) -> tuple[ReportExport, bytes]:
        artifact = self.get_report_export(dashboard_id, export_id)
        if self.report_export_storage is None:
            raise AppError(
                "Report export service is not configured",
                "report_export_not_configured",
                503,
            )
        return artifact, self.report_export_storage.read(artifact.storage_path)

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
        action: str,
    ) -> None:
        if self.audit is None:
            return

        mode = dashboard.layout.mode
        self.audit.record_operation(
            action=action,
            project_id=dashboard.project_id,
            resource_type="dashboard",
            resource_id=dashboard.id,
            detail={
                "name": dashboard.name,
                "mode": mode,
                "configuration_version": dashboard.configuration_version,
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

    def _record_dashboard_task(self, dashboard: Dashboard, *, task_type: str) -> None:
        if self.tasks is None:
            return

        mode = dashboard.layout.mode
        self.tasks.record_success(
            project_id=dashboard.project_id,
            name=f"Saved {mode}: {dashboard.name}",
            task_type=task_type,
            related_resource_type="dashboard",
            related_resource_id=dashboard.id,
        )

    def _record_export_audit(self, dashboard: Dashboard, artifact: ReportExport) -> None:
        if self.audit is None:
            return
        self.audit.record_operation(
            action="report.exported",
            project_id=dashboard.project_id,
            resource_type="report_export",
            resource_id=artifact.id,
            detail={
                "dashboard_id": dashboard.id,
                "dashboard_version": dashboard.configuration_version,
                "format": artifact.export_format,
                "file_name": artifact.file_name,
                "byte_size": artifact.byte_size,
            },
        )
        self.audit.record_lineage(
            project_id=dashboard.project_id,
            source_type="dashboard",
            source_id=dashboard.id,
            target_type="report_export",
            target_id=artifact.id,
            transform_type=f"{artifact.export_format}_export",
            transform_id=artifact.id,
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
        configuration_version=dashboard.configuration_version,
        layout=DashboardLayoutDefinition.model_validate(dashboard.layout),
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


def model_to_report_export(export: ReportExportModel) -> ReportExport:
    return ReportExport(
        id=export.id,
        project_id=export.project_id,
        dashboard_id=export.dashboard_id,
        created_by_id=export.created_by_id,
        export_format=export.export_format,
        file_name=export.file_name,
        content_type=export.content_type,
        byte_size=export.byte_size,
        storage_path=export.storage_path,
        source_snapshot=export.source_snapshot,
        created_at=export.created_at,
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
        configuration_version=dashboard.configuration_version,
        layout=dashboard.layout,
        created_at=dashboard.created_at,
        updated_at=dashboard.updated_at,
    )


def to_report_export_response(export: ReportExport) -> ReportExportResponse:
    return ReportExportResponse(
        id=export.id,
        project_id=export.project_id,
        dashboard_id=export.dashboard_id,
        created_by_id=export.created_by_id,
        export_format=export.export_format,
        file_name=export.file_name,
        content_type=export.content_type,
        byte_size=export.byte_size,
        source_snapshot=export.source_snapshot,
        created_at=export.created_at,
    )


def read_chart_config(config: dict[str, Any], key: str, default: str = "") -> str:
    value = config.get(key)
    return value if isinstance(value, str) else default


visualization_service = VisualizationService()
