from dataclasses import dataclass
from datetime import UTC, datetime

from app.audit.service import AuditService
from app.core.errors import AppError
from app.governance.repository import GovernanceRepository, resource_label
from app.governance.schemas import (
    GovernedResourceType,
    LineageDirection,
    ResourceStatus,
)


@dataclass(frozen=True)
class GovernedResource:
    resource_type: GovernedResourceType
    resource_id: str
    project_id: str
    name: str
    status: ResourceStatus
    archived_at: datetime | None
    archived_by_id: str | None
    created_at: datetime
    updated_at: datetime
    direct_dependency_count: int


@dataclass(frozen=True)
class OperationRecord:
    id: str
    project_id: str | None
    actor_id: str | None
    actor_name: str | None
    action: str
    resource_type: str | None
    resource_id: str | None
    detail: dict[str, object] | None
    created_at: datetime


@dataclass(frozen=True)
class DependencyNode:
    resource_type: str
    resource_id: str
    label: str
    status: str
    depth: int


@dataclass(frozen=True)
class DependencyEdge:
    id: str
    source_type: str
    source_id: str
    target_type: str
    target_id: str
    transform_type: str | None
    transform_id: str | None
    created_at: datetime


class GovernanceService:
    def __init__(
        self,
        repository: GovernanceRepository,
        audit: AuditService | None = None,
    ) -> None:
        self.repository = repository
        self.audit = audit or AuditService()

    def list_resources(
        self,
        *,
        project_id: str,
        status: ResourceStatus | None = None,
        resource_type: GovernedResourceType | None = None,
        search: str | None = None,
    ) -> tuple[list[GovernedResource], dict[str, int]]:
        edges = self.repository.list_lineage_edges(project_id)
        dependency_counts: dict[tuple[str, str], int] = {}
        for edge in edges:
            key = (edge.source_type, edge.source_id)
            dependency_counts[key] = dependency_counts.get(key, 0) + 1

        all_resources = [
            model_to_resource(
                item_type,
                model,
                dependency_counts.get((item_type, model.id), 0),
            )
            for item_type, model in self.repository.list_resources(project_id)
        ]
        summary = {
            "total": len(all_resources),
            "active": sum(item.status == "active" for item in all_resources),
            "archived": sum(item.status == "archived" for item in all_resources),
            "with_dependents": sum(item.direct_dependency_count > 0 for item in all_resources),
        }

        normalized_search = search.strip().lower() if search else None
        items = [
            item
            for item in all_resources
            if (status is None or item.status == status)
            and (resource_type is None or item.resource_type == resource_type)
            and (
                normalized_search is None
                or normalized_search in item.name.lower()
                or normalized_search in item.resource_id.lower()
            )
        ]
        items.sort(key=lambda item: (item.updated_at, item.resource_id), reverse=True)
        return items, summary

    def archive_resource(
        self,
        *,
        project_id: str,
        resource_type: GovernedResourceType,
        resource_id: str,
        actor_id: str,
    ) -> GovernedResource:
        model = self._get_resource(project_id, resource_type, resource_id)
        if model.archived_at is not None:
            raise AppError(
                message="Resource is already archived",
                code="resource_already_archived",
                status_code=409,
            )
        archived = self.repository.set_archive_state(
            model,
            archived_at=datetime.now(UTC),
            archived_by_id=actor_id,
        )
        result = self._resource_with_dependencies(resource_type, archived)
        self._record_archive_operation("resource.archived", result)
        return result

    def restore_resource(
        self,
        *,
        project_id: str,
        resource_type: GovernedResourceType,
        resource_id: str,
    ) -> GovernedResource:
        model = self._get_resource(project_id, resource_type, resource_id)
        if model.archived_at is None:
            raise AppError(
                message="Resource is already active",
                code="resource_already_active",
                status_code=409,
            )
        restored = self.repository.set_archive_state(
            model,
            archived_at=None,
            archived_by_id=None,
        )
        result = self._resource_with_dependencies(resource_type, restored)
        self._record_archive_operation("resource.restored", result)
        return result

    def list_operations(
        self,
        *,
        project_id: str,
        action: str | None,
        resource_type: str | None,
        search: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[OperationRecord], int]:
        logs, total = self.repository.list_operation_logs(
            project_id=project_id,
            action=action,
            resource_type=resource_type,
            search=search,
            offset=offset,
            limit=limit,
        )
        actor_names = self.repository.get_actor_names(
            {log.actor_id for log in logs if log.actor_id is not None}
        )
        return [
            OperationRecord(
                id=log.id,
                project_id=log.project_id,
                actor_id=log.actor_id,
                actor_name=actor_names.get(log.actor_id) if log.actor_id else None,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                detail=log.detail,
                created_at=log.created_at,
            )
            for log in logs
        ], total

    def focused_lineage(
        self,
        *,
        project_id: str,
        resource_type: GovernedResourceType,
        resource_id: str,
        direction: LineageDirection,
        max_depth: int,
    ) -> tuple[DependencyNode, list[DependencyNode], list[DependencyEdge]]:
        self._get_resource(project_id, resource_type, resource_id)
        all_edges = self.repository.list_lineage_edges(project_id)
        root_key = (resource_type, resource_id)
        depths: dict[tuple[str, str], int] = {root_key: 0}
        frontier = {root_key}
        selected_edge_ids: set[str] = set()

        for depth in range(1, max_depth + 1):
            next_frontier: set[tuple[str, str]] = set()
            for edge in all_edges:
                source_key = (edge.source_type, edge.source_id)
                target_key = (edge.target_type, edge.target_id)
                if direction in {"downstream", "both"} and source_key in frontier:
                    selected_edge_ids.add(edge.id)
                    next_frontier.add(target_key)
                if direction in {"upstream", "both"} and target_key in frontier:
                    selected_edge_ids.add(edge.id)
                    next_frontier.add(source_key)
            next_frontier -= depths.keys()
            if not next_frontier:
                break
            for key in next_frontier:
                depths[key] = depth
            frontier = next_frontier

        selected_edges = [edge for edge in all_edges if edge.id in selected_edge_ids]
        labels = self.repository.resolve_lineage_labels(project_id, set(depths))
        nodes = [
            DependencyNode(
                resource_type=key[0],
                resource_id=key[1],
                label=labels.get(key, (fallback_label(*key), "reference"))[0],
                status=labels.get(key, ("", "reference"))[1],
                depth=depth,
            )
            for key, depth in depths.items()
        ]
        nodes.sort(key=lambda node: (node.depth, node.resource_type, node.label))
        root = next(node for node in nodes if node.depth == 0)
        return root, nodes, [model_to_dependency_edge(edge) for edge in selected_edges]

    def _get_resource(
        self,
        project_id: str,
        resource_type: GovernedResourceType,
        resource_id: str,
    ):
        model = self.repository.get_resource(
            project_id=project_id,
            resource_type=resource_type,
            resource_id=resource_id,
        )
        if model is None:
            raise AppError(
                message="Governed resource not found",
                code="governed_resource_not_found",
                status_code=404,
            )
        return model

    def _resource_with_dependencies(
        self,
        resource_type: GovernedResourceType,
        model,
    ) -> GovernedResource:
        count = sum(
            edge.source_type == resource_type and edge.source_id == model.id
            for edge in self.repository.list_lineage_edges(model.project_id)
        )
        return model_to_resource(resource_type, model, count)

    def _record_archive_operation(self, action: str, resource: GovernedResource) -> None:
        self.audit.record_operation(
            action=action,
            project_id=resource.project_id,
            resource_type=resource.resource_type,
            resource_id=resource.resource_id,
            detail={
                "name": resource.name,
                "status": resource.status,
                "direct_dependency_count": resource.direct_dependency_count,
            },
        )


def model_to_resource(
    resource_type: GovernedResourceType,
    model,
    dependency_count: int,
) -> GovernedResource:
    return GovernedResource(
        resource_type=resource_type,
        resource_id=model.id,
        project_id=model.project_id,
        name=resource_label(resource_type, model),
        status="archived" if model.archived_at is not None else "active",
        archived_at=model.archived_at,
        archived_by_id=model.archived_by_id,
        created_at=model.created_at,
        updated_at=model.updated_at,
        direct_dependency_count=dependency_count,
    )


def model_to_dependency_edge(edge) -> DependencyEdge:
    return DependencyEdge(
        id=edge.id,
        source_type=edge.source_type,
        source_id=edge.source_id,
        target_type=edge.target_type,
        target_id=edge.target_id,
        transform_type=edge.transform_type,
        transform_id=edge.transform_id,
        created_at=edge.created_at,
    )


def fallback_label(resource_type: str, resource_id: str) -> str:
    readable_type = resource_type.replace("_", " ").title()
    return f"{readable_type} · {resource_id}"
