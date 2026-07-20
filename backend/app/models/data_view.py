from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class DataView(TimestampMixin, Base):
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


class ChartDefinition(TimestampMixin, Base):
    __tablename__ = "chart_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    data_view_id: Mapped[str] = mapped_column(
        ForeignKey("data_views.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    chart_type: Mapped[str] = mapped_column(String(64), nullable=False)
    config: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)


class DashboardDefinition(TimestampMixin, Base):
    __tablename__ = "dashboard_definitions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    layout: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
