from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Integer, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class ProjectConnectorStatus(str, enum.Enum):
    CONFIGURED = "configured"
    UNCONFIGURED = "unconfigured"
    TESTING = "testing"
    ERROR = "error"


class ProjectConnector(Base):
    __tablename__ = "project_connectors"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    catalog_entry_id = Column(String, ForeignKey("connector_catalog.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    config = Column(Text, nullable=True)
    credentials = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True)
    priority = Column(Integer, default=0)
    status = Column(SAEnum(ProjectConnectorStatus), default=ProjectConnectorStatus.UNCONFIGURED)
    last_test_at = Column(DateTime, nullable=True)
    last_test_success = Column(Boolean, nullable=True)
    last_test_error = Column(Text, nullable=True)
    last_test_response_ms = Column(Integer, nullable=True)
    assigned_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", backref="project_connectors")
    catalog_entry = relationship("ConnectorCatalogEntry")
    assigner = relationship("User", foreign_keys=[assigned_by])
