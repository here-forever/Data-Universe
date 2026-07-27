from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import ArchivableMixin, TimestampMixin


class AnalysisDefinition(ArchivableMixin, TimestampMixin, Base):
    __tablename__ = "analysis_definitions"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "name",
            name="uq_analysis_definitions_project_name",
        ),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )
    source_dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    configuration_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    configuration: Mapped[dict[str, object]] = mapped_column(JSON, nullable=False)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
