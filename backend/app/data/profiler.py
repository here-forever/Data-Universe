from __future__ import annotations

import math
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd


def json_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, np.generic):
        value = value.item()
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def frame_rows(frame: pd.DataFrame, limit: int, offset: int = 0) -> list[dict[str, Any]]:
    records = frame.iloc[offset : offset + limit].to_dict(orient="records")
    return [{key: json_value(value) for key, value in row.items()} for row in records]


def profile_frame(frame: pd.DataFrame) -> dict[str, Any]:
    row_count = len(frame)
    duplicate_count = int(frame.duplicated().sum()) if row_count else 0
    total_cells = max(row_count * max(len(frame.columns), 1), 1)
    missing_cells = int(frame.isna().sum().sum())
    columns: list[dict[str, Any]] = []
    outlier_cells = 0

    for name in frame.columns:
        series = frame[name]
        missing_count = int(series.isna().sum())
        non_null = series.dropna()
        kind = infer_kind(series)
        column: dict[str, Any] = {
            "name": name,
            "kind": kind,
            "missing_count": missing_count,
            "missing_ratio": round(missing_count / row_count, 4) if row_count else 0,
            "unique_count": int(non_null.nunique()),
        }
        if kind == "numeric":
            numeric = pd.to_numeric(non_null, errors="coerce").dropna().astype(float)
            if len(numeric):
                q1 = float(numeric.quantile(0.25))
                q3 = float(numeric.quantile(0.75))
                iqr = q3 - q1
                outliers = int(((numeric < q1 - 1.5 * iqr) | (numeric > q3 + 1.5 * iqr)).sum())
                outlier_cells += outliers
                column["stats"] = {
                    "mean": round(float(numeric.mean()), 6),
                    "median": round(float(numeric.median()), 6),
                    "std": round(float(numeric.std(ddof=1)), 6) if len(numeric) > 1 else 0,
                    "min": round(float(numeric.min()), 6),
                    "max": round(float(numeric.max()), 6),
                    "q1": round(q1, 6),
                    "q3": round(q3, 6),
                    "outlier_count": outliers,
                }
        elif kind in {"categorical", "boolean", "text"}:
            counts = non_null.astype(str).value_counts().head(8)
            column["top_values"] = [
                {
                    "value": str(value),
                    "count": int(count),
                    "ratio": round(int(count) / len(non_null), 4) if len(non_null) else 0,
                }
                for value, count in counts.items()
            ]
        elif kind == "datetime" and len(non_null):
            parsed = pd.to_datetime(non_null, errors="coerce").dropna()
            if len(parsed):
                column["range"] = {
                    "start": parsed.min().isoformat(),
                    "end": parsed.max().isoformat(),
                }
        columns.append(column)

    missing_ratio = missing_cells / total_cells
    duplicate_ratio = duplicate_count / row_count if row_count else 0
    outlier_ratio = outlier_cells / total_cells
    quality_score = max(0.0, 100 - missing_ratio * 55 - duplicate_ratio * 25 - outlier_ratio * 20)
    kinds = {column["name"]: column["kind"] for column in columns}
    numeric_fields = [name for name, kind in kinds.items() if kind == "numeric"]
    category_fields = [name for name, kind in kinds.items() if kind in {"categorical", "boolean"}]
    datetime_fields = [name for name, kind in kinds.items() if kind == "datetime"]

    return {
        "row_count": row_count,
        "column_count": len(frame.columns),
        "missing_cells": missing_cells,
        "duplicate_rows": duplicate_count,
        "quality_score": round(quality_score, 1),
        "columns": columns,
        "mapping": {
            "x": numeric_fields[0] if numeric_fields else None,
            "y": numeric_fields[1] if len(numeric_fields) > 1 else None,
            "z": numeric_fields[2] if len(numeric_fields) > 2 else None,
            "color": category_fields[0] if category_fields else None,
            "time": datetime_fields[0] if datetime_fields else None,
        },
    }


def infer_kind(series: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    non_null = series.dropna()
    if len(non_null):
        parsed_dates = pd.to_datetime(non_null, errors="coerce", format="mixed")
        if parsed_dates.notna().mean() >= 0.9:
            return "datetime"
    unique_count = int(non_null.nunique())
    if unique_count <= min(24, max(4, len(non_null) // 4)):
        return "categorical"
    return "text"
