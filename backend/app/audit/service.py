from app.audit.repository import AuditRepository
from app.core.ids import new_id
from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel


class AuditService:
    def __init__(
        self,
        repository: AuditRepository | None = None,
        actor_id: str | None = None,
    ) -> None:
        self.repository = repository
        self.actor_id = actor_id

    def record_operation(
        self,
        *,
        action: str,
        project_id: str | None,
        resource_type: str | None,
        resource_id: str | None,
        detail: dict[str, object] | None = None,
    ) -> None:
        if self.repository is None:
            return

        self.repository.save_operation_log(
            OperationLogModel(
                id=new_id("log"),
                project_id=project_id,
                actor_id=self.actor_id,
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                detail=detail,
            )
        )

    def record_lineage(
        self,
        *,
        project_id: str,
        source_type: str,
        source_id: str,
        target_type: str,
        target_id: str,
        transform_type: str | None = None,
        transform_id: str | None = None,
    ) -> None:
        if self.repository is None:
            return

        self.repository.save_lineage_edge(
            LineageEdgeModel(
                id=new_id("lineage"),
                project_id=project_id,
                source_type=source_type,
                source_id=source_id,
                target_type=target_type,
                target_id=target_id,
                transform_type=transform_type,
                transform_id=transform_id,
            )
        )
