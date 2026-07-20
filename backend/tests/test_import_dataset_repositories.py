from pathlib import Path

from sqlalchemy import MetaData, Table, create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.audit.repository import AuditRepository
from app.audit.service import AuditService
from app.auth.repository import AuthRepository
from app.auth.service import AuthService
from app.core.database import Base, import_models
from app.core.errors import AppError
from app.datasets.repository import DatasetRepository
from app.datasets.schemas import DatasetCreateRequest
from app.datasets.service import DatasetService, build_physical_table_name
from app.imports.repository import ImportRepository
from app.imports.service import ImportService
from app.imports.storage import LocalFileStorage
from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel
from app.models.dataset import DatasetField as DatasetFieldModel
from app.models.dataset import DatasetTableMap as DatasetTableMapModel
from app.models.imports import FileImportPreview as FileImportPreviewModel
from app.models.imports import UploadedFile as UploadedFileModel
from app.projects.repository import ProjectRepository
from app.projects.service import ProjectService


def create_test_session() -> Session:
    import_models()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return session_factory()


def create_project(session: Session) -> tuple[str, str]:
    auth = AuthService(AuthRepository(session))
    owner = auth.get_or_create_default_admin()
    project = ProjectService(ProjectRepository(session), auth).create_project(
        name="Import Persistence",
        description=None,
        owner=owner,
    )
    return project.id, owner.id


def test_import_repository_persists_uploaded_file_preview_audit_and_lineage(tmp_path) -> None:
    session = create_test_session()
    project_id, uploader_id = create_project(session)
    service = ImportService(
        ImportRepository(session),
        uploader_id=uploader_id,
        storage=LocalFileStorage(str(tmp_path / "uploads")),
        audit=AuditService(AuditRepository(session), actor_id=uploader_id),
    )

    preview = service.create_file_preview(
        project_id=project_id,
        file_name="sales.csv",
        content=b"order_id,amount\n1,19.5\n2,42.0\n",
    )

    uploaded_file = session.scalar(
        select(UploadedFileModel).where(UploadedFileModel.file_name == "sales.csv")
    )
    saved_preview = session.get(FileImportPreviewModel, preview.id)
    operation_log = session.scalar(
        select(OperationLogModel).where(OperationLogModel.action == "import.file_preview_created")
    )
    lineage_edge = session.scalar(
        select(LineageEdgeModel).where(LineageEdgeModel.target_id == preview.id)
    )

    assert uploaded_file is not None
    assert saved_preview is not None
    assert saved_preview.uploaded_file_id == uploaded_file.id
    assert saved_preview.fields[0]["name"] == "order_id"
    assert not uploaded_file.storage_path.startswith("memory://")
    assert Path(uploaded_file.storage_path).read_bytes() == b"order_id,amount\n1,19.5\n2,42.0\n"
    assert operation_log is not None
    assert operation_log.actor_id == uploader_id
    assert operation_log.detail["uploaded_file_id"] == uploaded_file.id
    assert lineage_edge is not None
    assert lineage_edge.source_type == "uploaded_file"
    assert lineage_edge.source_id == uploaded_file.id


