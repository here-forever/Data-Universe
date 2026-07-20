from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datasets.materializer import DatasetMaterializer
from app.imports.schemas import ImportFieldPreview
from app.models.dataset import Dataset as DatasetModel
from app.models.dataset import DatasetField as DatasetFieldModel
from app.models.dataset import DatasetTableMap as DatasetTableMapModel


class DatasetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_dataset(
        self,
        *,
        dataset: DatasetModel,
        fields: list[DatasetFieldModel],
        table_map: DatasetTableMapModel,
        materialized_fields: list[ImportFieldPreview] | None = None,
        materialized_rows: list[dict[str, object | None]] | None = None,
    ) -> DatasetModel:
        try:
            self.session.add(dataset)
            self.session.add_all(fields)
            self.session.add(table_map)
            self.session.flush()

            if materialized_fields is not None and materialized_rows is not None:
                DatasetMaterializer(self.session).create_table(
                    table_name=table_map.physical_table_name,
                    fields=materialized_fields,
                    rows=materialized_rows,
                )

            self.session.commit()
            self.session.refresh(dataset)
            return dataset
        except Exception:
            self.session.rollback()
            raise

    def get_dataset(self, dataset_id: str) -> DatasetModel | None:
        return self.session.get(DatasetModel, dataset_id)

    def get_dataset_by_name(self, *, project_id: str, name: str) -> DatasetModel | None:
        return self.session.scalar(
            select(DatasetModel).where(
                DatasetModel.project_id == project_id,
                DatasetModel.name == name,
            )
        )

    def list_datasets(self, project_id: str) -> list[DatasetModel]:
        return list(
            self.session.scalars(
                select(DatasetModel)
                .where(DatasetModel.project_id == project_id)
                .order_by(DatasetModel.created_at.desc())
            )
        )

    def list_fields(self, dataset_id: str) -> list[DatasetFieldModel]:
        return list(
            self.session.scalars(
                select(DatasetFieldModel)
                .where(DatasetFieldModel.dataset_id == dataset_id)
                .order_by(DatasetFieldModel.order)
            )
        )

    def get_table_map(self, dataset_id: str) -> DatasetTableMapModel | None:
        return self.session.scalar(
            select(DatasetTableMapModel).where(DatasetTableMapModel.dataset_id == dataset_id)
        )

    def preview_rows(
        self,
        *,
        table_name: str,
        fields: list[ImportFieldPreview],
        page: int,
        page_size: int,
    ) -> list[dict[str, object | None]]:
        return DatasetMaterializer(self.session).preview_rows(
            table_name=table_name,
            fields=fields,
            page=page,
            page_size=page_size,
        )

    def list_rows(
        self,
        *,
        table_name: str,
        fields: list[ImportFieldPreview],
    ) -> list[dict[str, object | None]]:
        return DatasetMaterializer(self.session).list_rows(
            table_name=table_name,
            fields=fields,
        )
