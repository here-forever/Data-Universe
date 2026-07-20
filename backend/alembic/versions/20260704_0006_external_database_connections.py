"""add external database connections

Revision ID: 20260704_0006
Revises: 20260704_0005
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260704_0006"
down_revision: str | None = "20260704_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "external_database_connections",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("database_type", sa.String(length=32), nullable=False),
        sa.Column("host", sa.String(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("database_name", sa.String(length=120), nullable=False),
        sa.Column("username", sa.String(length=120), nullable=False),
        sa.Column("password_secret", sa.Text(), nullable=False),
        sa.Column("read_only", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="untested", nullable=False),
        sa.Column("last_error", sa.Text()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("project_id", "name", name="uq_external_db_connections_project_name"),
    )
    op.create_index(
        "ix_external_database_connections_project_id",
        "external_database_connections",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_external_database_connections_project_id",
        table_name="external_database_connections",
    )
    op.drop_table("external_database_connections")
