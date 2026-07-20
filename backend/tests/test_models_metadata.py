from app.core.database import Base, import_models


def test_core_mvp_tables_are_registered() -> None:
    import_models()

    expected_tables = {
        "users",
        "projects",
        "project_members",
        "resource_permissions",
        "uploaded_files",
        "file_import_previews",
        "datasets",
        "dataset_fields",
        "dataset_table_maps",
        "tasks",
        "operation_logs",
        "lineage_edges",
    }

    assert expected_tables.issubset(Base.metadata.tables.keys())


def test_dataset_fields_reserve_sensitivity_metadata() -> None:
    import_models()

    columns = Base.metadata.tables["dataset_fields"].columns

    assert "is_sensitive" in columns
    assert "masking_strategy" in columns


def test_external_connections_support_recoverable_archival() -> None:
    import_models()

    columns = Base.metadata.tables["external_database_connections"].columns

    assert "archived_at" in columns
