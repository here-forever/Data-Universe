from dataclasses import dataclass
from datetime import UTC, datetime

from app.core.errors import AppError
from app.core.ids import new_id
from app.models.task import Task as TaskModel
from app.tasks.repository import TaskRepository
from app.tasks.schemas import TaskResponse, TaskStatus

_UNSET = object()


@dataclass(frozen=True)
class Task:
    id: str
    project_id: str | None
    initiator_id: str | None
    name: str
    task_type: str
    status: TaskStatus
    progress: int
    error_message: str | None
    related_resource_type: str | None
    related_resource_id: str | None
    retry_payload: dict[str, object] | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class TaskService:
    def __init__(
        self,
        repository: TaskRepository | None = None,
        initiator_id: str | None = None,
    ) -> None:
        self.repository = repository
        self.initiator_id = initiator_id
        self._tasks: dict[str, Task] = {}

    def reset(self) -> None:
        self._tasks = {}

    def record_success(
        self,
        *,
        project_id: str | None,
        name: str,
        task_type: str,
        related_resource_type: str | None = None,
        related_resource_id: str | None = None,
        retry_payload: dict[str, object] | None = None,
    ) -> Task:
        now = datetime.now(UTC)
        return self._save_task(
            Task(
                id=self._new_task_id(),
                project_id=project_id,
                initiator_id=self.initiator_id,
                name=name,
                task_type=task_type,
                status="success",
                progress=100,
                error_message=None,
                related_resource_type=related_resource_type,
                related_resource_id=related_resource_id,
                retry_payload=retry_payload,
                started_at=now,
                finished_at=now,
                created_at=now,
                updated_at=now,
            )
        )

    def record_failure(
        self,
        *,
        project_id: str | None,
        name: str,
        task_type: str,
        error_message: str,
        related_resource_type: str | None = None,
        related_resource_id: str | None = None,
        retryable: bool = False,
        retry_payload: dict[str, object] | None = None,
    ) -> Task:
        now = datetime.now(UTC)
        return self._save_task(
            Task(
                id=self._new_task_id(),
                project_id=project_id,
                initiator_id=self.initiator_id,
                name=name,
                task_type=task_type,
                status="retryable" if retryable else "failed",
                progress=100,
                error_message=error_message,
                related_resource_type=related_resource_type,
                related_resource_id=related_resource_id,
                retry_payload=retry_payload,
                started_at=now,
                finished_at=now,
                created_at=now,
                updated_at=now,
            )
        )

    def record_retryable_failure(
        self,
        *,
        project_id: str | None,
        name: str,
        task_type: str,
        error_message: str,
        related_resource_type: str | None = None,
        related_resource_id: str | None = None,
        retry_payload: dict[str, object] | None = None,
    ) -> Task:
        return self.record_failure(
            project_id=project_id,
            name=name,
            task_type=task_type,
            error_message=error_message,
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
            retry_payload=retry_payload,
            retryable=True,
        )

    def record_exception(
        self,
        *,
        project_id: str | None,
        name: str,
        task_type: str,
        error: Exception,
        related_resource_type: str | None = None,
        related_resource_id: str | None = None,
        retry_payload: dict[str, object] | None = None,
    ) -> Task:
        return self.record_failure(
            project_id=project_id,
            name=name,
            task_type=task_type,
            error_message=task_error_message(error),
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
            retry_payload=retry_payload,
            retryable=is_retryable_error(error),
        )

    def list_tasks(self, project_id: str | None = None) -> list[Task]:
        if self.repository is not None:
            return [model_to_task(task) for task in self.repository.list_tasks(project_id)]

        tasks = list(self._tasks.values())
        if project_id:
            tasks = [task for task in tasks if task.project_id == project_id]
        return sorted(tasks, key=lambda task: task.created_at, reverse=True)

    def request_retry(self, task_id: str) -> tuple[Task, Task]:
        task = self.get_task(task_id)
        if task.status not in ("failed", "retryable"):
            raise AppError(
                "Only failed or retryable tasks can be retried",
                "task_not_retryable",
                400,
            )
        if not task.retry_payload:
            raise AppError(
                "This task does not have retry metadata",
                "task_retry_payload_missing",
                400,
            )

        retry_task = self._save_task(
            Task(
                id=self._new_task_id(),
                project_id=task.project_id,
                initiator_id=self.initiator_id,
                name=f"Retry requested: {task.name}",
                task_type=task.task_type,
                status="pending",
                progress=0,
                error_message=None,
                related_resource_type=task.related_resource_type,
                related_resource_id=task.related_resource_id,
                retry_payload=task.retry_payload,
                started_at=None,
                finished_at=None,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        original_task = self._mark_retry_requested(task, retry_task_id=retry_task.id)
        return original_task, retry_task

    def get_task(self, task_id: str) -> Task:
        if self.repository is not None:
            task = self.repository.get_task(task_id)
            if task is None:
                raise AppError("Task not found", "task_not_found", 404)
            return model_to_task(task)

        task = self._tasks.get(task_id)
        if task is None:
            raise AppError("Task not found", "task_not_found", 404)
        return task

    def _new_task_id(self) -> str:
        if self.repository is not None:
            return new_id("task")
        return f"task_{len(self._tasks) + 1}"

    def _save_task(self, task: Task) -> Task:
        if self.repository is not None:
            return model_to_task(
                self.repository.save_task(
                    TaskModel(
                        id=task.id,
                        project_id=task.project_id,
                        initiator_id=task.initiator_id,
                        name=task.name,
                        task_type=task.task_type,
                        status=task.status,
                        progress=task.progress,
                        error_message=task.error_message,
                        related_resource_type=task.related_resource_type,
                        related_resource_id=task.related_resource_id,
                        retry_payload=task.retry_payload,
                        started_at=task.started_at,
                        finished_at=task.finished_at,
                    )
                )
            )

        self._tasks[task.id] = task
        return task

    def _mark_retry_requested(self, task: Task, *, retry_task_id: str) -> Task:
        retry_message = f"Retry requested as {retry_task_id}"
        if task.error_message:
            retry_message = f"{task.error_message} | {retry_message}"

        if self.repository is not None:
            model = self.repository.get_task(task.id)
            if model is None:
                raise AppError("Task not found", "task_not_found", 404)
            model.status = "retryable"
            model.error_message = retry_message
            model.updated_at = datetime.now(UTC)
            return model_to_task(self.repository.update_task(model))

        updated = Task(
            id=task.id,
            project_id=task.project_id,
            initiator_id=task.initiator_id,
            name=task.name,
            task_type=task.task_type,
            status="retryable",
            progress=task.progress,
            error_message=retry_message,
            related_resource_type=task.related_resource_type,
            related_resource_id=task.related_resource_id,
            retry_payload=task.retry_payload,
            started_at=task.started_at,
            finished_at=task.finished_at,
            created_at=task.created_at,
            updated_at=datetime.now(UTC),
        )
        self._tasks[task.id] = updated
        return updated

    def mark_running(self, task_id: str) -> Task:
        now = datetime.now(UTC)
        return self._update_task(
            task_id=task_id,
            status="running",
            progress=10,
            error_message=None,
            started_at=now,
            finished_at=None,
        )

    def mark_success(
        self,
        task_id: str,
        *,
        related_resource_type: str | None = None,
        related_resource_id: str | None = None,
    ) -> Task:
        return self._update_task(
            task_id=task_id,
            status="success",
            progress=100,
            error_message=None,
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
            finished_at=datetime.now(UTC),
        )

    def mark_exception(self, task_id: str, error: Exception) -> Task:
        return self._update_task(
            task_id=task_id,
            status="retryable" if is_retryable_error(error) else "failed",
            progress=100,
            error_message=task_error_message(error),
            finished_at=datetime.now(UTC),
        )

    def _update_task(
        self,
        *,
        task_id: str,
        status: TaskStatus,
        progress: int,
        error_message: str | None,
        related_resource_type: str | None | object = _UNSET,
        related_resource_id: str | None | object = _UNSET,
        started_at: datetime | None | object = _UNSET,
        finished_at: datetime | None | object = _UNSET,
    ) -> Task:
        task = self.get_task(task_id)
        updated = Task(
            id=task.id,
            project_id=task.project_id,
            initiator_id=task.initiator_id,
            name=task.name,
            task_type=task.task_type,
            status=status,
            progress=progress,
            error_message=error_message,
            related_resource_type=(
                task.related_resource_type
                if related_resource_type is _UNSET
                else related_resource_type
            ),
            related_resource_id=(
                task.related_resource_id if related_resource_id is _UNSET else related_resource_id
            ),
            retry_payload=task.retry_payload,
            started_at=task.started_at if started_at is _UNSET else started_at,
            finished_at=task.finished_at if finished_at is _UNSET else finished_at,
            created_at=task.created_at,
            updated_at=datetime.now(UTC),
        )

        if self.repository is not None:
            model = self.repository.get_task(task_id)
            if model is None:
                raise AppError("Task not found", "task_not_found", 404)
            model.status = updated.status
            model.progress = updated.progress
            model.error_message = updated.error_message
            model.related_resource_type = updated.related_resource_type
            model.related_resource_id = updated.related_resource_id
            model.started_at = updated.started_at
            model.finished_at = updated.finished_at
            model.updated_at = updated.updated_at
            return model_to_task(self.repository.update_task(model))

        self._tasks[task_id] = updated
        return updated


def model_to_task(task: TaskModel) -> Task:
    return Task(
        id=task.id,
        project_id=task.project_id,
        initiator_id=task.initiator_id,
        name=task.name,
        task_type=task.task_type,
        status=task.status,
        progress=task.progress,
        error_message=task.error_message,
        related_resource_type=task.related_resource_type,
        related_resource_id=task.related_resource_id,
        retry_payload=task.retry_payload,
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def to_task_response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        project_id=task.project_id,
        initiator_id=task.initiator_id,
        name=task.name,
        task_type=task.task_type,
        status=task.status,
        progress=task.progress,
        error_message=task.error_message,
        related_resource_type=task.related_resource_type,
        related_resource_id=task.related_resource_id,
        can_retry=bool(task.retry_payload) and task.status in ("failed", "retryable"),
        started_at=task.started_at,
        finished_at=task.finished_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def is_retryable_error(error: Exception) -> bool:
    return not isinstance(error, AppError)


def task_error_message(error: Exception) -> str:
    if isinstance(error, AppError):
        return error.message
    return str(error) or error.__class__.__name__


task_service = TaskService()
