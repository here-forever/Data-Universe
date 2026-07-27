from io import BytesIO
from pathlib import Path
from typing import BinaryIO

from app.core.errors import AppError


class LocalFileStorage:
    def __init__(self, root: str, *, chunk_size_bytes: int = 1024 * 1024) -> None:
        self.root = Path(root).expanduser().resolve()
        self.chunk_size_bytes = chunk_size_bytes

    def save_upload(
        self,
        *,
        project_id: str,
        uploaded_file_id: str,
        file_name: str,
        content: bytes,
    ) -> str:
        storage_path, _ = self.save_upload_stream(
            project_id=project_id,
            uploaded_file_id=uploaded_file_id,
            file_name=file_name,
            stream=BytesIO(content),
        )
        return storage_path

    def save_upload_stream(
        self,
        *,
        project_id: str,
        uploaded_file_id: str,
        file_name: str,
        stream: BinaryIO,
    ) -> tuple[str, int]:
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
        size_bytes = 0
        try:
            with temp_path.open("xb") as target:
                while chunk := stream.read(self.chunk_size_bytes):
                    target.write(chunk)
                    size_bytes += len(chunk)
            temp_path.replace(target_path)
        except Exception:
            temp_path.unlink(missing_ok=True)
            raise
        return str(target_path), size_bytes


def safe_file_name(file_name: str) -> str:
    raw_name = Path(file_name).name or "uploaded_file"
    cleaned = "".join(
        char if char.isalnum() or char in {".", "-", "_"} else "_" for char in raw_name
    )
    return cleaned.strip("._") or "uploaded_file"
