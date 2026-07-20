from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Dataset(TimestampMixin, Base):
    __tablename__ = "datasets"
    __table_args__ = (UniqueConstraint("project_id", "name", name="uq_datasets_project_name"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    source_preview_id: Mapped[str | None] = mapped_column(ForeignKey("file_import_previews.id"))
    row_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class DatasetField(TimestampMixin, Base):
    __tablename__ = "dataset_fields"
    __table_args__ = (
        UniqueConstraint("dataset_id", "name", name="uq_dataset_fields_dataset_name"),
    )

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    data_type: Mapped[str] = mapped_column(String(32), nullable=False)
    nullable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    is_sensitive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    masking_strategy: Mapped[str | None] = mapped_column(String(64))


class DatasetTableMap(TimestampMixin, Base):
    __tablename__ = "dataset_table_maps"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id"),
        unique=True,
        nullable=False,
    )
    physical_table_name: Mapped[str] = mapped_column(String(128), unique=True, nullable=False)
