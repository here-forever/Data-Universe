from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AnalysisRun


class InsightRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_for_dataset(self, dataset_id: str) -> list[AnalysisRun]:
        statement = (
            select(AnalysisRun)
            .where(AnalysisRun.dataset_id == dataset_id)
            .order_by(AnalysisRun.created_at.desc())
        )
        return list(self.session.scalars(statement))

    def add(self, run: AnalysisRun) -> AnalysisRun:
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return run
