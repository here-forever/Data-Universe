from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Story


class StoryRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list(self) -> list[Story]:
        return list(self.session.scalars(select(Story).order_by(Story.updated_at.desc())))

    def get(self, story_id: str) -> Story | None:
        return self.session.get(Story, story_id)

    def add(self, story: Story) -> Story:
        self.session.add(story)
        self.session.commit()
        self.session.refresh(story)
        return story

    def commit(self, story: Story) -> Story:
        self.session.commit()
        self.session.refresh(story)
        return story

    def delete(self, story: Story) -> None:
        self.session.delete(story)
        self.session.commit()
