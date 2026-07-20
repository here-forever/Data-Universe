from pathlib import Path

from app.core.errors import AppError


class LocalFileStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).expanduser().resolve()

    def save_upload(
        self,
        *,
        project_id: str,
        uploaded_file_id: str,
        file_name: str,
        content: bytes,
    ) -> str:
        target_dir = self.root / project_id / uploaded_file_id
        target_dir.mkdir(parents=True, exist_ok=True)

        target_path = target_dir / safe_file_name(file_name)
        if target_path.exists():
            raise AppError(
                message="Uploaded file already exists in storage",
                code="stored_file_conflict",
                status_code=409,
            )

        temp_path = target_path.with_name(f"{target_path.name}.tmp")
        temp_path.write_bytes(content)
        temp_path.replace(target_path)
        return str(target_path)


def safe_file_name(file_name: str) -> str:
    raw_name = Path(file_name).name or "uploaded_file"
    cleaned = "".join(
        char if char.isalnum() or char in {".", "-", "_"} else "_" for char in raw_name
    )
    return cleaned.strip("._") or "uploaded_file"
