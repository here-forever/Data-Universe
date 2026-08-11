from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError
from app.models import Dataset, DatasetRevision


class DatasetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self) -> list[Dataset]:
        statement = (
            select(Dataset)
            .options(selectinload(Dataset.revisions))
            .order_by(Dataset.updated_at.desc())
        )
        return list(self.session.scalars(statement).unique())

    def get(self, dataset_id: str) -> Dataset | None:
        statement = (
            select(Dataset).where(Dataset.id == dataset_id).options(selectinload(Dataset.revisions))
        )
        return self.session.scalar(statement)

    def add(self, dataset: Dataset) -> Dataset:
        self.session.add(dataset)
        self.session.commit()
        self.session.refresh(dataset)
        return dataset

    def commit(self) -> None:
        self.session.commit()

    def delete(self, dataset: Dataset) -> None:
        self.session.delete(dataset)
        self.session.commit()

    @staticmethod
    def active_revision(dataset: Dataset) -> DatasetRevision:
        revision = next(
            (item for item in dataset.revisions if item.revision == dataset.active_revision),
            None,
        )
        if revision is None:
            raise AppError("Active dataset revision not found", "dataset_revision_not_found", 404)
        return revision
