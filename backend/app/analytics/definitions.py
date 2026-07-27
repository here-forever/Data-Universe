from dataclasses import dataclass, replace
from datetime import UTC, datetime

from app.analytics.repository import AnalysisDefinitionRepository
from app.analytics.schemas import (
    AnalysisDefinitionCreateRequest,
    AnalysisDefinitionResponse,
    AnalysisMaterializeRequest,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisResultType,
    AnalysisWorkspaceConfiguration,
    CorrelationResponse,
    RegressionResponse,
    StatisticsResponse,
)
from app.analytics.service import AnalyticsService
from app.audit.service import AuditService
from app.core.errors import AppError
from app.core.ids import new_id
from app.data_views.schemas import DataViewCreateRequest
from app.data_views.service import DataView, DataViewService
from app.datasets.service import Dataset, DatasetService
from app.imports.schemas import ImportFieldPreview
from app.models.analysis import AnalysisDefinition as AnalysisDefinitionModel
from app.tasks.service import TaskService


@dataclass(frozen=True)
class AnalysisDefinition:
    id: str
    project_id: str
    source_dataset_id: str
    name: str
    description: str | None
    configuration_version: int
    configuration: AnalysisWorkspaceConfiguration
    last_run_at: datetime | None
    created_at: datetime
    updated_at: datetime


@dataclass(frozen=True)
class AnalysisDefinitionRun:
    definition: AnalysisDefinition
    aggregate: AnalysisResponse
    statistics: StatisticsResponse
    correlation: CorrelationResponse | None
    regression: RegressionResponse | None


