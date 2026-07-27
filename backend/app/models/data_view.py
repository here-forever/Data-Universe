from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import ArchivableMixin, TimestampMixin


class DataView(ArchivableMixin, TimestampMixin, Base):
    __tablename__ = "data_views"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_id: Mapped[str | None] = mapped_column(String(128))
    source_sql: Mapped[str | None] = mapped_column(Text)
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class DataViewField(TimestampMixin, Base):
    __tablename__ = "data_view_fields"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data_view_id: Mapped[str] = mapped_column(
        ForeignKey("data_views.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    data_type: Mapped[str] = mapped_column(String(32), nullable=False)
    nullable: Mapped[bool] = mapped_column(default=True, nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)


class DataViewTableMap(TimestampMixin, Base):
    __tablename__ = "data_view_table_maps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    data_view_id: Mapped[str] = mapped_column(
        ForeignKey("data_views.id"),
        unique=True,
        nullable=False,
    )
    physical_table_name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)


class ChartDefinition(ArchivableMixin, TimestampMixin, Base):
    __tablename__ = "chart_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    data_view_id: Mapped[str] = mapped_column(
        ForeignKey("data_views.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    chart_type: Mapped[str] = mapped_column(String(64), nullable=False)
    config: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)


class DashboardDefinition(ArchivableMixin, TimestampMixin, Base):
    __tablename__ = "dashboard_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    configuration_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    layout: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)


class ReportExport(TimestampMixin, Base):
    __tablename__ = "report_exports"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    dashboard_id: Mapped[str] = mapped_column(
        ForeignKey("dashboard_definitions.id"), nullable=False, index=True
    )
    created_by_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    export_format: Mapped[str] = mapped_column(String(16), nullable=False)
    file_name: Mapped[str] = mapped_column(String(180), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    source_snapshot: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
