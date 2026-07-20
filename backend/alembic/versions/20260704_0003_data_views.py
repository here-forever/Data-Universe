"""add data views and report resources

Revision ID: 20260704_0003
Revises: 20260704_0002
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260704_0003"
down_revision: str | None = "20260704_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "data_views",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=128)),
        sa.Column("source_sql", sa.Text()),
        sa.Column("row_count", sa.Integer(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_data_views_project_id", "data_views", ["project_id"])

    op.create_table(
        "data_view_fields",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "data_view_id", sa.String(length=64), sa.ForeignKey("data_views.id"), nullable=False
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("data_type", sa.String(length=32), nullable=False),
        sa.Column("nullable", sa.Boolean(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_data_view_fields_data_view_id", "data_view_fields", ["data_view_id"])

    op.create_table(
        "data_view_table_maps",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "data_view_id", sa.String(length=64), sa.ForeignKey("data_views.id"), nullable=False
        ),
        sa.Column("physical_table_name", sa.String(length=128), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("data_view_id"),
        sa.UniqueConstraint("physical_table_name"),
    )

    op.create_table(
        "chart_definitions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column(
            "data_view_id", sa.String(length=64), sa.ForeignKey("data_views.id"), nullable=False
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("chart_type", sa.String(length=64), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_chart_definitions_project_id", "chart_definitions", ["project_id"])
    op.create_index("ix_chart_definitions_data_view_id", "chart_definitions", ["data_view_id"])

    op.create_table(
        "dashboard_definitions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("layout", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_dashboard_definitions_project_id", "dashboard_definitions", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_dashboard_definitions_project_id", table_name="dashboard_definitions")
    op.drop_table("dashboard_definitions")
    op.drop_index("ix_chart_definitions_data_view_id", table_name="chart_definitions")
    op.drop_index("ix_chart_definitions_project_id", table_name="chart_definitions")
    op.drop_table("chart_definitions")
    op.drop_table("data_view_table_maps")
    op.drop_index("ix_data_view_fields_data_view_id", table_name="data_view_fields")
    op.drop_table("data_view_fields")
    op.drop_index("ix_data_views_project_id", table_name="data_views")
    op.drop_table("data_views")
