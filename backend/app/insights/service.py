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
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.data.profiler import json_value
from app.data.service import DatasetService
from app.i18n import render
from app.insights.charts import chart_recommendations
from app.insights.narrator import ExternalLlmError, Narrator
from app.insights.repository import InsightRepository
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
    def __init__(
        self,
        session: Session,
        settings: Settings | None = None,
        *,
        datasets: DatasetService | None = None,
        narrator: Narrator | None = None,
        repository: InsightRepository | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.datasets = datasets or DatasetService(session, self.settings)
        self.narrator = narrator or Narrator(self.settings)
        self.repository = repository or InsightRepository(session)

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
            message = render("llm.answer.failed", payload.locale, error=error)
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
                render("llm.connection.failed", "en-US", error=error),
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
        return [
            AnalysisRunResponse.model_validate(item)
            for item in self.repository.list_for_dataset(dataset_id)
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
        return self.repository.add(run)


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
