from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.task import Task as TaskModel


class TaskRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_task(self, task: TaskModel) -> TaskModel:
        self.session.add(task)
        self.session.commit()
        self.session.refresh(task)
        return task

    def get_task(self, task_id: str) -> TaskModel | None:
        return self.session.get(TaskModel, task_id)

    def update_task(self, task: TaskModel) -> TaskModel:
        self.session.add(task)
        self.session.commit()
        self.session.refresh(task)
        return task

    def list_tasks(self, project_id: str | None = None) -> list[TaskModel]:
        statement = select(TaskModel).order_by(TaskModel.created_at.desc())
        if project_id:
            statement = statement.where(TaskModel.project_id == project_id)
        return list(self.session.scalars(statement))
