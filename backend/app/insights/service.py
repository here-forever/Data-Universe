from __future__ import annotations

import math
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
from scipy import stats
from sklearn.cluster import KMeans
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_squared_error, r2_score, silhouette_score
from sklearn.preprocessing import StandardScaler
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.data.profiler import json_value
from app.data.service import DatasetService
from app.insights.narrator import ExternalLlmError, Narrator
from app.insights.schemas import (
    AdvancedRequest,
    AnalysisRunResponse,
    AskRequest,
    AskResponse,
    ExploreRequest,
    ExploreResponse,
    LlmConfig,
    LlmConnectionResponse,
)
from app.models import AnalysisRun


class InsightService:
    def __init__(self, session: Session, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.datasets = DatasetService(session, self.settings)
        self.narrator = Narrator(self.settings)

    def explore(
        self,
        dataset_id: str,
        payload: ExploreRequest | None = None,
        *,
        record: bool = True,
    ) -> ExploreResponse:
        dataset, revision, frame = self.datasets.load_frame(dataset_id)
        request = payload or ExploreRequest()
        filtered_frame = apply_filters(frame, request)
        result = build_exploration(filtered_frame, revision.profile, request.locale)
        result["overview"]["source_row_count"] = len(frame)
        result["overview"]["filters"] = request.model_dump(mode="json")["filters"]
        response = ExploreResponse(
            dataset_id=dataset.id,
            revision=revision.revision,
            **result,
        )
        if record:
            self._record(
                dataset.id,
                "explore",
                request.model_dump(mode="json"),
                response.model_dump(mode="json"),
            )
        return response

    def ask(self, dataset_id: str, payload: AskRequest) -> AskResponse:
        dataset, revision, _ = self.datasets.load_frame(dataset_id)
        exploration = self.explore(
            dataset_id,
            ExploreRequest(locale=payload.locale),
            record=False,
        ).model_dump(mode="json")
        try:
            mode, answer, evidence, model = self.narrator.answer(
                payload.question,
                revision.profile,
                exploration,
                payload.locale,
                payload.llm,
            )
        except ExternalLlmError as error:
            message = (
                f"大模型调用失败：{error}"
                if payload.locale == "zh-CN"
                else f"The language model request failed: {error}"
            )
            raise AppError(message, "llm_provider_error", 502) from error
        request_payload = payload.model_dump(mode="json", exclude={"llm"})
        if payload.llm:
            request_payload["llm"] = payload.llm.public_dict()
        run = self._record(
            dataset.id,
            "question",
            request_payload,
            {"mode": mode, "model": model, "answer": answer, "evidence": evidence},
        )
        charts = exploration.get("charts", [])
        return AskResponse(
            analysis_id=run.id,
            dataset_id=dataset.id,
            mode=mode,
            model=model,
            answer=answer,
            evidence=evidence,
            suggested_chart=charts[0] if charts else None,
        )

    def check_llm(self, payload: LlmConfig) -> LlmConnectionResponse:
        try:
            self.narrator.check(payload)
        except ExternalLlmError as error:
            raise AppError(
                f"Unable to connect to the language model: {error}",
                "llm_connection_failed",
                502,
            ) from error
        return LlmConnectionResponse(
            ok=True,
            model=payload.model,
            api_style=payload.api_style,
            message="Connection verified",
        )

    def advanced(self, dataset_id: str, payload: AdvancedRequest) -> AnalysisRunResponse:
        dataset, _, frame = self.datasets.load_frame(dataset_id)
        if payload.method == "regression":
            result = regression(frame, str(payload.feature), str(payload.target))
        elif payload.method == "hypothesis":
            result = hypothesis_test(
                frame,
                str(payload.target),
                str(payload.group_field),
                str(payload.group_a),
                str(payload.group_b),
            )
        else:
            result = clustering(frame, payload.fields, payload.clusters)
        run = self._record(
            dataset.id,
            payload.method,
            payload.model_dump(mode="json"),
            result,
        )
        return AnalysisRunResponse.model_validate(run)

    def history(self, dataset_id: str) -> list[AnalysisRunResponse]:
        self.datasets.load_frame(dataset_id)
        statement = (
            select(AnalysisRun)
            .where(AnalysisRun.dataset_id == dataset_id)
            .order_by(AnalysisRun.created_at.desc())
        )
        return [
            AnalysisRunResponse.model_validate(item) for item in self.session.scalars(statement)
        ]

    def _record(
        self,
        dataset_id: str,
        kind: str,
        request: dict[str, Any],
        result: dict[str, Any],
    ) -> AnalysisRun:
        run = AnalysisRun(
            id=f"an_{uuid4().hex}",
            dataset_id=dataset_id,
            kind=kind,
            request=request,
            result=result,
        )
        self.session.add(run)
        self.session.commit()
        self.session.refresh(run)
        return run


def build_exploration(
    frame: pd.DataFrame,
    profile: dict[str, Any],
    locale: str = "zh-CN",
) -> dict[str, Any]:
    numeric_fields = [
        column["name"] for column in profile["columns"] if column["kind"] == "numeric"
    ][:10]
    correlations = correlation_payload(frame, numeric_fields)
    distributions = distribution_payload(frame, profile["columns"])
    anomalies = anomaly_payload(frame, numeric_fields)
    charts = chart_recommendations(frame, profile["columns"], locale)
    return {
        "overview": {
            "row_count": len(frame),
            "column_count": len(frame.columns),
            "quality_score": profile["quality_score"],
            "numeric_fields": len(numeric_fields),
            "categorical_fields": sum(
                column["kind"] in {"categorical", "boolean"} for column in profile["columns"]
            ),
            "datetime_fields": sum(column["kind"] == "datetime" for column in profile["columns"]),
        },
        "correlations": correlations,
        "distributions": distributions,
        "anomalies": anomalies,
        "charts": charts,
    }


def apply_filters(frame: pd.DataFrame, payload: ExploreRequest) -> pd.DataFrame:
    filtered = frame
    for item in payload.filters:
        require_fields(filtered, [item.field])
        comparable = filtered[item.field].fillna("Missing").astype(str)
        filtered = filtered[comparable == item.value]
    if filtered.empty and payload.filters:
        raise AppError("No rows match the active chart filter", "empty_filter_result", 400)
    return filtered


def correlation_payload(frame: pd.DataFrame, fields: list[str]) -> dict[str, Any]:
    if len(fields) < 2:
        return {"fields": fields, "matrix": [], "strongest_pairs": []}
    numeric = frame[fields].apply(pd.to_numeric, errors="coerce")
    matrix = numeric.corr().round(4)
    pairs = []
    for left_index, left in enumerate(fields):
        for right in fields[left_index + 1 :]:
            value = matrix.loc[left, right]
            if pd.notna(value):
                pairs.append({"left": left, "right": right, "value": float(value)})
    pairs.sort(key=lambda item: abs(item["value"]), reverse=True)
    return {
        "fields": fields,
        "matrix": [
            [json_value(value) for value in matrix.loc[field, fields].tolist()] for field in fields
        ],
        "strongest_pairs": pairs[:6],
    }


def distribution_payload(
    frame: pd.DataFrame, columns: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    distributions = []
    for column in columns[:12]:
        name = column["name"]
        if column["kind"] == "numeric":
            values = pd.to_numeric(frame[name], errors="coerce").dropna().astype(float)
            if values.empty:
                continue
            counts, edges = np.histogram(values, bins=min(12, max(5, int(math.sqrt(len(values))))))
            distributions.append(
                {
                    "field": name,
                    "kind": "numeric",
                    "labels": [f"{edges[index]:.2f}" for index in range(len(counts))],
                    "values": counts.astype(int).tolist(),
                }
            )
        elif column["kind"] in {"categorical", "boolean"}:
            counts = frame[name].fillna("Missing").astype(str).value_counts().head(10)
            distributions.append(
                {
                    "field": name,
                    "kind": "categorical",
                    "labels": [str(value) for value in counts.index],
                    "values": counts.astype(int).tolist(),
                }
            )
    return distributions


def anomaly_payload(frame: pd.DataFrame, fields: list[str]) -> list[dict[str, Any]]:
    anomalies: list[dict[str, Any]] = []
    for field in fields:
        values = pd.to_numeric(frame[field], errors="coerce")
        std = values.std(ddof=0)
        if pd.isna(std) or std == 0:
            continue
        scores = ((values - values.mean()) / std).abs()
        for index in scores.nlargest(3).index:
            score = scores.loc[index]
            if score < 2.5:
                continue
            anomalies.append(
                {
                    "row": int(index),
                    "field": field,
                    "value": json_value(frame.loc[index, field]),
                    "z_score": round(float(score), 3),
                }
            )
    anomalies.sort(key=lambda item: item["z_score"], reverse=True)
    return anomalies[:20]


def chart_recommendations(
    frame: pd.DataFrame,
    columns: list[dict[str, Any]],
    locale: str = "zh-CN",
) -> list[dict[str, Any]]:
    profiles = {column["name"]: column for column in columns}
    numeric = [column["name"] for column in columns if column["kind"] == "numeric"]
    categorical = [
        column["name"] for column in columns if column["kind"] in {"categorical", "boolean"}
    ]
    datetimes = [column["name"] for column in columns if column["kind"] == "datetime"]
    charts: list[dict[str, Any]] = []

    if datetimes and numeric:
        time_field = max(datetimes, key=lambda field: profiles[field]["unique_count"])
        value_field = max(numeric, key=lambda field: numeric_field_score(frame, profiles[field]))
        data = frame[[time_field, value_field]].dropna().head(500).copy()
        data[time_field] = pd.to_datetime(data[time_field], errors="coerce")
        data[value_field] = pd.to_numeric(data[value_field], errors="coerce")
        data = data.dropna().sort_values(time_field)
        if len(data) >= 2:
            time_coverage = len(data) / max(len(frame), 1)
            time_points = int(data[time_field].nunique())
            score = 68 + min(time_points, 12) + time_coverage * 10
            charts.append(
                recommendation_metadata(
                    {
                        "type": "line",
                        "title": (
                            f"{value_field} over time"
                            if locale == "en-US"
                            else f"{value_field} 随时间变化"
                        ),
                        "reason": (
                            "A time field and a numeric measure support trend exploration"
                            if locale == "en-US"
                            else "时间字段与数值指标适合用于探索变化趋势"
                        ),
                        "x_field": time_field,
                        "y_field": value_field,
                        "categories": [value.isoformat() for value in data[time_field]],
                        "series": [round(float(value), 6) for value in data[value_field]],
                    },
                    score,
                    [
                        localized(
                            locale,
                            f"Detected {time_points} ordered time points",
                            f"识别到 {time_points} 个有序时间点",
                        ),
                        localized(
                            locale,
                            f"{time_coverage:.0%} of rows contain both fields",
                            f"{time_coverage:.0%} 的数据行同时包含这两个字段",
                        ),
                        localized(
                            locale,
                            f"Matched 1 time and {len(numeric)} numeric columns",
                            f"匹配到 1 个时间列与 {len(numeric)} 个数值列",
                        ),
                    ],
                )
            )
    if categorical and numeric:
        category = max(
            categorical,
            key=lambda field: categorical_field_score(frame, profiles[field]),
        )
        value_field = max(
            numeric,
            key=lambda field: grouped_difference_score(frame, category, field),
        )
        grouped = (
            frame.assign(**{value_field: pd.to_numeric(frame[value_field], errors="coerce")})
            .groupby(category, dropna=False)[value_field]
            .mean()
            .dropna()
            .sort_values(ascending=False)
            .head(12)
        )
        if len(grouped) >= 2:
            category_count = int(frame[category].nunique(dropna=True))
            group_difference = grouped_difference_score(frame, category, value_field)
            category_fit = max(0.0, 1 - abs(category_count - 6) / 12)
            score = 62 + category_fit * 13 + group_difference * 14
            charts.append(
                recommendation_metadata(
                    {
                        "type": "bar",
                        "title": (
                            f"Average {value_field} by {category}"
                            if locale == "en-US"
                            else f"按 {category} 比较 {value_field} 均值"
                        ),
                        "reason": (
                            "Compare a numeric measure across groups"
                            if locale == "en-US"
                            else "比较不同群体之间的数值指标"
                        ),
                        "x_field": category,
                        "y_field": value_field,
                        "categories": [str(value) for value in grouped.index],
                        "series": [round(float(value), 6) for value in grouped.values],
                    },
                    score,
                    [
                        localized(
                            locale,
                            f"{category} contains {category_count} comparable groups",
                            f"{category} 包含 {category_count} 个可比较分组",
                        ),
                        localized(
                            locale,
                            f"Group means differ by {group_difference:.0%} of the overall scale",
                            f"组间均值差异约占整体尺度的 {group_difference:.0%}",
                        ),
                        localized(
                            locale,
                            (
                                f"Matched {len(categorical)} categorical and "
                                f"{len(numeric)} numeric columns"
                            ),
                            f"匹配到 {len(categorical)} 个分类列与 {len(numeric)} 个数值列",
                        ),
                    ],
                )
            )
    if categorical and not numeric:
        category = max(
            categorical,
            key=lambda field: categorical_field_score(frame, profiles[field]),
        )
        counts = frame[category].fillna("Missing").astype(str).value_counts().head(12)
        if len(counts) >= 2:
            category_count = int(frame[category].nunique(dropna=True))
            score = 64 + max(0.0, 1 - abs(category_count - 6) / 12) * 16
            charts.append(
                recommendation_metadata(
                    {
                        "type": "bar",
                        "title": (
                            f"Count by {category}" if locale == "en-US" else f"{category} 类别频数"
                        ),
                        "reason": localized(
                            locale,
                            "Compare the frequency of categories",
                            "比较不同类别的数据量与构成差异",
                        ),
                        "x_field": category,
                        "categories": [str(value) for value in counts.index],
                        "series": counts.astype(int).tolist(),
                    },
                    score,
                    [
                        localized(
                            locale,
                            f"{category} contains {category_count} categories",
                            f"{category} 包含 {category_count} 个类别",
                        ),
                        localized(
                            locale,
                            "No numeric measure is required for frequency comparison",
                            "频数比较无需额外选择数值指标",
                        ),
                        localized(
                            locale,
                            f"Selected from {len(categorical)} categorical columns",
                            f"从 {len(categorical)} 个分类列中筛选",
                        ),
                    ],
                )
            )
    if len(numeric) >= 2:
        left, right, correlation = strongest_numeric_pair(frame, numeric)
        sample = frame[[left, right]].apply(pd.to_numeric, errors="coerce").dropna().head(600)
        if len(sample) >= 3:
            pair_coverage = len(sample) / max(len(frame), 1)
            score = 59 + abs(correlation) * 24 + pair_coverage * 10
            charts.append(
                recommendation_metadata(
                    {
                        "type": "scatter",
                        "title": (
                            f"{left} and {right}" if locale == "en-US" else f"{left} 与 {right}"
                        ),
                        "reason": (
                            "Inspect relationship, clusters, and unusual observations"
                            if locale == "en-US"
                            else "观察字段关系、群组与异常样本"
                        ),
                        "x_field": left,
                        "y_field": right,
                        "points": [
                            [round(float(x), 6), round(float(y), 6)] for x, y in sample.to_numpy()
                        ],
                    },
                    score,
                    [
                        localized(
                            locale,
                            f"Strongest numeric pair has |r| = {abs(correlation):.2f}",
                            f"最强数值字段对的相关系数 |r| = {abs(correlation):.2f}",
                        ),
                        localized(
                            locale,
                            f"{pair_coverage:.0%} complete paired observations",
                            f"完整配对样本占比 {pair_coverage:.0%}",
                        ),
                        localized(
                            locale,
                            f"Selected from {len(numeric)} numeric columns",
                            f"从 {len(numeric)} 个数值列中筛选",
                        ),
                    ],
                )
            )
    if numeric:
        field = max(numeric, key=lambda item: distribution_interest(frame[item]))
        values = pd.to_numeric(frame[field], errors="coerce").dropna().astype(float)
        if not values.empty:
            counts, edges = np.histogram(values, bins=min(14, max(5, int(math.sqrt(len(values))))))
            skewness = safe_skew(values)
            outlier_ratio = numeric_outlier_ratio(values)
            interest = distribution_interest(values)
            coverage = len(values) / max(len(frame), 1)
            score = 57 + interest * 18 + coverage * 9
            charts.append(
                recommendation_metadata(
                    {
                        "type": "histogram",
                        "title": (
                            f"Distribution of {field}" if locale == "en-US" else f"{field} 分布"
                        ),
                        "reason": (
                            "Reveal skew, concentration, and outliers"
                            if locale == "en-US"
                            else "识别偏态、集中趋势与异常值"
                        ),
                        "x_field": field,
                        "categories": [f"{edges[index]:.2f}" for index in range(len(counts))],
                        "series": counts.astype(int).tolist(),
                    },
                    score,
                    [
                        localized(
                            locale,
                            f"Distribution skewness is {skewness:.2f}",
                            f"分布偏度为 {skewness:.2f}",
                        ),
                        localized(
                            locale,
                            f"IQR outliers account for {outlier_ratio:.1%}",
                            f"IQR 异常值占比 {outlier_ratio:.1%}",
                        ),
                        localized(
                            locale,
                            f"Selected the most distinctive of {len(numeric)} numeric columns",
                            f"从 {len(numeric)} 个数值列中选择分布特征最明显的字段",
                        ),
                    ],
                )
            )
    ranked = sorted(charts, key=lambda chart: chart["score"], reverse=True)
    for rank, chart in enumerate(ranked, start=1):
        chart["rank"] = rank
        chart["id"] = f"{chart['type']}:{chart['x_field']}:{chart.get('y_field', '')}"
    return ranked[:4]


def localized(locale: str, english: str, chinese: str) -> str:
    return english if locale == "en-US" else chinese


def recommendation_metadata(
    chart: dict[str, Any], score: float, signals: list[str]
) -> dict[str, Any]:
    normalized_score = int(round(min(98, max(50, score))))
    confidence = (
        "high" if normalized_score >= 85 else "medium" if normalized_score >= 72 else "exploratory"
    )
    return {
        **chart,
        "score": normalized_score,
        "confidence": confidence,
        "signals": signals,
    }


def numeric_field_score(frame: pd.DataFrame, profile: dict[str, Any]) -> float:
    values = pd.to_numeric(frame[profile["name"]], errors="coerce").dropna().astype(float)
    if values.empty:
        return 0.0
    coverage = len(values) / max(len(frame), 1)
    has_variation = float(values.nunique() > 1)
    return coverage * 0.65 + has_variation * 0.2 + distribution_interest(values) * 0.15


def categorical_field_score(frame: pd.DataFrame, profile: dict[str, Any]) -> float:
    unique_count = int(profile["unique_count"])
    if unique_count < 2:
        return 0.0
    cardinality_fit = max(0.0, 1 - abs(unique_count - 6) / 18)
    coverage = frame[profile["name"]].notna().mean()
    return cardinality_fit * 0.7 + float(coverage) * 0.3


def grouped_difference_score(frame: pd.DataFrame, category: str, value_field: str) -> float:
    values = pd.to_numeric(frame[value_field], errors="coerce")
    grouped = values.groupby(frame[category], dropna=False).mean().dropna()
    overall_std = float(values.std(ddof=0))
    if len(grouped) < 2 or not math.isfinite(overall_std) or overall_std == 0:
        return 0.0
    return min(float(grouped.std(ddof=0)) / overall_std, 1.0)


def strongest_numeric_pair(frame: pd.DataFrame, fields: list[str]) -> tuple[str, str, float]:
    numeric = frame[fields].apply(pd.to_numeric, errors="coerce")
    correlation = numeric.corr()
    strongest = (fields[0], fields[1], 0.0)
    for left_index, left in enumerate(fields):
        for right in fields[left_index + 1 :]:
            value = correlation.loc[left, right]
            if pd.notna(value) and abs(float(value)) > abs(strongest[2]):
                strongest = (left, right, float(value))
    return strongest


def safe_skew(values: pd.Series) -> float:
    skewness = float(values.skew()) if len(values) >= 3 else 0.0
    return skewness if math.isfinite(skewness) else 0.0


def numeric_outlier_ratio(values: pd.Series) -> float:
    if values.empty:
        return 0.0
    q1 = float(values.quantile(0.25))
    q3 = float(values.quantile(0.75))
    iqr = q3 - q1
    if iqr == 0:
        return 0.0
    outliers = (values < q1 - 1.5 * iqr) | (values > q3 + 1.5 * iqr)
    return float(outliers.mean())


def distribution_interest(raw_values: pd.Series) -> float:
    values = pd.to_numeric(raw_values, errors="coerce").dropna().astype(float)
    if values.empty:
        return 0.0
    skew_interest = min(abs(safe_skew(values)) / 2, 1.0)
    outlier_interest = min(numeric_outlier_ratio(values) * 8, 1.0)
    return skew_interest * 0.65 + outlier_interest * 0.35


def regression(frame: pd.DataFrame, feature: str, target: str) -> dict[str, Any]:
    require_fields(frame, [feature, target])
    data = frame[[feature, target]].apply(pd.to_numeric, errors="coerce").dropna()
    if len(data) < 3:
        raise AppError("Regression requires at least three complete rows", "insufficient_data", 400)
    x = data[[feature]].to_numpy()
    y = data[target].to_numpy()
    model = LinearRegression().fit(x, y)
    predicted = model.predict(x)
    points = [
        {"feature": float(left), "actual": float(actual), "predicted": float(estimate)}
        for left, actual, estimate in zip(x[:, 0], y, predicted, strict=True)
    ][:300]
    return {
        "method": "regression",
        "feature": feature,
        "target": target,
        "observations": len(data),
        "coefficient": round(float(model.coef_[0]), 6),
        "intercept": round(float(model.intercept_), 6),
        "r_squared": round(float(r2_score(y, predicted)), 6),
        "rmse": round(float(mean_squared_error(y, predicted) ** 0.5), 6),
        "points": points,
    }


def hypothesis_test(
    frame: pd.DataFrame,
    target: str,
    group_field: str,
    group_a: str,
    group_b: str,
) -> dict[str, Any]:
    require_fields(frame, [target, group_field])
    numeric = pd.to_numeric(frame[target], errors="coerce")
    left = numeric[frame[group_field].astype(str) == group_a].dropna().astype(float)
    right = numeric[frame[group_field].astype(str) == group_b].dropna().astype(float)
    if len(left) < 2 or len(right) < 2:
        raise AppError(
            "Each comparison group requires at least two values", "insufficient_data", 400
        )
    statistic, p_value = stats.ttest_ind(left, right, equal_var=False)
    return {
        "method": "hypothesis",
        "target": target,
        "group_field": group_field,
        "groups": [
            {"name": group_a, "count": len(left), "mean": round(float(left.mean()), 6)},
            {"name": group_b, "count": len(right), "mean": round(float(right.mean()), 6)},
        ],
        "statistic": round(float(statistic), 6),
        "p_value": round(float(p_value), 8),
        "significant": bool(p_value < 0.05),
    }


def clustering(frame: pd.DataFrame, fields: list[str], clusters: int) -> dict[str, Any]:
    require_fields(frame, fields)
    data = frame[fields].apply(pd.to_numeric, errors="coerce").dropna()
    if len(data) <= clusters:
        raise AppError(
            "Clustering needs more complete rows than clusters", "insufficient_data", 400
        )
    scaler = StandardScaler()
    scaled = scaler.fit_transform(data)
    model = KMeans(n_clusters=clusters, random_state=27, n_init=10).fit(scaled)
    score = silhouette_score(scaled, model.labels_) if clusters < len(data) else None
    centers = scaler.inverse_transform(model.cluster_centers_)
    assignments = [
        {"row": int(index), "cluster": int(label)}
        for index, label in zip(data.index[:500], model.labels_[:500], strict=True)
    ]
    return {
        "method": "clustering",
        "fields": fields,
        "clusters": clusters,
        "observations": len(data),
        "silhouette_score": round(float(score), 6) if score is not None else None,
        "centers": [
            {field: round(float(center[index]), 6) for index, field in enumerate(fields)}
            for center in centers
        ],
        "assignments": assignments,
    }


def require_fields(frame: pd.DataFrame, fields: list[str]) -> None:
    missing = [field for field in fields if field not in frame.columns]
    if missing:
        raise AppError(f"Unknown fields: {', '.join(missing)}", "field_not_found", 404)
