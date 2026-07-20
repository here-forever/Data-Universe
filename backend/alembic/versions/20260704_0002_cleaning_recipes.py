"""add cleaning recipes

Revision ID: 20260704_0002
Revises: 20260704_0001
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260704_0002"
down_revision: str | None = "20260704_0001"
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
        "cleaning_recipes",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column(
            "source_dataset_id", sa.String(length=64), sa.ForeignKey("datasets.id"), nullable=False
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text()),
        *timestamps(),
    )
    op.create_index("ix_cleaning_recipes_project_id", "cleaning_recipes", ["project_id"])
    op.create_index(
        "ix_cleaning_recipes_source_dataset_id", "cleaning_recipes", ["source_dataset_id"]
    )

    op.create_table(
        "cleaning_steps",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column(
            "recipe_id", sa.String(length=64), sa.ForeignKey("cleaning_recipes.id"), nullable=False
        ),
        sa.Column("operation", sa.String(length=64), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_cleaning_steps_recipe_id", "cleaning_steps", ["recipe_id"])


def downgrade() -> None:
    op.drop_index("ix_cleaning_steps_recipe_id", table_name="cleaning_steps")
    op.drop_table("cleaning_steps")
    op.drop_index("ix_cleaning_recipes_source_dataset_id", table_name="cleaning_recipes")
    op.drop_index("ix_cleaning_recipes_project_id", table_name="cleaning_recipes")
    op.drop_table("cleaning_recipes")
