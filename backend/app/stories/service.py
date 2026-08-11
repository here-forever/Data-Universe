from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.data.service import DatasetService
from app.i18n import render
from app.insights.schemas import ExploreRequest
from app.insights.service import InsightService
from app.models import Story
from app.stories.exporter import export_html, export_pdf
from app.stories.repository import StoryRepository
from app.stories.schemas import StoryCreate, StoryResponse, StoryUpdate


class StoryService:
    def __init__(
        self,
        session: Session,
        settings: Settings | None = None,
        *,
        datasets: DatasetService | None = None,
        insights: InsightService | None = None,
        repository: StoryRepository | None = None,
    ) -> None:
        self.settings = settings or get_settings()
        self.datasets = datasets or DatasetService(session, self.settings)
        self.insights = insights or InsightService(session, self.settings, datasets=self.datasets)
        self.repository = repository or StoryRepository(session)
        self.export_root = Path(self.settings.export_storage_root)

    def list(self) -> list[StoryResponse]:
        return [StoryResponse.model_validate(item) for item in self.repository.list()]

    def get(self, story_id: str) -> Story:
        story = self.repository.get(story_id)
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
        strongest = exploration.correlations.strongest_pairs
        first_chart = exploration.charts[0].model_dump(mode="json") if exploration.charts else {}
        locale = payload.locale
        summary = render(
            "story.summary",
            locale,
            name=dataset.name,
            rows=dataset.row_count,
            columns=dataset.column_count,
            score=revision.profile["quality_score"],
        )
        blocks = [
            {
                "id": f"block_{uuid4().hex}",
                "kind": "cover",
                "title": dataset.name,
                "body": render("story.cover.body", locale),
                "payload": {"source": dataset.source_filename},
            },
            {
                "id": f"block_{uuid4().hex}",
                "kind": "quality",
                "title": render("story.quality.title", locale),
                "body": render(
                    "story.quality.body",
                    locale,
                    missing=revision.profile["missing_cells"],
                    duplicates=revision.profile["duplicate_rows"],
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
                    "title": render("story.relationship.title", locale),
                    "body": render(
                        "story.relationship.body",
                        locale,
                        left=pair.left,
                        right=pair.right,
                    ),
                    "payload": {"value": pair.value},
                }
            )
        if first_chart:
            blocks.append(
                {
                    "id": f"block_{uuid4().hex}",
                    "kind": "chart",
                    "title": first_chart.get("title", render("story.chart.title", locale)),
                    "body": first_chart.get(
                        "reason",
                        render("story.chart.body", locale),
                    ),
                    "payload": first_chart,
                }
            )
        story = Story(
            id=f"story_{uuid4().hex}",
            dataset_id=dataset.id,
            title=payload.title or render("story.title", locale, name=dataset.name),
            summary=summary,
            blocks=blocks,
        )
        return StoryResponse.model_validate(self.repository.add(story))

    def update(self, story_id: str, payload: StoryUpdate) -> StoryResponse:
        story = self.get(story_id)
        changes = payload.model_dump(exclude_unset=True, mode="json")
        for key, value in changes.items():
            setattr(story, key, value)
        return StoryResponse.model_validate(self.repository.commit(story))

    def delete(self, story_id: str) -> None:
        story = self.get(story_id)
        self.repository.delete(story)
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
