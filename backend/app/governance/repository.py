from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.governance.schemas import GovernedResourceType
from app.models.analysis import AnalysisDefinition
from app.models.audit import LineageEdge, OperationLog
from app.models.cleaning import CleaningRecipe
from app.models.data_view import ChartDefinition, DashboardDefinition, DataView, ReportExport
from app.models.dataset import Dataset
from app.models.imports import FileImportPreview, UploadedFile
from app.models.user import User


@dataclass(frozen=True)
class ResourceModelSpec:
    model: type[Any]
    label_attribute: str


GOVERNED_RESOURCE_SPECS: dict[GovernedResourceType, ResourceModelSpec] = {
    "dataset": ResourceModelSpec(Dataset, "name"),
    "data_view": ResourceModelSpec(DataView, "name"),
    "analysis_definition": ResourceModelSpec(AnalysisDefinition, "name"),
    "cleaning_recipe": ResourceModelSpec(CleaningRecipe, "name"),
    "chart": ResourceModelSpec(ChartDefinition, "name"),
    "dashboard": ResourceModelSpec(DashboardDefinition, "name"),
}

LINEAGE_LABEL_SPECS: dict[str, ResourceModelSpec] = {
    **GOVERNED_RESOURCE_SPECS,
    "uploaded_file": ResourceModelSpec(UploadedFile, "file_name"),
    "file_import_preview": ResourceModelSpec(FileImportPreview, "file_name"),
    "report_export": ResourceModelSpec(ReportExport, "file_name"),
}


class GovernanceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_resources(self, project_id: str) -> list[tuple[GovernedResourceType, Any]]:
        resources: list[tuple[GovernedResourceType, Any]] = []
        for resource_type, spec in GOVERNED_RESOURCE_SPECS.items():
            models = self.session.scalars(
                select(spec.model).where(spec.model.project_id == project_id)
            ).all()
            resources.extend((resource_type, model) for model in models)
        return resources

    def get_resource(
        self,
        *,
        project_id: str,
        resource_type: GovernedResourceType,
        resource_id: str,
    ) -> Any | None:
        spec = GOVERNED_RESOURCE_SPECS[resource_type]
        return self.session.scalar(
            select(spec.model).where(
                spec.model.id == resource_id,
                spec.model.project_id == project_id,
            )
        )

    def set_archive_state(
        self,
        resource: Any,
        *,
        archived_at: datetime | None,
        archived_by_id: str | None,
    ) -> Any:
        resource.archived_at = archived_at
        resource.archived_by_id = archived_by_id
        self.session.add(resource)
        self.session.commit()
        self.session.refresh(resource)
        return resource

    def list_operation_logs(
        self,
        *,
        project_id: str,
        action: str | None,
        resource_type: str | None,
        search: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[OperationLog], int]:
        filters = [OperationLog.project_id == project_id]
        if action:
            filters.append(OperationLog.action == action)
        if resource_type:
            filters.append(OperationLog.resource_type == resource_type)
        if search:
            pattern = f"%{search.strip()}%"
            filters.append(
                or_(
                    OperationLog.action.ilike(pattern),
                    OperationLog.resource_id.ilike(pattern),
                )
            )

        statement = select(OperationLog).where(*filters)
        items = list(
            self.session.scalars(
                statement.order_by(OperationLog.created_at.desc()).offset(offset).limit(limit)
            )
        )
        total = self.session.scalar(select(func.count()).select_from(OperationLog).where(*filters))
        return items, int(total or 0)

    def list_lineage_edges(self, project_id: str) -> list[LineageEdge]:
        return list(
            self.session.scalars(
                select(LineageEdge)
                .where(LineageEdge.project_id == project_id)
                .order_by(LineageEdge.created_at, LineageEdge.id)
            )
        )

    def get_actor_names(self, actor_ids: set[str]) -> dict[str, str]:
        if not actor_ids:
            return {}
        users = self.session.scalars(select(User).where(User.id.in_(actor_ids))).all()
        return {user.id: user.display_name for user in users}

    def resolve_lineage_labels(
        self,
        project_id: str,
        keys: set[tuple[str, str]],
    ) -> dict[tuple[str, str], tuple[str, str]]:
        resolved: dict[tuple[str, str], tuple[str, str]] = {}
        keys_by_type: dict[str, set[str]] = {}
        for resource_type, resource_id in keys:
            keys_by_type.setdefault(resource_type, set()).add(resource_id)

        for resource_type, resource_ids in keys_by_type.items():
            spec = LINEAGE_LABEL_SPECS.get(resource_type)
            if spec is None:
                continue
            statement = select(spec.model).where(spec.model.id.in_(resource_ids))
            if hasattr(spec.model, "project_id"):
                statement = statement.where(spec.model.project_id == project_id)
            for model in self.session.scalars(statement):
                status = "archived" if getattr(model, "archived_at", None) is not None else "active"
                resolved[(resource_type, model.id)] = (
                    str(getattr(model, spec.label_attribute)),
                    status,
                )
        return resolved


def resource_label(resource_type: GovernedResourceType, model: Any) -> str:
    return str(getattr(model, GOVERNED_RESOURCE_SPECS[resource_type].label_attribute))
