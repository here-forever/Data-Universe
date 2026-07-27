from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from datetime import date, datetime
from statistics import fmean, median, pstdev

from app.analytics.schemas import (
    AnalysisFilter,
    AnalysisMetric,
    AnalysisRequest,
    AnalysisResponse,
    AnalysisWorkspaceConfiguration,
    CategoricalStatistics,
    CategoryValueCount,
    CorrelationRequest,
    CorrelationResponse,
    NumericStatistics,
    RegressionPoint,
    RegressionRequest,
    RegressionResponse,
    StatisticsRequest,
    StatisticsResponse,
)
from app.audit.service import AuditService
from app.core.errors import AppError
from app.datasets.service import Dataset, DatasetService

MAX_ANALYSIS_ROWS = 250_000
NUMERIC_FIELD_TYPES = {"integer", "decimal"}
SAFE_ALIAS_PATTERN = re.compile(r"^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_\u4e00-\u9fff -]{0,119}$")


class AnalyticsService:
    def __init__(
        self,
        datasets: DatasetService,
        audit: AuditService | None = None,
    ) -> None:
        self.datasets = datasets
        self.audit = audit

    def validate_configuration(
        self,
        dataset: Dataset,
        configuration: AnalysisWorkspaceConfiguration,
    ) -> None:
        field_types = self._field_types(dataset)
        dimensions = self._validate_fields(configuration.aggregate.dimensions, field_types)
        metrics = self._validate_metrics(configuration.aggregate.metrics, field_types)
        result_columns = [*dimensions, *(alias for _, alias in metrics)]
        sort_by = configuration.aggregate.sort_by or metrics[0][1]
        if sort_by not in result_columns:
            raise AppError("Sort field is not part of the result", "invalid_analysis_sort", 400)
        self._validate_filters(configuration.aggregate.filters, field_types)

        statistics_fields = configuration.statistics.fields or list(field_types)
        self._validate_fields(statistics_fields, field_types)
        self._validate_filters(configuration.statistics.filters, field_types)
        if configuration.correlation is not None:
            self._validate_numeric_fields(configuration.correlation.fields, field_types)
            self._validate_filters(configuration.correlation.filters, field_types)
        if configuration.regression is not None:
            self._validate_numeric_fields(
                [configuration.regression.feature, configuration.regression.target],
                field_types,
            )
            self._validate_filters(configuration.regression.filters, field_types)

    def aggregate(self, dataset_id: str, payload: AnalysisRequest) -> AnalysisResponse:
        dataset, rows = self._load_dataset_rows(dataset_id)
        field_types = self._field_types(dataset)
        dimensions = self._validate_fields(payload.dimensions, field_types)
        metrics = self._validate_metrics(payload.metrics, field_types)
        filtered_rows = self._apply_filters(rows, payload.filters, field_types)

        grouped_rows: dict[tuple[object | None, ...], list[dict[str, object | None]]]
        if dimensions:
            grouped_rows = defaultdict(list)
            for row in filtered_rows:
                grouped_rows[tuple(row.get(field) for field in dimensions)].append(row)
        else:
            grouped_rows = {(): filtered_rows}

        result_rows: list[dict[str, object | None]] = []
        for key, group in grouped_rows.items():
            result: dict[str, object | None] = {
                dimension: serialize_value(key[index]) for index, dimension in enumerate(dimensions)
            }
            for metric, alias in metrics:
                result[alias] = calculate_metric(group, metric)
            result_rows.append(result)

        columns = [*dimensions, *(alias for _, alias in metrics)]
        sort_by = payload.sort_by or metrics[0][1]
        if sort_by not in columns:
            raise AppError("Sort field is not part of the result", "invalid_analysis_sort", 400)
        result_rows.sort(
            key=lambda item: sortable_value(item.get(sort_by)),
            reverse=payload.sort_direction == "desc",
        )
        limited_rows = result_rows[: payload.limit]
        self._record_operation(
            action="analysis.aggregated",
            dataset=dataset,
            detail={
                "dimensions": dimensions,
                "metrics": [alias for _, alias in metrics],
                "filter_count": len(payload.filters),
                "result_count": len(limited_rows),
            },
        )
        return AnalysisResponse(
            dataset_id=dataset.id,
            dataset_name=dataset.name,
            source_row_count=dataset.row_count,
            filtered_row_count=len(filtered_rows),
            total_groups=len(result_rows),
            columns=columns,
            rows=limited_rows,
        )

    def statistics(self, dataset_id: str, payload: StatisticsRequest) -> StatisticsResponse:
        dataset, rows = self._load_dataset_rows(dataset_id)
        field_types = self._field_types(dataset)
        requested_fields = payload.fields or list(field_types)
        fields = self._validate_fields(requested_fields, field_types)
        filtered_rows = self._apply_filters(rows, payload.filters, field_types)
        numeric_fields: list[NumericStatistics] = []
        categorical_fields: list[CategoricalStatistics] = []

        for field in fields:
            values = [row.get(field) for row in filtered_rows]
            non_null_values = [value for value in values if not is_null(value)]
            if field_types[field] in NUMERIC_FIELD_TYPES:
                numeric_values = [
                    number for value in non_null_values if (number := to_float(value)) is not None
                ]
                if numeric_values:
                    sorted_values = sorted(numeric_values)
                    numeric_fields.append(
                        NumericStatistics(
                            field=field,
                            count=len(numeric_values),
                            null_count=len(values) - len(numeric_values),
                            sum=round(sum(numeric_values), 6),
                            mean=round(fmean(numeric_values), 6),
                            median=round(float(median(numeric_values)), 6),
                            minimum=round(min(numeric_values), 6),
                            maximum=round(max(numeric_values), 6),
                            standard_deviation=round(pstdev(numeric_values), 6),
                            percentile_25=round(percentile(sorted_values, 0.25), 6),
                            percentile_75=round(percentile(sorted_values, 0.75), 6),
                        )
                    )
                continue

            counts = Counter(display_value(value) for value in non_null_values)
            categorical_fields.append(
                CategoricalStatistics(
                    field=field,
                    count=len(non_null_values),
                    null_count=len(values) - len(non_null_values),
                    distinct_count=len(counts),
                    top_values=[
                        CategoryValueCount(
                            value=value,
                            count=count,
                            ratio=round(count / len(non_null_values), 4) if non_null_values else 0,
                        )
                        for value, count in counts.most_common(8)
                    ],
                )
            )

        self._record_operation(
            action="analysis.statistics_calculated",
            dataset=dataset,
            detail={"fields": fields, "filter_count": len(payload.filters)},
        )
        return StatisticsResponse(
            dataset_id=dataset.id,
            source_row_count=dataset.row_count,
            filtered_row_count=len(filtered_rows),
            numeric_fields=numeric_fields,
            categorical_fields=categorical_fields,
        )

    def correlation(
        self,
        dataset_id: str,
        payload: CorrelationRequest,
    ) -> CorrelationResponse:
        dataset, rows = self._load_dataset_rows(dataset_id)
        field_types = self._field_types(dataset)
        fields = self._validate_numeric_fields(payload.fields, field_types)
        filtered_rows = self._apply_filters(rows, payload.filters, field_types)
        observations = [[to_float(row.get(field)) for field in fields] for row in filtered_rows]
        complete = [row for row in observations if all(value is not None for value in row)]
        matrix: list[list[float | None]] = []
        for left_index in range(len(fields)):
            matrix_row: list[float | None] = []
            for right_index in range(len(fields)):
                left = [float(row[left_index]) for row in complete]
                right = [float(row[right_index]) for row in complete]
                matrix_row.append(pearson_correlation(left, right))
            matrix.append(matrix_row)

        self._record_operation(
            action="analysis.correlation_calculated",
            dataset=dataset,
            detail={"fields": fields, "observations": len(complete)},
        )
        return CorrelationResponse(
            dataset_id=dataset.id,
            fields=fields,
            observations=len(complete),
            matrix=matrix,
        )

    def linear_regression(
        self,
        dataset_id: str,
        payload: RegressionRequest,
    ) -> RegressionResponse:
        dataset, rows = self._load_dataset_rows(dataset_id)
        field_types = self._field_types(dataset)
        self._validate_numeric_fields([payload.feature, payload.target], field_types)
        filtered_rows = self._apply_filters(rows, payload.filters, field_types)
        pairs = [
            (feature, target)
            for row in filtered_rows
            if (feature := to_float(row.get(payload.feature))) is not None
            and (target := to_float(row.get(payload.target))) is not None
        ]
        if len(pairs) < 2:
            raise AppError(
                "Linear regression requires at least two complete observations",
                "insufficient_regression_data",
                400,
            )
        features = [pair[0] for pair in pairs]
        targets = [pair[1] for pair in pairs]
        feature_mean = fmean(features)
        target_mean = fmean(targets)
        denominator = sum((value - feature_mean) ** 2 for value in features)
        if denominator == 0:
            raise AppError(
                "Regression feature must contain at least two distinct values",
                "constant_regression_feature",
                400,
            )
        slope = (
            sum((feature - feature_mean) * (target - target_mean) for feature, target in pairs)
            / denominator
        )
        intercept = target_mean - slope * feature_mean
        predictions = [intercept + slope * value for value in features]
        residual_sum = sum(
            (actual - predicted) ** 2
            for actual, predicted in zip(targets, predictions, strict=True)
        )
        total_sum = sum((actual - target_mean) ** 2 for actual in targets)
        r_squared = 1 - residual_sum / total_sum if total_sum else 1.0
        rmse = math.sqrt(residual_sum / len(pairs))
        ordered_points = sorted(
            (
                RegressionPoint(
                    feature=round(feature, 6),
                    actual=round(target, 6),
                    predicted=round(intercept + slope * feature, 6),
                )
                for feature, target in pairs
            ),
            key=lambda point: point.feature,
        )[:200]

        self._record_operation(
            action="analysis.linear_regression_calculated",
            dataset=dataset,
            detail={
                "feature": payload.feature,
                "target": payload.target,
                "observations": len(pairs),
            },
        )
        return RegressionResponse(
            dataset_id=dataset.id,
            feature=payload.feature,
            target=payload.target,
            observations=len(pairs),
            slope=round(slope, 6),
            intercept=round(intercept, 6),
            r_squared=round(r_squared, 6),
            rmse=round(rmse, 6),
            points=ordered_points,
        )

    def record_export(self, dataset_id: str, result: AnalysisResponse, file_format: str) -> None:
        dataset = self.datasets.get_dataset(dataset_id)
        self._record_operation(
            action="analysis.exported",
            dataset=dataset,
            detail={
                "format": file_format,
                "row_count": len(result.rows),
                "columns": result.columns,
            },
        )

    def _load_dataset_rows(
        self,
        dataset_id: str,
    ) -> tuple[Dataset, list[dict[str, object | None]]]:
        dataset, rows = self.datasets.list_dataset_rows(dataset_id)
        if dataset.row_count > MAX_ANALYSIS_ROWS:
            raise AppError(
                f"Interactive analysis supports up to {MAX_ANALYSIS_ROWS:,} rows per dataset",
                "analysis_row_limit_exceeded",
                413,
            )
        return dataset, rows

    def _field_types(self, dataset: Dataset) -> dict[str, str]:
        return {field.name: field.inferred_type for field in dataset.fields}

    def _validate_fields(
        self,
        fields: list[str],
        field_types: dict[str, str],
    ) -> list[str]:
        normalized: list[str] = []
        for field in fields:
            if field not in field_types:
                raise AppError(
                    f"Dataset field not found: {field}",
                    "analysis_field_not_found",
                    400,
                )
            if field not in normalized:
                normalized.append(field)
        return normalized

    def _validate_numeric_fields(
        self,
        fields: list[str],
        field_types: dict[str, str],
    ) -> list[str]:
        validated = self._validate_fields(fields, field_types)
        for field in validated:
            if field_types[field] not in NUMERIC_FIELD_TYPES:
                raise AppError(
                    f"Numeric analysis requires a numeric field: {field}",
                    "analysis_numeric_field_required",
                    400,
                )
        return validated

    def _validate_metrics(
        self,
        metrics: list[AnalysisMetric],
        field_types: dict[str, str],
    ) -> list[tuple[AnalysisMetric, str]]:
        validated: list[tuple[AnalysisMetric, str]] = []
        aliases: set[str] = set()
        for metric in metrics:
            if metric.field:
                self._validate_fields([metric.field], field_types)
            if metric.aggregation in {"sum", "avg"}:
                self._validate_numeric_fields([str(metric.field)], field_types)
            alias = metric.alias or f"{metric.aggregation}_{metric.field or 'rows'}"
            if not SAFE_ALIAS_PATTERN.fullmatch(alias):
                raise AppError("Metric alias is invalid", "invalid_metric_alias", 400)
            if alias in aliases:
                raise AppError("Metric aliases must be unique", "duplicate_metric_alias", 400)
            aliases.add(alias)
            validated.append((metric, alias))
        return validated

    def _apply_filters(
        self,
        rows: list[dict[str, object | None]],
        filters: list[AnalysisFilter],
        field_types: dict[str, str],
    ) -> list[dict[str, object | None]]:
        self._validate_filters(filters, field_types)
        return [
            row
            for row in rows
            if all(matches_filter(row.get(item.field), item) for item in filters)
        ]

    def _validate_filters(
        self,
        filters: list[AnalysisFilter],
        field_types: dict[str, str],
    ) -> None:
        for item in filters:
            self._validate_fields([item.field], field_types)
            if item.operator == "in" and not isinstance(item.value, list):
                raise AppError("The in operator requires a list", "invalid_analysis_filter", 400)

    def _record_operation(
        self,
        *,
        action: str,
        dataset: Dataset,
        detail: dict[str, object],
    ) -> None:
        if self.audit is None:
            return
        self.audit.record_operation(
            action=action,
            project_id=dataset.project_id,
            resource_type="dataset",
            resource_id=dataset.id,
            detail=detail,
        )


