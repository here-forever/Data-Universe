from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.user import User as UserModel


class AuthRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_user_by_email(self, email: str) -> UserModel | None:
        return self.session.scalar(select(UserModel).where(UserModel.email == email.lower()))

    def get_user_by_id(self, user_id: str) -> UserModel | None:
        return self.session.get(UserModel, user_id)

    def save_user(self, user: UserModel) -> UserModel:
        self.session.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user
