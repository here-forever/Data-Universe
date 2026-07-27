"""add reusable analysis definitions

Revision ID: 20260727_0008
Revises: 20260716_0007
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260727_0008"
down_revision: str | None = "20260716_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analysis_definitions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=64),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "source_dataset_id",
            sa.String(length=64),
            sa.ForeignKey("datasets.id"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("configuration_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("configuration", sa.JSON(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "project_id",
            "name",
            name="uq_analysis_definitions_project_name",
        ),
    )
    op.create_index(
        "ix_analysis_definitions_project_id",
        "analysis_definitions",
        ["project_id"],
    )
    op.create_index(
        "ix_analysis_definitions_source_dataset_id",
        "analysis_definitions",
        ["source_dataset_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_analysis_definitions_source_dataset_id",
        table_name="analysis_definitions",
    )
    op.drop_index(
        "ix_analysis_definitions_project_id",
        table_name="analysis_definitions",
    )
    op.drop_table("analysis_definitions")
