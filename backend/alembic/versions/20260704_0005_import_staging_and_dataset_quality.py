"""add import staging metadata and dataset name constraint

Revision ID: 20260704_0005
Revises: 20260704_0004
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260704_0005"
down_revision: str | None = "20260704_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "uploaded_files",
        sa.Column("status", sa.String(length=32), server_default="parsed", nullable=False),
    )
    op.add_column("uploaded_files", sa.Column("error_message", sa.Text()))
    op.create_unique_constraint(
        "uq_datasets_project_name",
        "datasets",
        ["project_id", "name"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_datasets_project_name", "datasets", type_="unique")
    op.drop_column("uploaded_files", "error_message")
    op.drop_column("uploaded_files", "status")
