from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db_session
from app.stories.schemas import StoryCreate, StoryResponse, StoryUpdate
from app.stories.service import StoryService

router = APIRouter(prefix="/stories", tags=["stories"])


def service(session: Session = Depends(get_db_session)) -> StoryService:
    return StoryService(session)


@router.get("", response_model=list[StoryResponse])
def list_stories(story_service: StoryService = Depends(service)) -> list[StoryResponse]:
    return story_service.list()


@router.post("", response_model=StoryResponse, status_code=status.HTTP_201_CREATED)
def create_story(
    payload: StoryCreate,
    story_service: StoryService = Depends(service),
) -> StoryResponse:
    return story_service.create(payload)


@router.get("/{story_id}", response_model=StoryResponse)
def story_detail(
    story_id: str,
    story_service: StoryService = Depends(service),
) -> StoryResponse:
    return StoryResponse.model_validate(story_service.get(story_id))


@router.patch("/{story_id}", response_model=StoryResponse)
def update_story(
    story_id: str,
    payload: StoryUpdate,
    story_service: StoryService = Depends(service),
) -> StoryResponse:
    return story_service.update(story_id, payload)


@router.delete("/{story_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_story(
    story_id: str,
    story_service: StoryService = Depends(service),
) -> Response:
    story_service.delete(story_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{story_id}/export", response_class=FileResponse)
def export_story(
    story_id: str,
    format: str = Query(default="html", pattern="^(html|pdf)$"),
    locale: str = Query(default="zh-CN", pattern="^(zh-CN|en-US)$"),
    story_service: StoryService = Depends(service),
) -> FileResponse:
    path = story_service.export(story_id, format, locale)
    media_type = "text/html" if format == "html" else "application/pdf"
    return FileResponse(path, media_type=media_type, filename=path.name)
