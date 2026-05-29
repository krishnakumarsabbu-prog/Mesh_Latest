import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, JSON, DateTime, Text, ForeignKey, Enum as SAEnum
import enum
from app.db.base import Base


class IntegrationType(str, enum.Enum):
    SLACK = "slack"
    TEAMS = "teams"
    EMAIL_SMTP = "email_smtp"
    PAGERDUTY = "pagerduty"
    WEBHOOK = "webhook"
    GENERIC = "generic"


class IntegrationStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ERROR = "error"
    PENDING = "pending"


class PlatformIntegration(Base):
    __tablename__ = "platform_integrations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    integration_type = Column(SAEnum(IntegrationType), nullable=False)
    status = Column(SAEnum(IntegrationStatus), default=IntegrationStatus.PENDING, nullable=False)
    config = Column(JSON, default=dict)
    encrypted_secrets = Column(JSON, default=dict)
    description = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    last_tested_at = Column(DateTime, nullable=True)
    last_test_result = Column(JSON, nullable=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    tenant_id = Column(String, default="default", nullable=False)