class AnalysisDefinitionService:
    def __init__(
        self,
        *,
        analytics: AnalyticsService,
        datasets: DatasetService,
        data_views: DataViewService,
        repository: AnalysisDefinitionRepository | None = None,
        audit: AuditService | None = None,
        tasks: TaskService | None = None,
    ) -> None:
        self.analytics = analytics
        self.datasets = datasets
        self.data_views = data_views
        self.repository = repository
        self.audit = audit
        self.tasks = tasks
        self._definitions: dict[str, AnalysisDefinition] = {}

    def create_definition(
        self,
        payload: AnalysisDefinitionCreateRequest,
    ) -> AnalysisDefinition:
        dataset = self.datasets.get_dataset(payload.source_dataset_id)
        if dataset.project_id != payload.project_id:
            raise AppError(
                "Analysis source dataset is outside the project",
                "analysis_dataset_project_mismatch",
                400,
            )
        normalized_name = payload.name.strip()
        self._validate_name_available(payload.project_id, normalized_name)
        self.analytics.validate_configuration(dataset, payload.configuration)

        now = datetime.now(UTC)
        definition = AnalysisDefinition(
            id=(
                new_id("analysis")
                if self.repository is not None
                else f"analysis_{len(self._definitions) + 1}"
            ),
            project_id=payload.project_id,
            source_dataset_id=payload.source_dataset_id,
            name=normalized_name,
            description=payload.description,
            configuration_version=1,
            configuration=payload.configuration,
            last_run_at=None,
            created_at=now,
            updated_at=now,
        )

        if self.repository is not None:
            definition = model_to_analysis_definition(
                self.repository.save_definition(
                    AnalysisDefinitionModel(
                        id=definition.id,
                        project_id=definition.project_id,
                        source_dataset_id=definition.source_dataset_id,
                        name=definition.name,
                        description=definition.description,
                        configuration_version=definition.configuration_version,
                        configuration=definition.configuration.model_dump(mode="json"),
                        last_run_at=None,
                    )
                )
            )
        else:
            self._definitions[definition.id] = definition

        self._record_created(definition)
        return definition

    def list_definitions(self, project_id: str) -> list[AnalysisDefinition]:
        if self.repository is not None:
            return [
                model_to_analysis_definition(model)
                for model in self.repository.list_definitions(project_id)
            ]
        return [
            definition
            for definition in self._definitions.values()
            if definition.project_id == project_id
        ]

    def get_definition(self, definition_id: str) -> AnalysisDefinition:
        if self.repository is not None:
            model = self.repository.get_definition(definition_id)
            if model is None:
                raise AppError(
                    "Analysis definition not found",
                    "analysis_definition_not_found",
                    404,
                )
            return model_to_analysis_definition(model)

        definition = self._definitions.get(definition_id)
        if definition is None:
            raise AppError(
                "Analysis definition not found",
                "analysis_definition_not_found",
                404,
            )
        return definition

    def run_definition(self, definition_id: str) -> AnalysisDefinitionRun:
        definition = self.get_definition(definition_id)
        configuration = definition.configuration
        aggregate = self.analytics.aggregate(
            definition.source_dataset_id,
            configuration.aggregate,
        )
        statistics = self.analytics.statistics(
            definition.source_dataset_id,
            configuration.statistics,
        )
        correlation = (
            self.analytics.correlation(
                definition.source_dataset_id,
                configuration.correlation,
            )
            if configuration.correlation is not None
            else None
        )
        regression = (
            self.analytics.linear_regression(
                definition.source_dataset_id,
                configuration.regression,
            )
            if configuration.regression is not None
            else None
        )
        definition = self._mark_run(definition)
        self._record_run(definition)
        return AnalysisDefinitionRun(
            definition=definition,
            aggregate=aggregate,
            statistics=statistics,
            correlation=correlation,
            regression=regression,
        )

    def materialize_result(
        self,
        definition_id: str,
        payload: AnalysisMaterializeRequest,
    ) -> DataView:
        definition = self.get_definition(definition_id)
        try:
            fields, rows = self._execute_materialized_result(
                definition,
                payload.result_type,
            )
            data_view = self.data_views.create_data_view(
                DataViewCreateRequest(
                    project_id=definition.project_id,
                    name=payload.name.strip(),
                    description=payload.description,
                    source_type="analysis_definition",
                    source_id=definition.id,
                    source_sql=None,
                    fields=fields,
                    rows=rows,
                )
            )
            definition = self._mark_run(definition)
            self._record_materialized(
                definition=definition,
                data_view=data_view,
                result_type=payload.result_type,
            )
            self._record_materialization_task(definition, data_view, payload.result_type)
            return data_view
        except Exception as error:
            self._record_materialization_failure(definition, error)
            raise

    def _execute_materialized_result(
        self,
        definition: AnalysisDefinition,
        result_type: AnalysisResultType,
    ) -> tuple[list[ImportFieldPreview], list[dict[str, object | None]]]:
        configuration = definition.configuration
        if result_type == "aggregate":
            result = self.analytics.aggregate(
                definition.source_dataset_id,
                configuration.aggregate,
            )
            dataset = self.datasets.get_dataset(definition.source_dataset_id)
            return aggregate_result_fields(dataset, configuration.aggregate), result.rows

        if result_type == "statistics_numeric":
            result = self.analytics.statistics(
                definition.source_dataset_id,
                configuration.statistics,
            )
            return numeric_statistics_fields(), [
                statistic.model_dump() for statistic in result.numeric_fields
            ]

        if result_type == "statistics_categorical":
            result = self.analytics.statistics(
                definition.source_dataset_id,
                configuration.statistics,
            )
            rows = [
                {
                    "field": statistic.field,
                    "value": value.value,
                    "count": value.count,
                    "ratio": value.ratio,
                }
                for statistic in result.categorical_fields
                for value in statistic.top_values
            ]
            return categorical_statistics_fields(), rows

        if result_type == "correlation":
            if configuration.correlation is None:
                raise AppError(
                    "Saved analysis does not include correlation configuration",
                    "analysis_result_not_configured",
                    400,
                )
            result = self.analytics.correlation(
                definition.source_dataset_id,
                configuration.correlation,
            )
            rows = [
                {
                    "field": field,
                    "related_field": related_field,
                    "correlation": result.matrix[field_index][related_index],
                }
                for field_index, field in enumerate(result.fields)
                for related_index, related_field in enumerate(result.fields)
            ]
            return correlation_fields(), rows

        if configuration.regression is None:
            raise AppError(
                "Saved analysis does not include regression configuration",
                "analysis_result_not_configured",
                400,
            )
        result = self.analytics.linear_regression(
            definition.source_dataset_id,
            configuration.regression,
        )
        return regression_fields(), [point.model_dump() for point in result.points]

    def _validate_name_available(self, project_id: str, name: str) -> None:
        if not name:
            raise AppError("Analysis name cannot be empty", "invalid_analysis_name", 400)
        if self.repository is not None:
            existing = self.repository.get_definition_by_name(
                project_id=project_id,
                name=name,
            )
        else:
            existing = next(
                (
                    item
                    for item in self._definitions.values()
                    if item.project_id == project_id and item.name == name
                ),
                None,
            )
        if existing is not None:
            raise AppError(
                "An analysis with this name already exists in the project",
                "analysis_name_conflict",
                409,
            )

    def _mark_run(self, definition: AnalysisDefinition) -> AnalysisDefinition:
        now = datetime.now(UTC)
        if self.repository is not None:
            model = self.repository.get_definition(definition.id)
            if model is None:
                raise AppError(
                    "Analysis definition not found",
                    "analysis_definition_not_found",
                    404,
                )
            return model_to_analysis_definition(self.repository.mark_run(model, last_run_at=now))
        updated = replace(definition, last_run_at=now, updated_at=now)
        self._definitions[definition.id] = updated
        return updated

    def _record_created(self, definition: AnalysisDefinition) -> None:
        if self.audit is None:
            return
        self.audit.record_operation(
            action="analysis_definition.created",
            project_id=definition.project_id,
            resource_type="analysis_definition",
            resource_id=definition.id,
            detail={
                "name": definition.name,
                "source_dataset_id": definition.source_dataset_id,
                "configuration_version": definition.configuration_version,
            },
        )
        self.audit.record_lineage(
            project_id=definition.project_id,
            source_type="dataset",
            source_id=definition.source_dataset_id,
            target_type="analysis_definition",
            target_id=definition.id,
            transform_type="saved_analysis",
            transform_id=definition.id,
        )

    def _record_run(self, definition: AnalysisDefinition) -> None:
        if self.audit is None:
            return
        self.audit.record_operation(
            action="analysis_definition.executed",
            project_id=definition.project_id,
            resource_type="analysis_definition",
            resource_id=definition.id,
            detail={"source_dataset_id": definition.source_dataset_id},
        )

    def _record_materialized(
        self,
        *,
        definition: AnalysisDefinition,
        data_view: DataView,
        result_type: AnalysisResultType,
    ) -> None:
        if self.audit is None:
            return
        self.audit.record_operation(
            action="analysis_definition.materialized",
            project_id=definition.project_id,
            resource_type="analysis_definition",
            resource_id=definition.id,
            detail={
                "data_view_id": data_view.id,
                "result_type": result_type,
                "row_count": data_view.row_count,
            },
        )

    def _record_materialization_task(
        self,
        definition: AnalysisDefinition,
        data_view: DataView,
        result_type: AnalysisResultType,
    ) -> None:
        if self.tasks is None:
            return
        self.tasks.record_success(
            project_id=definition.project_id,
            name=f"Materialized analysis result: {definition.name} ({result_type})",
            task_type="analysis_data_view_materialization",
            related_resource_type="data_view",
            related_resource_id=data_view.id,
        )

    def _record_materialization_failure(
        self,
        definition: AnalysisDefinition,
        error: Exception,
    ) -> None:
        if self.tasks is None:
            return
        self.tasks.record_exception(
            project_id=definition.project_id,
            name=f"Materialize analysis result failed: {definition.name}",
            task_type="analysis_data_view_materialization",
            error=error,
            related_resource_type="analysis_definition",
            related_resource_id=definition.id,
        )


