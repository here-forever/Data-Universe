from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd

from app.i18n import render


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
                        "title": render("chart.line.title", locale, value_field=value_field),
                        "reason": render("chart.line.reason", locale),
                        "x_field": time_field,
                        "y_field": value_field,
                        "categories": [value.isoformat() for value in data[time_field]],
                        "series": [round(float(value), 6) for value in data[value_field]],
                    },
                    score,
                    [
                        render(
                            "chart.line.time_points",
                            locale,
                            count=time_points,
                        ),
                        render(
                            "chart.line.coverage",
                            locale,
                            coverage=time_coverage,
                        ),
                        render(
                            "chart.line.fields",
                            locale,
                            numeric_count=len(numeric),
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
                        "title": render(
                            "chart.bar.title",
                            locale,
                            value_field=value_field,
                            category=category,
                        ),
                        "reason": render("chart.bar.reason", locale),
                        "x_field": category,
                        "y_field": value_field,
                        "categories": [str(value) for value in grouped.index],
                        "series": [round(float(value), 6) for value in grouped.values],
                    },
                    score,
                    [
                        render(
                            "chart.bar.groups",
                            locale,
                            category=category,
                            count=category_count,
                        ),
                        render(
                            "chart.bar.difference",
                            locale,
                            difference=group_difference,
                        ),
                        render(
                            "chart.bar.fields",
                            locale,
                            categorical_count=len(categorical),
                            numeric_count=len(numeric),
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
                        "title": render("chart.frequency.title", locale, category=category),
                        "reason": render("chart.frequency.reason", locale),
                        "x_field": category,
                        "categories": [str(value) for value in counts.index],
                        "series": counts.astype(int).tolist(),
                    },
                    score,
                    [
                        render(
                            "chart.frequency.categories",
                            locale,
                            category=category,
                            count=category_count,
                        ),
                        render("chart.frequency.no_numeric", locale),
                        render(
                            "chart.frequency.selected",
                            locale,
                            count=len(categorical),
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
                        "title": render("chart.scatter.title", locale, left=left, right=right),
                        "reason": render("chart.scatter.reason", locale),
                        "x_field": left,
                        "y_field": right,
                        "points": [
                            [round(float(x), 6), round(float(y), 6)] for x, y in sample.to_numpy()
                        ],
                    },
                    score,
                    [
                        render(
                            "chart.scatter.correlation",
                            locale,
                            correlation=abs(correlation),
                        ),
                        render(
                            "chart.scatter.coverage",
                            locale,
                            coverage=pair_coverage,
                        ),
                        render(
                            "chart.scatter.selected",
                            locale,
                            count=len(numeric),
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
                        "title": render("chart.histogram.title", locale, field=field),
                        "reason": render("chart.histogram.reason", locale),
                        "x_field": field,
                        "categories": [f"{edges[index]:.2f}" for index in range(len(counts))],
                        "series": counts.astype(int).tolist(),
                    },
                    score,
                    [
                        render(
                            "chart.histogram.skewness",
                            locale,
                            skewness=skewness,
                        ),
                        render(
                            "chart.histogram.outliers",
                            locale,
                            ratio=outlier_ratio,
                        ),
                        render(
                            "chart.histogram.selected",
                            locale,
                            count=len(numeric),
                        ),
                    ],
                )
            )
    ranked = sorted(charts, key=lambda chart: chart["score"], reverse=True)
    for rank, chart in enumerate(ranked, start=1):
        chart["rank"] = rank
        chart["id"] = f"{chart['type']}:{chart['x_field']}:{chart.get('y_field', '')}"
    return ranked[:4]


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
