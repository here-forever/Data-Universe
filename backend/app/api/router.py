from fastapi import APIRouter

from app.api.routes import collaboration, health, insights, library, stories

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(library.router)
api_router.include_router(insights.router)
api_router.include_router(stories.router)
api_router.include_router(collaboration.router)
