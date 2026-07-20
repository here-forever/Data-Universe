from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.auth.repository import AuthRepository
from app.auth.service import AuthService
from app.core.database import Base, import_models
from app.models.permission import ResourcePermission as ResourcePermissionModel
from app.models.project import Project as ProjectModel
from app.models.project import ProjectMember as ProjectMemberModel
from app.permissions.repository import PermissionRepository
from app.permissions.schemas import ResourcePermissionCreateRequest
from app.permissions.service import PermissionService
from app.projects.repository import ProjectRepository
from app.projects.service import ProjectService


def create_test_session() -> Session:
    import_models()
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    return session_factory()


def test_auth_repository_bootstraps_admin_and_authenticates() -> None:
    session = create_test_session()
    service = AuthService(AuthRepository(session))

    token = service.authenticate("admin@example.com", "admin123")
    user = service.get_user_by_token(token)

    assert user.email == "admin@example.com"
    assert user.is_platform_admin is True


def test_project_repository_persists_project_and_member() -> None:
    session = create_test_session()
    auth_service = AuthService(AuthRepository(session))
    project_service = ProjectService(ProjectRepository(session), auth_service)
    owner = auth_service.get_or_create_default_admin()

    project = project_service.create_project(
        name="Persistent Project",
        description="Stored in SQLAlchemy",
        owner=owner,
    )
    member_user, role = project_service.add_member(
        project_id=project.id,
        email="analyst@example.com",
        role="editor",
    )

    assert session.scalar(select(ProjectModel).where(ProjectModel.id == project.id)) is not None
    assert session.scalar(
        select(ProjectMemberModel).where(ProjectMemberModel.user_id == member_user.id)
    )
    assert role == "editor"


def test_permission_repository_persists_resource_permissions() -> None:
    session = create_test_session()
    auth_service = AuthService(AuthRepository(session))
    project_service = ProjectService(ProjectRepository(session), auth_service)
    permission_service = PermissionService(PermissionRepository(session))
    owner = auth_service.get_or_create_default_admin()
    project = project_service.create_project(name="Permissions", description=None, owner=owner)

    permission = permission_service.create_from_request(
        ResourcePermissionCreateRequest(
            project_id=project.id,
            resource_type="dataset",
            resource_id="ds_sales",
            principal_type="project_role",
            principal_id="viewer",
            actions=["view", "export"],
        )
    )

    saved = session.scalar(
        select(ResourcePermissionModel).where(ResourcePermissionModel.id == permission.id)
    )

    assert saved is not None
    assert saved.actions == ["view", "export"]
