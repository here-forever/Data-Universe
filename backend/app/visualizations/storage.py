from dataclasses import dataclass
from pathlib import Path

from app.core.errors import AppError


@dataclass(frozen=True)
class StoredReportExport:
    path: str
    byte_size: int


class ReportExportStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()

    def save(
        self,
        *,
        project_id: str,
        export_id: str,
        suffix: str,
        content: bytes,
    ) -> StoredReportExport:
        target_dir = self.root / project_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / f"{export_id}.{suffix}"
        try:
            with target.open("xb") as stream:
                stream.write(content)
        except FileExistsError as error:
            raise AppError(
                "Report export already exists",
                "report_export_storage_conflict",
                409,
            ) from error
        return StoredReportExport(path=str(target), byte_size=len(content))

    def read(self, storage_path: str) -> bytes:
        path = Path(storage_path).resolve()
        try:
            path.relative_to(self.root)
        except ValueError as error:
            raise AppError(
                "Report export path is outside managed storage",
                "report_export_storage_path_invalid",
                500,
            ) from error
        if not path.is_file():
            raise AppError("Report export file not found", "report_export_file_not_found", 404)
        return path.read_bytes()
