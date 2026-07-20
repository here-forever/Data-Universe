from dataclasses import dataclass

from pydantic import ValidationError

from app.cleaning.schemas import CleaningExecuteRequest
from app.cleaning.service import CleaningService
from app.core.errors import AppError
from app.data_sources.schemas import ExternalSqlImportRequest, ExternalTableImportRequest
from app.data_sources.service import DataSourceService
from app.datasets.schemas import DatasetCreateRequest
from app.datasets.service import DatasetService
from app.imports.service import ImportService
from app.sql_workspace.schemas import SqlSaveDataViewRequest
from app.sql_workspace.service import SqlWorkspaceService
from app.tasks.service import Task, TaskService
from app.visualizations.schemas import ChartCreateRequest, DashboardCreateRequest
from app.visualizations.service import VisualizationService


@dataclass(frozen=True)
class RetryExecutionResult:
    original_task: Task
    retry_task: Task


class TaskRetryExecutor:
    def __init__(
        self,
        *,
        tasks: TaskService,
        imports: ImportService,
        datasets: DatasetService,
        data_sources: DataSourceService,
        cleaning: CleaningService,
        sql_workspace: SqlWorkspaceService,
        visualizations: VisualizationService,
    ) -> None:
        self.tasks = tasks
        self.imports = imports
        self.datasets = datasets
        self.data_sources = data_sources
        self.cleaning = cleaning
        self.sql_workspace = sql_workspace
        self.visualizations = visualizations

    def retry(self, task_id: str) -> RetryExecutionResult:
        original_task, retry_task = self.tasks.request_retry(task_id)
        self.tasks.mark_running(retry_task.id)

        try:
            related_resource_type, related_resource_id = self._execute(retry_task)
        except Exception as error:
            retry_task = self.tasks.mark_exception(retry_task.id, error)
            return RetryExecutionResult(
                original_task=self.tasks.get_task(original_task.id),
                retry_task=retry_task,
            )

        retry_task = self.tasks.mark_success(
            retry_task.id,
            related_resource_type=related_resource_type,
            related_resource_id=related_resource_id,
        )
        return RetryExecutionResult(
            original_task=self.tasks.get_task(original_task.id),
            retry_task=retry_task,
        )

    def _execute(self, task: Task) -> tuple[str, str]:
        payload = task.retry_payload or {}
        operation = payload.get("operation")
        if not isinstance(operation, str):
            raise AppError("Retry payload operation is missing", "task_retry_payload_invalid", 400)

        try:
            if operation == "file_preview_parse":
                uploaded_file_id = require_string(payload, "uploaded_file_id")
                preview = self.imports.create_preview_from_uploaded_file(uploaded_file_id)
                return "file_import_preview", preview.id

            if operation == "dataset_materialization":
                dataset = self.datasets.create_dataset(DatasetCreateRequest.model_validate(payload))
                return "dataset", dataset.id

            if operation == "external_table_import":
                connection_id = require_string(payload, "connection_id")
                result = self.data_sources.import_external_table(
                    connection_id,
                    ExternalTableImportRequest.model_validate(payload),
                    self.datasets,
                )
                return "dataset", result.dataset.id

            if operation == "external_sql_import":
                connection_id = require_string(payload, "connection_id")
                result = self.data_sources.import_external_sql(
                    connection_id,
                    ExternalSqlImportRequest.model_validate(payload),
                    self.datasets,
                )
                return "dataset", result.dataset.id

            if operation == "cleaning_recipe_execution":
                recipe_id = require_string(payload, "recipe_id")
                result = self.cleaning.execute_recipe(
                    recipe_id=recipe_id,
                    payload=CleaningExecuteRequest.model_validate(payload),
                )
                return "dataset", result.derived_dataset_id

            if operation == "sql_data_view_materialization":
                data_view = self.sql_workspace.save_as_data_view(
                    SqlSaveDataViewRequest.model_validate(payload)
                )
                return "data_view", data_view.id

            if operation == "chart_save":
                chart = self.visualizations.create_chart(ChartCreateRequest.model_validate(payload))
                return "chart", chart.id

            if operation == "dashboard_save":
                dashboard = self.visualizations.create_dashboard(
                    DashboardCreateRequest.model_validate(payload)
                )
                return "dashboard", dashboard.id
        except ValidationError as error:
            raise AppError(
                "Retry payload does not match the current operation schema",
                "task_retry_payload_invalid",
                400,
            ) from error

        raise AppError(
            f"Retry operation is not supported: {operation}",
            "task_retry_operation_unsupported",
            400,
        )


def require_string(payload: dict[str, object], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise AppError(f"Retry payload {key} is missing", "task_retry_payload_invalid", 400)
    return value
