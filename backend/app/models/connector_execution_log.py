"""
Connector execution log and agent health status models.

ConnectorExecutionLog: Records every connector test/sync execution with
timing, result, error details, and raw metrics snapshot.

ConnectorAgentStatus: Stores the latest aggregated health status for
each project connector — a fast-read cache updated after each sync.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class ExecutionTrigger(str, enum.Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    API = "api"


class ExecutionOutcome(str, enum.Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    AUTH_ERROR = "auth_error"
    CONFIG_ERROR = "config_error"
    SKIPPED = "skipped"


class AgentHealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    TIMEOUT = "timeout"
    ERROR = "error"
    UNKNOWN = "unknown"
    UNCONFIGURED = "unconfigured"


class ConnectorExecutionLog(Base):
    """
    Immutable audit record for each connector agent execution.

    Created after every test_connection, fetch_health, or fetch_metrics call.
    Never updated — new row per execution.
    """

    __tablename__ = "connector_execution_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_connector_id = Column(
        String,
        ForeignKey("project_connectors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    triggered_by = Column(
        SAEnum(ExecutionTrigger),
        nullable=False,
        default=ExecutionTrigger.MANUAL,
    )
    outcome = Column(
        SAEnum(ExecutionOutcome),
        nullable=False,
    )
    response_time_ms = Column(Integer, nullable=True)
    http_status_code = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    raw_response_snippet = Column(Text, nullable=True)
    metrics_snapshot = Column(Text, nullable=True)
    executed_by = Column(String, ForeignKey("users.id"), nullable=True)
    executed_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    project_connector = relationship("ProjectConnector", backref="execution_logs")
    executor = relationship("User", foreign_keys=[executed_by])


class ConnectorAgentStatus(Base):
    """
    Latest aggregated health status for a project connector.

    One row per project_connector_id. Updated (upserted) after each
    execution to provide a fast read for dashboards and status APIs.
    """

    __tablename__ = "connector_agent_status"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_connector_id = Column(
        String,
        ForeignKey("project_connectors.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    health_status = Column(
        SAEnum(AgentHealthStatus),
        nullable=False,
        default=AgentHealthStatus.UNKNOWN,
    )
    last_sync_at = Column(DateTime, nullable=True)
    last_sync_outcome = Column(SAEnum(ExecutionOutcome), nullable=True)
    last_sync_response_ms = Column(Integer, nullable=True)
    last_error = Column(Text, nullable=True)
    last_error_at = Column(DateTime, nullable=True)
    consecutive_failures = Column(Integer, default=0, nullable=False)
    total_executions = Column(Integer, default=0, nullable=False)
    total_failures = Column(Integer, default=0, nullable=False)
    uptime_percentage = Column(Integer, nullable=True)
    last_metrics_snapshot = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project_connector = relationship("ProjectConnector", backref="agent_status", uselist=False)
