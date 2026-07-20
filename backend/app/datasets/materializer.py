from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    MetaData,
    Table,
    Text,
    inspect,
    select,
)
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.imports.schemas import ImportFieldPreview

SYSTEM_ROW_ID = "_das_row_id"
POSTGRES_IDENTIFIER_LIMIT = 63


class DatasetMaterializer:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_table(
        self,
        *,
        table_name: str,
        fields: list[ImportFieldPreview],
        rows: list[dict[str, object | None]],
    ) -> None:
        connection = self.session.connection()
        if inspect(connection).has_table(table_name):
            raise AppError(
                message="Physical table already exists",
                code="physical_table_exists",
                status_code=409,
            )

        table = self._build_table(table_name=table_name, fields=fields)
        table.create(bind=connection, checkfirst=False)

        if rows:
            self.session.execute(
                table.insert(),
                [normalize_row(row=row, fields=fields) for row in rows],
            )

    def _build_table(self, *, table_name: str, fields: list[ImportFieldPreview]) -> Table:
        metadata = MetaData()
        return Table(
            table_name,
            metadata,
            Column(SYSTEM_ROW_ID, Integer, primary_key=True, autoincrement=True),
            *[
                Column(
                    field.name,
                    to_sqlalchemy_type(field.inferred_type),
                    nullable=field.nullable,
                    quote=True,
                )
                for field in fields
            ],
        )

    def preview_rows(
        self,
        *,
        table_name: str,
        fields: list[ImportFieldPreview],
        page: int,
        page_size: int,
    ) -> list[dict[str, object | None]]:
        connection = self.session.connection()
        if not inspect(connection).has_table(table_name):
            raise AppError(
                message="Physical table does not exist",
                code="physical_table_not_found",
                status_code=404,
            )

        table = self._build_table(table_name=table_name, fields=fields)
        statement = (
            select(table)
            .order_by(table.c[SYSTEM_ROW_ID])
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return [dict(row._mapping) for row in self.session.execute(statement).all()]

    def list_rows(
        self,
        *,
        table_name: str,
        fields: list[ImportFieldPreview],
    ) -> list[dict[str, object | None]]:
        connection = self.session.connection()
        if not inspect(connection).has_table(table_name):
            raise AppError(
                message="Physical table does not exist",
                code="physical_table_not_found",
                status_code=404,
            )

        table = self._build_table(table_name=table_name, fields=fields)
        statement = select(table).order_by(table.c[SYSTEM_ROW_ID])
        return [dict(row._mapping) for row in self.session.execute(statement).all()]


def to_sqlalchemy_type(field_type: str):
    if field_type == "integer":
        return Integer()
    if field_type == "decimal":
        return Float()
    if field_type == "boolean":
        return Boolean()
    if field_type == "date":
        return Date()
    if field_type == "datetime":
        return DateTime(timezone=False)
    return Text()


def normalize_row(
    *,
    row: dict[str, object | None],
    fields: list[ImportFieldPreview],
) -> dict[str, object | None]:
    return {
        field.name: normalize_value(row.get(field.name), field.inferred_type) for field in fields
    }


def normalize_value(value: object | None, field_type: str) -> object | None:
    if value is None:
        return None
    if field_type == "date":
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return date.fromisoformat(str(value))
    if field_type == "datetime":
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value))
    return value
