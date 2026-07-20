"""add external connection lifecycle

Revision ID: 20260716_0007
Revises: 20260704_0006
Create Date: 2026-07-16
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260716_0007"
down_revision: str | None = "20260704_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "external_database_connections",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_external_database_connections_archived_at",
        "external_database_connections",
        ["archived_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_external_database_connections_archived_at",
        table_name="external_database_connections",
    )
    op.drop_column("external_database_connections", "archived_at")
