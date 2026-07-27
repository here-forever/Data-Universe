"""add recoverable archive state for governed resources

Revision ID: 20260727_0010
Revises: 20260727_0009
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260727_0010"
down_revision: str | None = "20260727_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GOVERNED_TABLES = (
    "datasets",
    "data_views",
    "analysis_definitions",
    "cleaning_recipes",
    "chart_definitions",
    "dashboard_definitions",
)


def upgrade() -> None:
    for table_name in GOVERNED_TABLES:
        op.add_column(
            table_name,
            sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        )
        op.add_column(
            table_name,
            sa.Column(
                "archived_by_id",
                sa.String(length=64),
                sa.ForeignKey("users.id"),
                nullable=True,
            ),
        )
        op.create_index(f"ix_{table_name}_archived_at", table_name, ["archived_at"])
        op.create_index(
            f"ix_{table_name}_archived_by_id",
            table_name,
            ["archived_by_id"],
        )


def downgrade() -> None:
    for table_name in reversed(GOVERNED_TABLES):
        op.drop_index(f"ix_{table_name}_archived_by_id", table_name=table_name)
        op.drop_index(f"ix_{table_name}_archived_at", table_name=table_name)
        op.drop_column(table_name, "archived_by_id")
        op.drop_column(table_name, "archived_at")
