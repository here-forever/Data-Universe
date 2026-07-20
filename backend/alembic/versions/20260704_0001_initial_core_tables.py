"""initial core tables

Revision ID: 20260704_0001
Revises:
Create Date: 2026-07-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260704_0001"
down_revision: str | None = None
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
        "users",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("is_platform_admin", sa.Boolean(), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "projects",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("owner_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_projects_owner_id", "projects", ["owner_id"])

    op.create_table(
        "project_members",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("user_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("role", sa.String(length=32), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
    )
    op.create_index("ix_project_members_project_id", "project_members", ["project_id"])
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    op.create_table(
        "resource_permissions",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("resource_type", sa.String(length=64), nullable=False),
        sa.Column("resource_id", sa.String(length=128), nullable=False),
        sa.Column("principal_type", sa.String(length=32), nullable=False),
        sa.Column("principal_id", sa.String(length=128), nullable=False),
        sa.Column("actions", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_resource_permissions_project_id", "resource_permissions", ["project_id"])
    op.create_index("ix_resource_permissions_resource_id", "resource_permissions", ["resource_id"])
    op.create_index(
        "ix_resource_permissions_resource_type", "resource_permissions", ["resource_type"]
    )

    op.create_table(
        "uploaded_files",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("uploader_id", sa.String(length=64), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_type", sa.String(length=32), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_uploaded_files_project_id", "uploaded_files", ["project_id"])
    op.create_index("ix_uploaded_files_uploader_id", "uploaded_files", ["uploader_id"])

    op.create_table(
        "file_import_previews",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("uploaded_file_id", sa.String(length=64), sa.ForeignKey("uploaded_files.id")),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("file_type", sa.String(length=32), nullable=False),
        sa.Column("row_count", sa.Integer(), nullable=False),
        sa.Column("fields", sa.JSON(), nullable=False),
        sa.Column("sample_rows", sa.JSON(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_file_import_previews_project_id", "file_import_previews", ["project_id"])

    op.create_table(
        "datasets",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column(
            "source_preview_id", sa.String(length=64), sa.ForeignKey("file_import_previews.id")
        ),
        sa.Column("row_count", sa.Integer(), nullable=False),
        *timestamps(),
    )
    op.create_index("ix_datasets_project_id", "datasets", ["project_id"])

    op.create_table(
        "dataset_fields",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("dataset_id", sa.String(length=64), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("data_type", sa.String(length=32), nullable=False),
        sa.Column("nullable", sa.Boolean(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False),
        sa.Column("is_sensitive", sa.Boolean(), nullable=False),
        sa.Column("masking_strategy", sa.String(length=64)),
        *timestamps(),
        sa.UniqueConstraint("dataset_id", "name", name="uq_dataset_fields_dataset_name"),
    )
    op.create_index("ix_dataset_fields_dataset_id", "dataset_fields", ["dataset_id"])

    op.create_table(
        "dataset_table_maps",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("dataset_id", sa.String(length=64), sa.ForeignKey("datasets.id"), nullable=False),
        sa.Column("physical_table_name", sa.String(length=128), nullable=False),
        *timestamps(),
        sa.UniqueConstraint("dataset_id"),
        sa.UniqueConstraint("physical_table_name"),
    )

    op.create_table(
        "tasks",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id")),
        sa.Column("initiator_id", sa.String(length=64), sa.ForeignKey("users.id")),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("task_type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.Text()),
        sa.Column("related_resource_type", sa.String(length=64)),
        sa.Column("related_resource_id", sa.String(length=128)),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        *timestamps(),
    )
    op.create_index("ix_tasks_initiator_id", "tasks", ["initiator_id"])
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])
    op.create_index("ix_tasks_task_type", "tasks", ["task_type"])

    op.create_table(
        "operation_logs",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id")),
        sa.Column("actor_id", sa.String(length=64), sa.ForeignKey("users.id")),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("resource_type", sa.String(length=64)),
        sa.Column("resource_id", sa.String(length=128)),
        sa.Column("detail", sa.JSON()),
        *timestamps(),
    )
    op.create_index("ix_operation_logs_action", "operation_logs", ["action"])
    op.create_index("ix_operation_logs_actor_id", "operation_logs", ["actor_id"])
    op.create_index("ix_operation_logs_project_id", "operation_logs", ["project_id"])

    op.create_table(
        "lineage_edges",
        sa.Column("id", sa.String(length=64), primary_key=True),
        sa.Column("project_id", sa.String(length=64), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("source_type", sa.String(length=64), nullable=False),
        sa.Column("source_id", sa.String(length=128), nullable=False),
        sa.Column("target_type", sa.String(length=64), nullable=False),
        sa.Column("target_id", sa.String(length=128), nullable=False),
        sa.Column("transform_type", sa.String(length=64)),
        sa.Column("transform_id", sa.String(length=128)),
        *timestamps(),
    )
    op.create_index("ix_lineage_edges_project_id", "lineage_edges", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_lineage_edges_project_id", table_name="lineage_edges")
    op.drop_table("lineage_edges")
    op.drop_index("ix_operation_logs_project_id", table_name="operation_logs")
    op.drop_index("ix_operation_logs_actor_id", table_name="operation_logs")
    op.drop_index("ix_operation_logs_action", table_name="operation_logs")
    op.drop_table("operation_logs")
    op.drop_index("ix_tasks_task_type", table_name="tasks")
    op.drop_index("ix_tasks_status", table_name="tasks")
    op.drop_index("ix_tasks_project_id", table_name="tasks")
    op.drop_index("ix_tasks_initiator_id", table_name="tasks")
    op.drop_table("tasks")
    op.drop_table("dataset_table_maps")
    op.drop_index("ix_dataset_fields_dataset_id", table_name="dataset_fields")
    op.drop_table("dataset_fields")
    op.drop_index("ix_datasets_project_id", table_name="datasets")
    op.drop_table("datasets")
    op.drop_index("ix_file_import_previews_project_id", table_name="file_import_previews")
    op.drop_table("file_import_previews")
    op.drop_index("ix_uploaded_files_uploader_id", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_project_id", table_name="uploaded_files")
    op.drop_table("uploaded_files")
    op.drop_index("ix_resource_permissions_resource_type", table_name="resource_permissions")
    op.drop_index("ix_resource_permissions_resource_id", table_name="resource_permissions")
    op.drop_index("ix_resource_permissions_project_id", table_name="resource_permissions")
    op.drop_table("resource_permissions")
    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_index("ix_project_members_project_id", table_name="project_members")
    op.drop_table("project_members")
    op.drop_index("ix_projects_owner_id", table_name="projects")
    op.drop_table("projects")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
