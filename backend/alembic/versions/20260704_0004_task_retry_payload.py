"""add task retry payload

Revision ID: 20260704_0004
Revises: 20260704_0003
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260704_0004"
down_revision: str | None = "20260704_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("retry_payload", sa.JSON()))


def downgrade() -> None:
    op.drop_column("tasks", "retry_payload")
