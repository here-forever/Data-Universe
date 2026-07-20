from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.data_view import ChartDefinition as ChartDefinitionModel
from app.models.data_view import DashboardDefinition as DashboardDefinitionModel


class VisualizationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_chart(self, chart: ChartDefinitionModel) -> ChartDefinitionModel:
        self.session.add(chart)
        self.session.commit()
        self.session.refresh(chart)
        return chart

    def get_chart(self, chart_id: str) -> ChartDefinitionModel | None:
        return self.session.get(ChartDefinitionModel, chart_id)

    def list_charts(self, project_id: str) -> list[ChartDefinitionModel]:
        return list(
            self.session.scalars(
                select(ChartDefinitionModel)
                .where(ChartDefinitionModel.project_id == project_id)
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

    def get_dashboard(self, dashboard_id: str) -> DashboardDefinitionModel | None:
        return self.session.get(DashboardDefinitionModel, dashboard_id)

    def list_dashboards(self, project_id: str) -> list[DashboardDefinitionModel]:
        return list(
            self.session.scalars(
                select(DashboardDefinitionModel)
                .where(DashboardDefinitionModel.project_id == project_id)
                .order_by(DashboardDefinitionModel.created_at.desc())
            )
        )
