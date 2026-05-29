from sqlalchemy import Column, String, Boolean, DateTime, Text, JSON, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class CatalogConnectorCategory(str, enum.Enum):
    OBSERVABILITY = "observability"
    APM = "apm"
    ITSM = "itsm"
    DATABASE = "database"
    MESSAGING = "messaging"
    CLOUD = "cloud"
    INFRASTRUCTURE = "infrastructure"
    CUSTOM = "custom"


class CatalogConnectorStatus(str, enum.Enum):
    ACTIVE = "active"
    DISABLED = "disabled"
    DEPRECATED = "deprecated"


class ConnectorCatalogEntry(Base):
    __tablename__ = "connector_catalog"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    slug = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    vendor = Column(String, nullable=True)
    category = Column(SAEnum(CatalogConnectorCategory), default=CatalogConnectorCategory.CUSTOM)
    status = Column(SAEnum(CatalogConnectorStatus), default=CatalogConnectorStatus.ACTIVE)
    icon = Column(String, nullable=True)
    color = Column(String, nullable=True)
    tags = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False)
    is_enabled = Column(Boolean, default=True)
    config_schema = Column(JSON, nullable=True)
    default_config = Column(JSON, nullable=True)
    test_definition = Column(JSON, nullable=True)
    docs_url = Column(String, nullable=True)
    version = Column(String, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