def aggregate_result_fields(
    dataset: Dataset,
    request: AnalysisRequest,
) -> list[ImportFieldPreview]:
    source_fields = {field.name: field for field in dataset.fields}
    fields: list[ImportFieldPreview] = []
    for name in request.dimensions:
        source_field = source_fields[name]
        fields.append(
            ImportFieldPreview(
                name=name,
                inferred_type=source_field.inferred_type,
                nullable=source_field.nullable,
                order=len(fields),
            )
        )
    for metric in request.metrics:
        alias = metric.alias or f"{metric.aggregation}_{metric.field or 'rows'}"
        if metric.aggregation in {"count", "distinct_count"}:
            data_type = "integer"
        elif metric.aggregation in {"sum", "avg"}:
            data_type = "decimal"
        elif metric.field:
            data_type = source_fields[metric.field].inferred_type
        else:
            data_type = "text"
        fields.append(
            ImportFieldPreview(
                name=alias,
                inferred_type=data_type,
                nullable=True,
                order=len(fields),
            )
        )
    return fields


def numeric_statistics_fields() -> list[ImportFieldPreview]:
    return fixed_fields(
        [
            ("field", "text"),
            ("count", "integer"),
            ("null_count", "integer"),
            ("sum", "decimal"),
            ("mean", "decimal"),
            ("median", "decimal"),
            ("minimum", "decimal"),
            ("maximum", "decimal"),
            ("standard_deviation", "decimal"),
            ("percentile_25", "decimal"),
            ("percentile_75", "decimal"),
        ]
    )


def categorical_statistics_fields() -> list[ImportFieldPreview]:
    return fixed_fields(
        [
            ("field", "text"),
            ("value", "text"),
            ("count", "integer"),
            ("ratio", "decimal"),
        ]
    )


def correlation_fields() -> list[ImportFieldPreview]:
    return fixed_fields(
        [
            ("field", "text"),
            ("related_field", "text"),
            ("correlation", "decimal"),
        ]
    )


def regression_fields() -> list[ImportFieldPreview]:
    return fixed_fields(
        [
            ("feature", "decimal"),
            ("actual", "decimal"),
            ("predicted", "decimal"),
        ]
    )


def fixed_fields(definitions: list[tuple[str, str]]) -> list[ImportFieldPreview]:
    return [
        ImportFieldPreview(
            name=name,
            inferred_type=data_type,
            nullable=True,
            order=order,
        )
        for order, (name, data_type) in enumerate(definitions)
    ]


def model_to_analysis_definition(
    model: AnalysisDefinitionModel,
) -> AnalysisDefinition:
    return AnalysisDefinition(
        id=model.id,
        project_id=model.project_id,
        source_dataset_id=model.source_dataset_id,
        name=model.name,
        description=model.description,
        configuration_version=model.configuration_version,
        configuration=AnalysisWorkspaceConfiguration.model_validate(model.configuration),
        last_run_at=model.last_run_at,
        created_at=model.created_at,
        updated_at=model.updated_at,
    )


def to_analysis_definition_response(
    definition: AnalysisDefinition,
) -> AnalysisDefinitionResponse:
    return AnalysisDefinitionResponse(
        id=definition.id,
        project_id=definition.project_id,
        source_dataset_id=definition.source_dataset_id,
        name=definition.name,
        description=definition.description,
        configuration_version=definition.configuration_version,
        configuration=definition.configuration,
        last_run_at=definition.last_run_at,
        created_at=definition.created_at,
        updated_at=definition.updated_at,
    )