def test_dataset_repository_persists_dataset_fields_table_map_audit_and_lineage(tmp_path) -> None:
    session = create_test_session()
    project_id, uploader_id = create_project(session)
    import_service = ImportService(
        ImportRepository(session),
        uploader_id=uploader_id,
        storage=LocalFileStorage(str(tmp_path / "uploads")),
    )
    preview = import_service.create_file_preview(
        project_id=project_id,
        file_name="sales.csv",
        content=b"order_id,amount\n1,19.5\n2,42.0\n",
    )
    dataset_service = DatasetService(
        DatasetRepository(session),
        import_service,
        audit=AuditService(AuditRepository(session), actor_id=uploader_id),
    )

    dataset = dataset_service.create_dataset(
        DatasetCreateRequest(
            project_id=project_id,
            preview_id=preview.id,
            name="Sales Orders",
            fields=preview.fields,
        )
    )

    fields = list(
        session.scalars(
            select(DatasetFieldModel)
            .where(DatasetFieldModel.dataset_id == dataset.id)
            .order_by(DatasetFieldModel.order)
        )
    )
    table_map = session.scalar(
        select(DatasetTableMapModel).where(DatasetTableMapModel.dataset_id == dataset.id)
    )
    operation_log = session.scalar(
        select(OperationLogModel).where(OperationLogModel.action == "dataset.created")
    )
    lineage_edge = session.scalar(
        select(LineageEdgeModel).where(LineageEdgeModel.target_id == dataset.id)
    )

    assert [field.name for field in fields] == ["order_id", "amount"]
    assert table_map is not None
    assert table_map.physical_table_name == dataset.physical_table_name
    assert operation_log is not None
    assert operation_log.resource_id == dataset.id
    assert operation_log.detail["source_preview_id"] == preview.id
    assert lineage_edge is not None
    assert lineage_edge.source_type == "file_import_preview"
    assert lineage_edge.source_id == preview.id
    assert lineage_edge.target_type == "dataset"


def test_dataset_creation_materializes_physical_table_rows(tmp_path) -> None:
    session = create_test_session()
    project_id, uploader_id = create_project(session)
    import_service = ImportService(
        ImportRepository(session),
        uploader_id=uploader_id,
        storage=LocalFileStorage(str(tmp_path / "uploads")),
    )
    preview = import_service.create_file_preview(
        project_id=project_id,
        file_name="sales.csv",
        content=b"order_id,amount,order_date\n1,19.5,2026-01-01\n2,42.0,2026-01-02\n",
    )
    renamed_fields = [
        field.model_copy(update={"name": "sales_amount"}) if field.name == "amount" else field
        for field in preview.fields
    ]
    dataset_service = DatasetService(DatasetRepository(session), import_service)

    dataset = dataset_service.create_dataset(
        DatasetCreateRequest(
            project_id=project_id,
            preview_id=preview.id,
            name="Materialized Sales",
            fields=renamed_fields,
        )
    )

    table = Table(dataset.physical_table_name, MetaData(), autoload_with=session.get_bind())
    rows = [dict(row._mapping) for row in session.execute(select(table)).all()]

    assert len(rows) == 2
    assert rows[0]["order_id"] == 1
    assert rows[0]["sales_amount"] == 19.5
    assert rows[0]["order_date"].isoformat() == "2026-01-01"
    assert "_das_row_id" in rows[0]


def test_dataset_physical_table_name_is_postgresql_safe() -> None:
    table_name = build_physical_table_name("dataset_" + "a" * 64)

    assert table_name == "ds_" + "a" * 24
    assert len(table_name) <= 63


def test_dataset_creation_rejects_postgresql_unsafe_field_names(tmp_path) -> None:
    session = create_test_session()
    project_id, uploader_id = create_project(session)
    import_service = ImportService(
        ImportRepository(session),
        uploader_id=uploader_id,
        storage=LocalFileStorage(str(tmp_path / "uploads")),
    )
    preview = import_service.create_file_preview(
        project_id=project_id,
        file_name="sales.csv",
        content=b"order_id,amount\n1,19.5\n",
    )
    unsafe_fields = [
        field.model_copy(update={"name": "a" * 64}) if field.name == "order_id" else field
        for field in preview.fields
    ]
    dataset_service = DatasetService(DatasetRepository(session), import_service)

    try:
        dataset_service.create_dataset(
            DatasetCreateRequest(
                project_id=project_id,
                preview_id=preview.id,
                name="Unsafe Fields",
                fields=unsafe_fields,
            )
        )
    except AppError as exc:
        assert exc.code == "dataset_field_name_too_long"
    else:
        raise AssertionError("Expected unsafe field names to be rejected")
