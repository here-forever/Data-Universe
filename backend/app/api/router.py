from fastapi import APIRouter

from app.api.routes import (
    auth,
    charts,
    cleaning,
    dashboards,
    data_sources,
    data_views,
    datasets,
    health,
    imports,
    permissions,
    projects,
    sql_workspace,
    tasks,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(imports.router)
api_router.include_router(datasets.router)
api_router.include_router(data_sources.router)
api_router.include_router(data_views.router)
api_router.include_router(charts.router)
api_router.include_router(dashboards.router)
api_router.include_router(cleaning.router)
api_router.include_router(sql_workspace.router)
api_router.include_router(tasks.router)
api_router.include_router(health.router)
api_router.include_router(projects.router)
api_router.include_router(permissions.router)
