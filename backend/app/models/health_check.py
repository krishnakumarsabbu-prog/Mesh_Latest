from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Float, Integer, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class HealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    TIMEOUT = "timeout"
    ERROR = "error"


class HealthCheck(Base):
    __tablename__ = "health_checks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connector_id = Column(String, ForeignKey("connectors.id"), nullable=False)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    status = Column(SAEnum(HealthStatus), nullable=False)
    response_time_ms = Column(Float, nullable=True)
    status_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    response_body = Column(Text, nullable=True)
    checked_at = Column(DateTime, default=datetime.utcnow)

    connector = relationship("Connector", back_populates="health_checks")
    project = relationship("Project", back_populates="health_checks")
