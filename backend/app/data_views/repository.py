from sqlalchemy import select
from sqlalchemy.orm import Session

from app.datasets.materializer import DatasetMaterializer
from app.imports.schemas import ImportFieldPreview
from app.models.data_view import DataView as DataViewModel
from app.models.data_view import DataViewField as DataViewFieldModel
from app.models.data_view import DataViewTableMap as DataViewTableMapModel


class DataViewRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_data_view(
        self,
        *,
        data_view: DataViewModel,
        fields: list[DataViewFieldModel],
        table_map: DataViewTableMapModel,
        materialized_fields: list[ImportFieldPreview],
        materialized_rows: list[dict[str, object | None]],
    ) -> DataViewModel:
        try:
            self.session.add(data_view)
            self.session.add_all(fields)
            self.session.add(table_map)
            self.session.flush()
            DatasetMaterializer(self.session).create_table(
                table_name=table_map.physical_table_name,
                fields=materialized_fields,
                rows=materialized_rows,
            )
            self.session.commit()
            self.session.refresh(data_view)
            return data_view
        except Exception:
            self.session.rollback()
            raise

    def get_data_view(self, data_view_id: str) -> DataViewModel | None:
        return self.session.get(DataViewModel, data_view_id)

    def list_data_views(self, project_id: str) -> list[DataViewModel]:
        return list(
            self.session.scalars(
                select(DataViewModel)
                .where(DataViewModel.project_id == project_id)
                .order_by(DataViewModel.created_at.desc())
            )
        )

    def list_fields(self, data_view_id: str) -> list[DataViewFieldModel]:
        return list(
            self.session.scalars(
                select(DataViewFieldModel)
                .where(DataViewFieldModel.data_view_id == data_view_id)
                .order_by(DataViewFieldModel.order)
            )
        )

    def get_table_map(self, data_view_id: str) -> DataViewTableMapModel | None:
        return self.session.scalar(
            select(DataViewTableMapModel).where(DataViewTableMapModel.data_view_id == data_view_id)
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