def matches_filter(value: object | None, item: AnalysisFilter) -> bool:
    if item.operator == "is_null":
        return is_null(value)
    if item.operator == "not_null":
        return not is_null(value)
    if item.operator == "contains":
        return str(item.value or "").casefold() in str(value or "").casefold()
    if item.operator == "in":
        return any(values_equal(value, candidate) for candidate in list(item.value or []))
    if item.operator == "eq":
        return values_equal(value, item.value)
    if item.operator == "ne":
        return not values_equal(value, item.value)

    left, right = comparable_values(value, item.value)
    if left is None or right is None:
        return False
    if item.operator == "gt":
        return left > right
    if item.operator == "gte":
        return left >= right
    if item.operator == "lt":
        return left < right
    return left <= right


def values_equal(left: object | None, right: object | None) -> bool:
    comparable_left, comparable_right = comparable_values(left, right)
    return comparable_left == comparable_right


def comparable_values(
    left: object | None,
    right: object | None,
) -> tuple[object | None, object | None]:
    if is_null(left) or is_null(right):
        return left, right
    if isinstance(left, bool):
        normalized = str(right).strip().casefold()
        return left, normalized in {"true", "1", "yes"}
    if isinstance(left, int | float):
        return float(left), to_float(right)
    if isinstance(left, datetime):
        try:
            return left, datetime.fromisoformat(str(right))
        except ValueError:
            return str(left), str(right)
    if isinstance(left, date):
        try:
            return left, date.fromisoformat(str(right))
        except ValueError:
            return str(left), str(right)
    return str(left).casefold(), str(right).casefold()


