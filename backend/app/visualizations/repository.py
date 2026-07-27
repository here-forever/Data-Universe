from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.data_view import ChartDefinition as ChartDefinitionModel
from app.models.data_view import DashboardDefinition as DashboardDefinitionModel
from app.models.data_view import ReportExport as ReportExportModel


class VisualizationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_chart(self, chart: ChartDefinitionModel) -> ChartDefinitionModel:
        self.session.add(chart)
        self.session.commit()
        self.session.refresh(chart)
        return chart

    def get_chart(
        self,
        chart_id: str,
        *,
        include_archived: bool = False,
    ) -> ChartDefinitionModel | None:
        statement = select(ChartDefinitionModel).where(ChartDefinitionModel.id == chart_id)
        if not include_archived:
            statement = statement.where(ChartDefinitionModel.archived_at.is_(None))
        return self.session.scalar(statement)

    def list_charts(self, project_id: str) -> list[ChartDefinitionModel]:
        return list(
            self.session.scalars(
                select(ChartDefinitionModel)
                .where(
                    ChartDefinitionModel.project_id == project_id,
                    ChartDefinitionModel.archived_at.is_(None),
                )
                .order_by(ChartDefinitionModel.created_at.desc())
            )
        )

    def save_dashboard(
        self,
        dashboard: DashboardDefinitionModel,
    ) -> DashboardDefinitionModel:
        self.session.add(dashboard)
        self.session.commit()
        self.session.refresh(dashboard)
        return dashboard

    def get_dashboard(
        self,
        dashboard_id: str,
        *,
        include_archived: bool = False,
    ) -> DashboardDefinitionModel | None:
        statement = select(DashboardDefinitionModel).where(
            DashboardDefinitionModel.id == dashboard_id
        )
        if not include_archived:
            statement = statement.where(DashboardDefinitionModel.archived_at.is_(None))
        return self.session.scalar(statement)

    def update_dashboard(
        self,
        dashboard_id: str,
        *,
        expected_version: int,
        name: str,
        layout: dict[str, object],
    ) -> DashboardDefinitionModel | None:
        result = self.session.execute(
            update(DashboardDefinitionModel)
            .where(
                DashboardDefinitionModel.id == dashboard_id,
                DashboardDefinitionModel.configuration_version == expected_version,
                DashboardDefinitionModel.archived_at.is_(None),
            )
            .values(
                name=name,
                layout=layout,
                configuration_version=expected_version + 1,
                updated_at=func.now(),
            )
        )
        if result.rowcount != 1:
            self.session.rollback()
            return None
        self.session.commit()
        return self.get_dashboard(dashboard_id)

    def list_dashboards(self, project_id: str) -> list[DashboardDefinitionModel]:
        return list(
            self.session.scalars(
                select(DashboardDefinitionModel)
                .where(
                    DashboardDefinitionModel.project_id == project_id,
                    DashboardDefinitionModel.archived_at.is_(None),
                )
                .order_by(DashboardDefinitionModel.created_at.desc())
            )
        )

    def save_report_export(self, export: ReportExportModel) -> ReportExportModel:
        self.session.add(export)
        self.session.commit()
        self.session.refresh(export)
        return export

    def get_report_export(self, export_id: str) -> ReportExportModel | None:
        return self.session.get(ReportExportModel, export_id)

    def list_report_exports(self, dashboard_id: str) -> list[ReportExportModel]:
        return list(
            self.session.scalars(
                select(ReportExportModel)
                .where(ReportExportModel.dashboard_id == dashboard_id)
                .order_by(ReportExportModel.created_at.desc())
            )
        )
