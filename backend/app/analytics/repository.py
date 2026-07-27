from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.analysis import AnalysisDefinition as AnalysisDefinitionModel


class AnalysisDefinitionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_definition(
        self,
        definition: AnalysisDefinitionModel,
    ) -> AnalysisDefinitionModel:
        try:
            self.session.add(definition)
            self.session.commit()
            self.session.refresh(definition)
            return definition
        except Exception:
            self.session.rollback()
            raise

    def get_definition(
        self,
        definition_id: str,
        *,
        include_archived: bool = False,
    ) -> AnalysisDefinitionModel | None:
        statement = select(AnalysisDefinitionModel).where(
            AnalysisDefinitionModel.id == definition_id
        )
        if not include_archived:
            statement = statement.where(AnalysisDefinitionModel.archived_at.is_(None))
        return self.session.scalar(statement)

    def get_definition_by_name(
        self,
        *,
        project_id: str,
        name: str,
    ) -> AnalysisDefinitionModel | None:
        return self.session.scalar(
            select(AnalysisDefinitionModel).where(
                AnalysisDefinitionModel.project_id == project_id,
                AnalysisDefinitionModel.name == name,
            )
        )

    def list_definitions(self, project_id: str) -> list[AnalysisDefinitionModel]:
        return list(
            self.session.scalars(
                select(AnalysisDefinitionModel)
                .where(
                    AnalysisDefinitionModel.project_id == project_id,
                    AnalysisDefinitionModel.archived_at.is_(None),
                )
                .order_by(
                    AnalysisDefinitionModel.updated_at.desc(),
                    AnalysisDefinitionModel.id.desc(),
                )
            )
        )

    def mark_run(
        self,
        definition: AnalysisDefinitionModel,
        *,
        last_run_at: datetime,
    ) -> AnalysisDefinitionModel:
        definition.last_run_at = last_run_at
        definition.updated_at = last_run_at
        self.session.add(definition)
        self.session.commit()
        self.session.refresh(definition)
        return definition
