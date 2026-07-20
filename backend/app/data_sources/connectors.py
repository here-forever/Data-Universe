from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from urllib.parse import quote_plus

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    Integer,
    MetaData,
    Numeric,
    String,
    Table,
    Text,
    create_engine,
    inspect,
    select,
    text,
)

from app.core.sql_safety import validate_read_only_sql
from app.data_sources.schemas import DatabaseType
from app.imports.parser import infer_type
from app.imports.schemas import ImportFieldPreview


@dataclass(frozen=True)
class ExternalDatabaseConnectionConfig:
    database_type: DatabaseType
    host: str
    port: int
    database_name: str
    username: str
    password: str


@dataclass(frozen=True)
class ConnectionTestResult:
    ok: bool
    message: str


@dataclass(frozen=True)
class ExternalTableColumn:
    name: str
    data_type: str
    nullable: bool
    inferred_type: str
    order: int


@dataclass(frozen=True)
class ExternalTable:
    schema_name: str
    table_name: str
    columns: list[ExternalTableColumn]


@dataclass(frozen=True)
class ExternalQueryResult:
    fields: list[ImportFieldPreview]
    rows: list[dict[str, object | None]]


class ExternalDatabaseTester:
    def test_connection(self, config: ExternalDatabaseConnectionConfig) -> ConnectionTestResult:
        engine = create_engine(
            build_sqlalchemy_url(config),
            connect_args=build_connect_args(config),
            pool_pre_ping=True,
        )
        try:
            with engine.connect() as connection:
                if config.database_type == "mysql":
                    connection.execute(text("SET SESSION TRANSACTION READ ONLY"))
                connection.execute(text("SELECT 1"))
        finally:
            engine.dispose()

        return ConnectionTestResult(ok=True, message="Read-only connection test succeeded")

    def inspect_schema(self, config: ExternalDatabaseConnectionConfig) -> list[ExternalTable]:
        engine = create_engine(
            build_sqlalchemy_url(config),
            connect_args=build_connect_args(config),
            pool_pre_ping=True,
        )
        try:
            with engine.connect() as connection:
                inspector = inspect(connection)
                tables: list[ExternalTable] = []
                for schema_name in discover_schema_names(config, inspector):
                    for table_name in inspector.get_table_names(schema=schema_name):
                        columns = [
                            ExternalTableColumn(
                                name=column["name"],
                                data_type=str(column.get("type", "text")),
                                nullable=bool(column.get("nullable", True)),
                                inferred_type=map_sqlalchemy_type_to_field_type(column.get("type")),
                                order=index,
                            )
                            for index, column in enumerate(
                                inspector.get_columns(table_name, schema=schema_name)
                            )
                        ]
                        tables.append(
                            ExternalTable(
                                schema_name=schema_name or "",
                                table_name=table_name,
                                columns=columns,
                            )
                        )
                return tables
        finally:
            engine.dispose()

    def read_table(
        self,
        config: ExternalDatabaseConnectionConfig,
        *,
        schema_name: str,
        table_name: str,
        limit: int,
    ) -> ExternalQueryResult:
        engine = create_engine(
            build_sqlalchemy_url(config),
            connect_args=build_connect_args(config),
            pool_pre_ping=True,
        )
        try:
            with engine.connect() as connection:
                metadata = MetaData()
                table = Table(
                    table_name,
                    metadata,
                    autoload_with=connection,
                    schema=schema_name or None,
                )
                result = connection.execute(select(table).limit(limit))
                rows = normalize_external_rows([dict(row._mapping) for row in result.all()])
                fields = [
                    ImportFieldPreview(
                        name=column.name,
                        inferred_type=map_sqlalchemy_type_to_field_type(column.type),
                        nullable=column.nullable,
                        order=index,
                    )
                    for index, column in enumerate(table.columns)
                ]
                return ExternalQueryResult(fields=fields, rows=rows)
        finally:
            engine.dispose()

    def run_read_only_sql(
        self,
        config: ExternalDatabaseConnectionConfig,
        *,
        sql: str,
        limit: int,
    ) -> ExternalQueryResult:
        validate_read_only_sql(sql)
        engine = create_engine(
            build_sqlalchemy_url(config),
            connect_args=build_connect_args(config),
            pool_pre_ping=True,
        )
        try:
            with engine.connect() as connection:
                statement = text(
                    f"SELECT * FROM ({sql.rstrip().rstrip(';')}) AS das_external_query "
                    "LIMIT :das_limit"
                )
                result = connection.execute(statement, {"das_limit": limit})
                rows = normalize_external_rows([dict(row._mapping) for row in result.all()])
                columns = list(rows[0].keys()) if rows else list(result.keys())
                return ExternalQueryResult(
                    fields=infer_result_fields(columns=columns, rows=rows),
                    rows=rows,
                )
        finally:
            engine.dispose()


def build_sqlalchemy_url(config: ExternalDatabaseConnectionConfig) -> str:
    username = quote_plus(config.username)
    password = quote_plus(config.password)
    host = config.host.strip()
    database_name = quote_plus(config.database_name)

    if config.database_type == "postgresql":
        return f"postgresql+psycopg://{username}:{password}@{host}:{config.port}/{database_name}"
    if config.database_type == "mysql":
        return f"mysql+pymysql://{username}:{password}@{host}:{config.port}/{database_name}"

    raise ValueError(f"Unsupported database type: {config.database_type}")


def build_connect_args(config: ExternalDatabaseConnectionConfig) -> dict[str, int]:
    if config.database_type == "postgresql":
        return {"connect_timeout": 5}
    if config.database_type == "mysql":
        return {"connect_timeout": 5, "read_timeout": 5, "write_timeout": 5}

    return {}


def discover_schema_names(config: ExternalDatabaseConnectionConfig, inspector) -> list[str | None]:
    schema_names = inspector.get_schema_names()
    if config.database_type == "mysql":
        return [config.database_name]

    excluded = {"information_schema", "pg_catalog"}
    filtered = [schema for schema in schema_names if schema not in excluded]
    return filtered or [None]


def map_sqlalchemy_type_to_field_type(column_type: object) -> str:
    if isinstance(column_type, Boolean):
        return "boolean"
    if isinstance(column_type, Integer):
        return "integer"
    if isinstance(column_type, Float | Numeric):
        return "decimal"
    if isinstance(column_type, DateTime):
        return "datetime"
    if isinstance(column_type, Date):
        return "date"
    if isinstance(column_type, String | Text):
        return "text"
    return "text"


def normalize_external_rows(
    rows: list[dict[str, object | None]],
) -> list[dict[str, object | None]]:
    return [
        {column: normalize_external_value(value) for column, value in row.items()} for row in rows
    ]


def normalize_external_value(value: object | None) -> object | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, bool | int | float | str):
        return value
    return str(value)


def infer_result_fields(
    *,
    columns: list[str],
    rows: list[dict[str, object | None]],
) -> list[ImportFieldPreview]:
    return [
        ImportFieldPreview(
            name=column,
            inferred_type=infer_type(
                [value for value in [row.get(column) for row in rows] if value is not None]
            ),
            nullable=not rows or any(row.get(column) is None for row in rows),
            order=index,
        )
        for index, column in enumerate(columns)
    ]
