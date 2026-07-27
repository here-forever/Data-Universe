from __future__ import annotations

# ruff: noqa: E402

import argparse
import json
import sys
from pathlib import Path

from sqlalchemy import func, select

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
if not (BACKEND_ROOT / "app").exists() and (Path("/app") / "app").exists():
    BACKEND_ROOT = Path("/app")
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.database import get_session_factory, import_models
from app.models.audit import LineageEdge, OperationLog
from app.models.data_view import ChartDefinition, DashboardDefinition, DataView, ReportExport
from app.models.dataset import Dataset
from app.models.project import Project, ProjectMember
from app.models.task import Task


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate a migrated seeded release database.")
    parser.add_argument("--project-id", default="prj_demo")
    args = parser.parse_args()

    import_models()
    with get_session_factory()() as session:
        project = session.get(Project, args.project_id)
        if project is None:
            fail(f"Project not found: {args.project_id}")

        checks = {
            "project_members": count_for_project(session, ProjectMember, args.project_id),
            "datasets": count_for_project(session, Dataset, args.project_id),
            "data_views": count_for_project(session, DataView, args.project_id),
            "charts": count_for_project(session, ChartDefinition, args.project_id),
            "dashboards": count_for_project(session, DashboardDefinition, args.project_id),
            "report_exports": count_for_project(session, ReportExport, args.project_id),
            "tasks": count_for_project(session, Task, args.project_id),
            "operation_logs": count_for_project(session, OperationLog, args.project_id),
            "lineage_edges": count_for_project(session, LineageEdge, args.project_id),
        }

    required_nonzero = (
        "project_members",
        "datasets",
        "data_views",
        "charts",
        "dashboards",
        "tasks",
        "operation_logs",
        "lineage_edges",
    )
    missing = [name for name in required_nonzero if checks[name] == 0]
    if missing:
        fail(f"Release validation failed; empty required resources: {', '.join(missing)}")

    print(
        json.dumps(
            {
                "status": "ok",
                "project_id": args.project_id,
                "project_name": project.name,
                "checks": checks,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def count_for_project(session, model, project_id: str) -> int:
    value = session.scalar(
        select(func.count()).select_from(model).where(model.project_id == project_id)
    )
    return int(value or 0)


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


if __name__ == "__main__":
    main()
