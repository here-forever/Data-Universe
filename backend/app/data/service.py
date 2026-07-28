from __future__ import annotations

import math
from pathlib import Path
from typing import Any
from uuid import uuid4

import numpy as np
import pandas as pd
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.data.parser import parse_upload
from app.data.profiler import frame_rows, json_value, profile_frame
from app.data.repository import DatasetRepository
from app.data.schemas import (
    CleaningRequest,
    DatasetDetail,
    DatasetSummary,
    ParticlePoint,
    ParticleRequest,
    ParticleResponse,
    RowPage,
)
from app.models import Dataset, DatasetRevision

PARTICLE_COLORS = ("#64e6c4", "#ff8364", "#f7c95c", "#8ea1ff", "#e58ad9", "#79c7ff")


class DatasetService:
    def __init__(self, session: Session, settings: Settings | None = None) -> None:
        self.repository = DatasetRepository(session)
        self.settings = settings or get_settings()
        self.storage_root = Path(self.settings.data_storage_root)

    def list_datasets(self) -> list[DatasetSummary]:
        return [self._summary(dataset) for dataset in self.repository.list()]

    def create_upload(
        self, filename: str, content: bytes, name: str | None = None
    ) -> DatasetDetail:
        frame = parse_upload(filename, content, self.settings)
        return self._create_dataset(
            frame=frame,
            name=(name or Path(filename).stem).strip() or "Untitled dataset",
            source_filename=filename,
            file_type=Path(filename).suffix.lower().removeprefix("."),
        )

    def create_demo(self) -> DatasetDetail:
        existing = next(
            (
                item
                for item in self.repository.list()
                if item.source_filename == "campus-vibe-demo.csv"
            ),
            None,
        )
        if existing is not None:
            return self.detail(existing.id)
        return self._create_dataset(
            frame=build_demo_frame(),
            name="Campus rhythm sample",
            source_filename="campus-vibe-demo.csv",
            file_type="csv",
        )

    def detail(self, dataset_id: str) -> DatasetDetail:
        dataset = self._get(dataset_id)
        revision = self.repository.active_revision(dataset)
        frame = self._read_frame(revision.storage_path)
        return self._detail(dataset, revision, frame)

    def rows(self, dataset_id: str, offset: int, limit: int) -> RowPage:
        dataset = self._get(dataset_id)
        revision = self.repository.active_revision(dataset)
        frame = self._read_frame(revision.storage_path)
        safe_offset = max(0, offset)
        safe_limit = min(max(1, limit), 200)
        return RowPage(
            dataset_id=dataset.id,
            revision=revision.revision,
            offset=safe_offset,
            limit=safe_limit,
            total=len(frame),
            columns=list(frame.columns),
            rows=frame_rows(frame, safe_limit, safe_offset),
        )

    def clean(self, dataset_id: str, payload: CleaningRequest) -> DatasetDetail:
        dataset = self._get(dataset_id)
        active = self.repository.active_revision(dataset)
        frame = self._read_frame(active.storage_path)
        transformations: list[dict[str, Any]] = []

        for step in payload.steps:
            self._validate_columns(frame, [step.column] if step.column else step.columns)
            before = len(frame)
            if step.action == "drop_duplicates":
                frame = frame.drop_duplicates().reset_index(drop=True)
            elif step.action == "drop_missing":
                frame = frame.dropna(subset=step.columns or None).reset_index(drop=True)
            elif step.action == "fill_missing":
                assert step.column is not None and step.strategy is not None
                value = self._fill_value(frame[step.column], step.strategy, step.value)
                if step.strategy in {"mean", "median"}:
                    numeric = pd.to_numeric(frame[step.column], errors="coerce").astype("Float64")
                    frame[step.column] = numeric.fillna(float(value))
                else:
                    try:
                        frame[step.column] = frame[step.column].fillna(value)
                    except TypeError:
                        frame[step.column] = frame[step.column].astype(object).fillna(value)
            elif step.action == "flag_outliers":
                assert step.column is not None
                numeric = pd.to_numeric(frame[step.column], errors="coerce")
                q1 = numeric.quantile(0.25)
                q3 = numeric.quantile(0.75)
                iqr = q3 - q1
                frame[f"{step.column}__outlier"] = (
                    (numeric < q1 - 1.5 * iqr) | (numeric > q3 + 1.5 * iqr)
                ).fillna(False)
            transformations.append(
                {
                    "action": step.action,
                    "column": step.column,
                    "columns": step.columns,
                    "strategy": step.strategy,
                    "rows_before": before,
                    "rows_after": len(frame),
                }
            )

        revision_number = dataset.active_revision + 1
        profile = profile_frame(frame)
        storage_path = self._write_frame(dataset.id, revision_number, frame)
        revision = DatasetRevision(
            id=f"rev_{uuid4().hex}",
            dataset_id=dataset.id,
            revision=revision_number,
            label=payload.label,
            storage_path=str(storage_path),
            transformations=transformations,
            profile=profile,
        )
        dataset.revisions.append(revision)
        dataset.active_revision = revision_number
        dataset.row_count = len(frame)
        dataset.column_count = len(frame.columns)
        self.repository.commit()
        return self._detail(dataset, revision, frame)

    def particles(self, dataset_id: str, payload: ParticleRequest) -> ParticleResponse:
        dataset = self._get(dataset_id)
        revision = self.repository.active_revision(dataset)
        frame = self._read_frame(revision.storage_path)
        profile = revision.profile
        numeric_fields = [
            column["name"] for column in profile["columns"] if column["kind"] == "numeric"
        ]
        mapping = profile["mapping"]
        x_field = self._numeric_mapping(payload.x, mapping.get("x"), numeric_fields)
        y_field = self._numeric_mapping(payload.y, mapping.get("y"), numeric_fields, x_field)
        z_field = self._numeric_mapping(payload.z, mapping.get("z"), numeric_fields, y_field)
        color_field = payload.color or mapping.get("color")
        if color_field and color_field not in frame.columns:
            raise AppError(f"Unknown color field: {color_field}", "field_not_found", 404)

        sample_size = min(payload.limit, self.settings.particle_sample_rows, len(frame))
        if sample_size == 0:
            return ParticleResponse(dataset_id=dataset.id, mapping={}, points=[])
        positions = np.linspace(0, len(frame) - 1, sample_size, dtype=int)
        sampled = frame.iloc[positions].reset_index(drop=True)
        x_values = self._axis(sampled, x_field, 0)
        y_values = self._axis(sampled, y_field, 1)
        z_values = self._axis(sampled, z_field, 2)
        categories = (
            sampled[color_field].fillna("Missing").astype(str).tolist()
            if color_field
            else ["Data"] * sample_size
        )
        color_lookup = {
            category: PARTICLE_COLORS[index % len(PARTICLE_COLORS)]
            for index, category in enumerate(dict.fromkeys(categories))
        }
        label_field = color_field or next(
            (
                column["name"]
                for column in profile["columns"]
                if column["kind"] in {"text", "categorical"}
            ),
            None,
        )

        points = []
        for index, row in sampled.iterrows():
            values = {key: json_value(value) for key, value in row.iloc[:8].items()}
            label = str(row.get(label_field, f"Row {int(positions[index]) + 1}"))
            points.append(
                ParticlePoint(
                    id=int(positions[index]),
                    x=float(x_values[index]),
                    y=float(y_values[index]),
                    z=float(z_values[index]),
                    color=color_lookup[categories[index]],
                    label=label,
                    values=values,
                )
            )
        return ParticleResponse(
            dataset_id=dataset.id,
            mapping={"x": x_field, "y": y_field, "z": z_field, "color": color_field},
            points=points,
        )

    def load_frame(self, dataset_id: str) -> tuple[Dataset, DatasetRevision, pd.DataFrame]:
        dataset = self._get(dataset_id)
        revision = self.repository.active_revision(dataset)
        return dataset, revision, self._read_frame(revision.storage_path)

    def delete(self, dataset_id: str) -> None:
        dataset = self._get(dataset_id)
        paths = [Path(item.storage_path) for item in dataset.revisions]
        self.repository.delete(dataset)
        for path in paths:
            path.unlink(missing_ok=True)
        directory = self.storage_root / dataset_id
        if directory.exists() and not any(directory.iterdir()):
            directory.rmdir()

    def _create_dataset(
        self,
        *,
        frame: pd.DataFrame,
        name: str,
        source_filename: str,
        file_type: str,
    ) -> DatasetDetail:
        dataset_id = f"ds_{uuid4().hex}"
        profile = profile_frame(frame)
        storage_path = self._write_frame(dataset_id, 1, frame)
        revision = DatasetRevision(
            id=f"rev_{uuid4().hex}",
            dataset_id=dataset_id,
            revision=1,
            label="Original upload",
            storage_path=str(storage_path),
            transformations=[],
            profile=profile,
        )
        dataset = Dataset(
            id=dataset_id,
            name=name,
            source_filename=source_filename,
            file_type=file_type,
            row_count=len(frame),
            column_count=len(frame.columns),
            active_revision=1,
            revisions=[revision],
        )
        self.repository.add(dataset)
        return self._detail(dataset, revision, frame)

    def _get(self, dataset_id: str) -> Dataset:
        dataset = self.repository.get(dataset_id)
        if dataset is None:
            raise AppError("Dataset not found", "dataset_not_found", 404)
        return dataset

    def _summary(self, dataset: Dataset) -> DatasetSummary:
        revision = self.repository.active_revision(dataset)
        return DatasetSummary(
            id=dataset.id,
            name=dataset.name,
            source_filename=dataset.source_filename,
            file_type=dataset.file_type,
            row_count=dataset.row_count,
            column_count=dataset.column_count,
            active_revision=dataset.active_revision,
            quality_score=float(revision.profile.get("quality_score", 0)),
            created_at=dataset.created_at,
            updated_at=dataset.updated_at,
        )

    def _detail(
        self, dataset: Dataset, revision: DatasetRevision, frame: pd.DataFrame
    ) -> DatasetDetail:
        return DatasetDetail(
            **self._summary(dataset).model_dump(),
            profile=revision.profile,
            preview=frame_rows(frame, self.settings.preview_rows),
            transformations=revision.transformations,
        )

    def _write_frame(self, dataset_id: str, revision: int, frame: pd.DataFrame) -> Path:
        directory = self.storage_root / dataset_id
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"revision-{revision}.jsonl"
        frame.to_json(path, orient="records", lines=True, date_format="iso", force_ascii=False)
        return path.resolve()

    @staticmethod
    def _read_frame(path: str) -> pd.DataFrame:
        return pd.read_json(path, orient="records", lines=True).convert_dtypes()

    @staticmethod
    def _validate_columns(frame: pd.DataFrame, columns: list[str | None]) -> None:
        for column in columns:
            if column and column not in frame.columns:
                raise AppError(f"Unknown column: {column}", "field_not_found", 404)

    @staticmethod
    def _fill_value(series: pd.Series, strategy: str, explicit: Any) -> Any:
        if strategy == "value":
            return explicit
        non_null = series.dropna()
        if non_null.empty:
            raise AppError("The selected column has no value to infer", "empty_column", 400)
        if strategy in {"mean", "median"}:
            numeric = pd.to_numeric(non_null, errors="coerce").dropna()
            if numeric.empty:
                raise AppError(
                    "Mean and median require a numeric column", "numeric_column_required", 400
                )
            return float(numeric.mean() if strategy == "mean" else numeric.median())
        return non_null.mode().iloc[0]

    @staticmethod
    def _numeric_mapping(
        requested: str | None,
        suggested: str | None,
        numeric_fields: list[str],
        avoid: str | None = None,
    ) -> str | None:
        candidate = requested or suggested
        if candidate and candidate not in numeric_fields:
            raise AppError(
                f"Particle axes require numeric fields: {candidate}", "numeric_field_required", 400
            )
        if candidate != avoid:
            return candidate
        return next((field for field in numeric_fields if field != avoid), candidate)

    @staticmethod
    def _axis(frame: pd.DataFrame, field: str | None, axis: int) -> np.ndarray:
        count = len(frame)
        phase = np.linspace(0, math.tau * 3, count, endpoint=False)
        if field is None:
            if axis == 0:
                return np.cos(phase) * (0.4 + np.linspace(0, 0.6, count))
            if axis == 1:
                return np.sin(phase) * (0.4 + np.linspace(0, 0.6, count))
            return np.linspace(-1, 1, count)
        values = pd.to_numeric(frame[field], errors="coerce").astype(float)
        fill_value = values.median() if values.notna().any() else 0
        values = values.fillna(fill_value)
        std = values.std(ddof=0)
        if not std:
            return np.zeros(count)
        return np.clip(((values - values.mean()) / std).to_numpy() / 3, -1.4, 1.4)