def calculate_metric(
    rows: list[dict[str, object | None]],
    metric: AnalysisMetric,
) -> int | float | str | None:
    values = [row.get(metric.field) for row in rows] if metric.field else []
    non_null_values = [value for value in values if not is_null(value)]
    if metric.aggregation == "count":
        return len(non_null_values) if metric.field else len(rows)
    if metric.aggregation == "distinct_count":
        return len({display_value(value) for value in non_null_values})
    if not non_null_values:
        return None
    if metric.aggregation in {"sum", "avg"}:
        numbers = [number for value in non_null_values if (number := to_float(value)) is not None]
        if not numbers:
            return None
        value = sum(numbers) if metric.aggregation == "sum" else fmean(numbers)
        return round(value, 6)
    if metric.aggregation == "min":
        return serialize_value(min(non_null_values))
    return serialize_value(max(non_null_values))


def percentile(sorted_values: list[float], fraction: float) -> float:
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def pearson_correlation(left: list[float], right: list[float]) -> float | None:
    if len(left) < 2 or len(left) != len(right):
        return None
    left_mean = fmean(left)
    right_mean = fmean(right)
    numerator = sum(
        (left_value - left_mean) * (right_value - right_mean)
        for left_value, right_value in zip(left, right, strict=True)
    )
    left_scale = math.sqrt(sum((value - left_mean) ** 2 for value in left))
    right_scale = math.sqrt(sum((value - right_mean) ** 2 for value in right))
    denominator = left_scale * right_scale
    if denominator == 0:
        return None
    return round(numerator / denominator, 6)


def to_float(value: object | None) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def sortable_value(value: object | None) -> tuple[int, object]:
    if value is None:
        return (0, "")
    if isinstance(value, int | float):
        return (2, float(value))
    return (1, str(value).casefold())


def is_null(value: object | None) -> bool:
    return value is None or value == ""


def display_value(value: object) -> str:
    serialized = serialize_value(value)
    return str(serialized)


def serialize_value(value: object | None) -> object | None:
    if isinstance(value, datetime | date):
        return value.isoformat()
    return value
