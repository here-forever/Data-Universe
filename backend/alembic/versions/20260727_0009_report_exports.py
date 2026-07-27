"""add versioned report layouts and durable exports

Revision ID: 20260727_0009
Revises: 20260727_0008
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260727_0009"
down_revision: str | None = "20260727_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dashboard_definitions",
        sa.Column(
            "configuration_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )

    op.create_table(
        "report_exports",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(length=64),
            sa.ForeignKey("projects.id"),
            nullable=False,
        ),
        sa.Column(
            "dashboard_id",
            sa.String(length=64),
            sa.ForeignKey("dashboard_definitions.id"),
            nullable=False,
        ),
        sa.Column(
            "created_by_id",
            sa.String(length=64),
            sa.ForeignKey("users.id"),
        ),
        sa.Column("export_format", sa.String(length=16), nullable=False),
        sa.Column("file_name", sa.String(length=180), nullable=False),
        sa.Column("content_type", sa.String(length=120), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.Text(), nullable=False),
        sa.Column("source_snapshot", sa.JSON(), nullable=False),
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
    )
    op.create_index("ix_report_exports_project_id", "report_exports", ["project_id"])
    op.create_index("ix_report_exports_dashboard_id", "report_exports", ["dashboard_id"])
    op.create_index("ix_report_exports_created_by_id", "report_exports", ["created_by_id"])


def downgrade() -> None:
    op.drop_index("ix_report_exports_created_by_id", table_name="report_exports")
    op.drop_index("ix_report_exports_dashboard_id", table_name="report_exports")
    op.drop_index("ix_report_exports_project_id", table_name="report_exports")
    op.drop_table("report_exports")
    op.drop_column("dashboard_definitions", "configuration_version")