def build_demo_frame() -> pd.DataFrame:
    rng = np.random.default_rng(27)
    rows = 180
    departments = np.array(["Design", "Science", "Business", "Engineering"])
    activities = np.array(["Research", "Sports", "Reading", "Community"])
    dates = pd.date_range("2026-02-01", periods=rows, freq="D")
    study_hours = np.clip(rng.normal(4.8, 1.5, rows), 0.5, 10)
    sleep_hours = np.clip(rng.normal(7.1, 0.9, rows), 4, 9.5)
    activity = activities[np.arange(rows) % len(activities)]
    score = 52 + study_hours * 5.3 + sleep_hours * 1.8 + rng.normal(0, 5, rows)
    satisfaction = np.clip(48 + sleep_hours * 5 + rng.normal(0, 8, rows), 20, 100)
    frame = pd.DataFrame(
        {
            "date": dates,
            "department": departments[np.arange(rows) % len(departments)],
            "activity": activity,
            "study_hours": np.round(study_hours, 1),
            "sleep_hours": np.round(sleep_hours, 1),
            "course_score": np.round(score, 1),
            "monthly_expense": np.round(np.clip(rng.normal(1850, 430, rows), 500, 4200), 0),
            "satisfaction": np.round(satisfaction, 0),
        }
    )
    frame.loc[[18, 77, 132], "sleep_hours"] = pd.NA
    frame.loc[150, "monthly_expense"] = 6800
    return frame.convert_dtypes()
