from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.cleaning import CleaningRecipe as CleaningRecipeModel
from app.models.cleaning import CleaningStep as CleaningStepModel


class CleaningRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_recipe(
        self,
        *,
        recipe: CleaningRecipeModel,
        steps: list[CleaningStepModel],
    ) -> CleaningRecipeModel:
        try:
            self.session.add(recipe)
            self.session.flush()
            self.session.add_all(steps)
            self.session.commit()
            self.session.refresh(recipe)
            return recipe
        except Exception:
            self.session.rollback()
            raise

    def replace_steps(
        self,
        *,
        recipe_id: str,
        steps: list[CleaningStepModel],
    ) -> None:
        try:
            self.session.execute(
                delete(CleaningStepModel).where(CleaningStepModel.recipe_id == recipe_id)
            )
            self.session.add_all(steps)
            self.session.commit()
        except Exception:
            self.session.rollback()
            raise

    def get_recipe(self, recipe_id: str) -> CleaningRecipeModel | None:
        return self.session.get(CleaningRecipeModel, recipe_id)

    def list_recipes(self, project_id: str) -> list[CleaningRecipeModel]:
        return list(
            self.session.scalars(
                select(CleaningRecipeModel)
                .where(CleaningRecipeModel.project_id == project_id)
                .order_by(CleaningRecipeModel.created_at.desc())
            )
        )

    def list_steps(self, recipe_id: str) -> list[CleaningStepModel]:
        return list(
            self.session.scalars(
                select(CleaningStepModel)
                .where(CleaningStepModel.recipe_id == recipe_id)
                .order_by(CleaningStepModel.order)
            )
        )
