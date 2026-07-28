from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.data.service import DatasetService
from app.insights.schemas import ExploreRequest
from app.insights.service import InsightService
from app.models import Story
from app.stories.exporter import export_html, export_pdf
from app.stories.schemas import StoryCreate, StoryResponse, StoryUpdate


class StoryService:
    def __init__(self, session: Session, settings: Settings | None = None) -> None:
        self.session = session
        self.settings = settings or get_settings()
        self.datasets = DatasetService(session, self.settings)
        self.insights = InsightService(session, self.settings)
        self.export_root = Path(self.settings.export_storage_root)

    def list(self) -> list[StoryResponse]:
        statement = select(Story).order_by(Story.updated_at.desc())
        return [StoryResponse.model_validate(item) for item in self.session.scalars(statement)]

    def get(self, story_id: str) -> Story:
        story = self.session.get(Story, story_id)
        if story is None:
            raise AppError("Story not found", "story_not_found", 404)
        return story

    def create(self, payload: StoryCreate) -> StoryResponse:
        dataset, revision, _ = self.datasets.load_frame(payload.dataset_id)
        exploration = self.insights.explore(
            dataset.id,
            ExploreRequest(locale=payload.locale),
            record=False,
        )
        strongest = exploration.correlations.get("strongest_pairs", [])
        first_chart = exploration.charts[0].model_dump(mode="json") if exploration.charts else {}
        english = payload.locale == "en-US"
        summary = (
            (
                f"{dataset.name} contains {dataset.row_count:,} observations across "
                f"{dataset.column_count} fields. Data quality is "
                f"{revision.profile['quality_score']} / 100."
            )
            if english
            else (
                f"{dataset.name} 包含 {dataset.row_count:,} 条观测和 "
                f"{dataset.column_count} 个字段，数据质量评分为 "
                f"{revision.profile['quality_score']} / 100。"
            )
        )
        blocks = [
            {
                "id": f"block_{uuid4().hex}",
                "kind": "cover",
                "title": dataset.name,
                "body": (
                    "A guided journey from source quality to patterns and evidence."
                    if english
                    else "从数据源质量出发，循着模式与证据展开一次数据旅程。"
                ),
                "payload": {"source": dataset.source_filename},
            },
            {
                "id": f"block_{uuid4().hex}",
                "kind": "quality",
                "title": "Data readiness" if english else "数据就绪度",
                "body": (
                    (
                        f"{revision.profile['missing_cells']} missing cells and "
                        f"{revision.profile['duplicate_rows']} duplicate rows were detected."
                    )
                    if english
                    else (
                        f"检测到 {revision.profile['missing_cells']} 个缺失单元格和 "
                        f"{revision.profile['duplicate_rows']} 个重复行。"
                    )
                ),
                "payload": {"quality_score": revision.profile["quality_score"]},
            },
        ]
        if strongest:
            pair = strongest[0]
            blocks.append(
                {
                    "id": f"block_{uuid4().hex}",
                    "kind": "metric",
                    "title": "Strongest relationship" if english else "最强关系",
                    "body": (
                        f"{pair['left']} and {pair['right']} move together most clearly."
                        if english
                        else f"{pair['left']} 与 {pair['right']} 的共同变化最明显。"
                    ),
                    "payload": {"value": pair["value"]},
                }
            )
        if first_chart:
            blocks.append(
                {
                    "id": f"block_{uuid4().hex}",
                    "kind": "chart",
                    "title": first_chart.get(
                        "title", "Recommended view" if english else "推荐视图"
                    ),
                    "body": first_chart.get(
                        "reason",
                        (
                            "A useful first view of the data."
                            if english
                            else "适合作为理解这份数据的第一张图。"
                        ),
                    ),
                    "payload": first_chart,
                }
            )
        story = Story(
            id=f"story_{uuid4().hex}",
            dataset_id=dataset.id,
            title=payload.title
            or (f"{dataset.name}: data story" if english else f"{dataset.name}：数据故事"),
            summary=summary,
            blocks=blocks,
        )
        self.session.add(story)
        self.session.commit()
        self.session.refresh(story)
        return StoryResponse.model_validate(story)

    def update(self, story_id: str, payload: StoryUpdate) -> StoryResponse:
        story = self.get(story_id)
        changes = payload.model_dump(exclude_unset=True, mode="json")
        for key, value in changes.items():
            setattr(story, key, value)
        self.session.commit()
        self.session.refresh(story)
        return StoryResponse.model_validate(story)

    def delete(self, story_id: str) -> None:
        story = self.get(story_id)
        self.session.delete(story)
        self.session.commit()
        for file_format in ("html", "pdf"):
            (self.export_root / f"{story_id}.{file_format}").unlink(missing_ok=True)

    def export(self, story_id: str, file_format: str, locale: str = "zh-CN") -> Path:
        story = self.get(story_id)
        if file_format not in {"html", "pdf"}:
            raise AppError("Story exports support HTML and PDF", "unsupported_export_format", 400)
        self.export_root.mkdir(parents=True, exist_ok=True)
        destination = self.export_root / f"{story.id}.{file_format}"
        return (
            export_html(story, destination, locale)
            if file_format == "html"
            else export_pdf(story, destination)
        )
