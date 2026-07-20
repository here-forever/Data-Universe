from sqlalchemy.orm import Session

from app.models.audit import LineageEdge as LineageEdgeModel
from app.models.audit import OperationLog as OperationLogModel


class AuditRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_operation_log(self, log: OperationLogModel) -> OperationLogModel:
        self.session.add(log)
        self.session.commit()
        self.session.refresh(log)
        return log

    def save_lineage_edge(self, edge: LineageEdgeModel) -> LineageEdgeModel:
        self.session.add(edge)
        self.session.commit()
        self.session.refresh(edge)
        return edge
