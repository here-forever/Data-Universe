from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.imports import FileImportPreview as FileImportPreviewModel
from app.models.imports import UploadedFile as UploadedFileModel


class ImportRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_preview(
        self,
        *,
        uploaded_file: UploadedFileModel,
        preview: FileImportPreviewModel,
    ) -> FileImportPreviewModel:
        self.session.add(uploaded_file)
        self.session.flush()
        self.session.add(preview)
        self.session.commit()
        self.session.refresh(preview)
        return preview

    def save_uploaded_file(self, uploaded_file: UploadedFileModel) -> UploadedFileModel:
        self.session.add(uploaded_file)
        self.session.commit()
        self.session.refresh(uploaded_file)
        return uploaded_file

    def save_parsed_preview(
        self,
        *,
        uploaded_file: UploadedFileModel,
        preview: FileImportPreviewModel,
    ) -> FileImportPreviewModel:
        try:
            self.session.add(preview)
            self.session.add(uploaded_file)
            self.session.commit()
            self.session.refresh(preview)
            return preview
        except Exception:
            self.session.rollback()
            raise

    def update_uploaded_file(self, uploaded_file: UploadedFileModel) -> UploadedFileModel:
        self.session.add(uploaded_file)
        self.session.commit()
        self.session.refresh(uploaded_file)
        return uploaded_file

    def get_preview(self, preview_id: str) -> FileImportPreviewModel | None:
        return self.session.get(FileImportPreviewModel, preview_id)

    def get_uploaded_file(self, uploaded_file_id: str) -> UploadedFileModel | None:
        return self.session.get(UploadedFileModel, uploaded_file_id)

    def list_uploaded_files(
        self,
        project_id: str,
    ) -> list[tuple[UploadedFileModel, FileImportPreviewModel | None]]:
        uploaded_files = list(
            self.session.scalars(
                select(UploadedFileModel)
                .where(UploadedFileModel.project_id == project_id)
                .order_by(UploadedFileModel.created_at.desc(), UploadedFileModel.id.desc())
            )
        )
        if not uploaded_files:
            return []

        uploaded_file_ids = [uploaded_file.id for uploaded_file in uploaded_files]
        previews = list(
            self.session.scalars(
                select(FileImportPreviewModel)
                .where(FileImportPreviewModel.uploaded_file_id.in_(uploaded_file_ids))
                .order_by(
                    FileImportPreviewModel.created_at.desc(),
                    FileImportPreviewModel.id.desc(),
                )
            )
        )
        preview_by_uploaded_file_id: dict[str, FileImportPreviewModel] = {}
        for preview in previews:
            if (
                preview.uploaded_file_id
                and preview.uploaded_file_id not in preview_by_uploaded_file_id
            ):
                preview_by_uploaded_file_id[preview.uploaded_file_id] = preview

        return [
            (uploaded_file, preview_by_uploaded_file_id.get(uploaded_file.id))
            for uploaded_file in uploaded_files
        ]
