from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class ConnectorType(str, enum.Enum):
    REST_API = "rest_api"
    DATABASE = "database"
    MESSAGE_QUEUE = "message_queue"
    GRPC = "grpc"
    GRAPHQL = "graphql"
    WEBSOCKET = "websocket"
    CUSTOM = "custom"


class ConnectorStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    UNKNOWN = "unknown"


class Connector(Base):
    __tablename__ = "connectors"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    type = Column(SAEnum(ConnectorType), default=ConnectorType.REST_API)
    project_id = Column(String, ForeignKey("projects.id"), nullable=False)
    endpoint_url = Column(String, nullable=True)
    config = Column(Text, nullable=True)
    status = Column(SAEnum(ConnectorStatus), default=ConnectorStatus.UNKNOWN)
    is_active = Column(Boolean, default=True)
    check_interval_seconds = Column(String, default="60")
    timeout_seconds = Column(String, default="30")
    last_checked = Column(DateTime, nullable=True)
    last_status_change = Column(DateTime, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="connectors")
    health_checks = relationship("HealthCheck", back_populates="connector")
