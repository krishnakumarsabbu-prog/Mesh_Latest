"""
Health Run execution models.

HealthRun: Top-level execution record for a project health run.
HealthRunConnectorResult: Per-connector result within a run.
HealthRunMetric: Individual metrics captured during a run.
HealthRunRawPayload: Raw connector payloads stored for audit/debug.
"""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class HealthRunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class HealthRunTrigger(str, enum.Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    API = "api"
    WEBHOOK = "webhook"


class RunConnectorOutcome(str, enum.Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"
    ERROR = "error"
    AUTH_ERROR = "auth_error"
    CONFIG_ERROR = "config_error"


class RunHealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    TIMEOUT = "timeout"
    ERROR = "error"
    UNKNOWN = "unknown"
    SKIPPED = "skipped"


class HealthRun(Base):
    """
    Top-level record for a project health execution run.

    Created when Run Health is triggered. Tracks lifecycle from pending
    through running to completed/failed. Aggregates final health score
    and status after all connectors are executed.
    """

    __tablename__ = "health_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    execution_id = Column(String, nullable=False, unique=True, index=True)
    project_id = Column(
        String,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    triggered_by = Column(
        SAEnum(HealthRunTrigger),
        nullable=False,
        default=HealthRunTrigger.MANUAL,
    )
    triggered_by_user_id = Column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status = Column(
        SAEnum(HealthRunStatus),
        nullable=False,
        default=HealthRunStatus.PENDING,
        index=True,
    )
    overall_health_status = Column(
        SAEnum(RunHealthStatus), nullable=True
    )
    overall_score = Column(Float, nullable=True)
    connector_count = Column(Integer, default=0)
    success_count = Column(Integer, default=0)
    failure_count = Column(Integer, default=0)
    skipped_count = Column(Integer, default=0)
    total_duration_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    contributing_factors = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", backref="health_runs")
    triggering_user = relationship("User", foreign_keys=[triggered_by_user_id])
    connector_results = relationship(
        "HealthRunConnectorResult", back_populates="health_run", cascade="all, delete-orphan"
    )
    metrics = relationship(
        "HealthRunMetric", back_populates="health_run", cascade="all, delete-orphan"
    )


class HealthRunConnectorResult(Base):
    """
    Per-connector execution result within a health run.

    One row per connector per run. Stores normalized health status,
    timing, error details, and a snippet of the raw response.
    """

    __tablename__ = "health_run_connector_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    health_run_id = Column(
        String,
        ForeignKey("health_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_connector_id = Column(
        String,
        ForeignKey("project_connectors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    connector_name = Column(String, nullable=False)
    connector_slug = Column(String, nullable=True)
    connector_category = Column(String, nullable=True)
    outcome = Column(SAEnum(RunConnectorOutcome), nullable=False)
    health_status = Column(SAEnum(RunHealthStatus), nullable=False)
    health_score = Column(Float, nullable=True)
    response_time_ms = Column(Integer, nullable=True)
    error_message = Column(Text, nullable=True)
    message = Column(Text, nullable=True)
    raw_response_snippet = Column(Text, nullable=True)
    metrics_snapshot = Column(Text, nullable=True)
    weight = Column(Float, default=1.0)
    is_enabled = Column(Boolean, default=True)
    priority = Column(Integer, default=0)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    duration_ms = Column(Integer, nullable=True)

    health_run = relationship("HealthRun", back_populates="connector_results")
    project_connector = relationship("ProjectConnector")


class HealthRunMetric(Base):
    """
    Individual metric captured from a connector during a health run.

    Provides time-series data for charting and trend analysis.
    Each metric is tied to both the run and the specific connector.
    """

    __tablename__ = "health_run_metrics"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    health_run_id = Column(
        String,
        ForeignKey("health_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_connector_id = Column(
        String,
        ForeignKey("project_connectors.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    connector_name = Column(String, nullable=True)
    metric_name = Column(String, nullable=False, index=True)
    metric_value = Column(Float, nullable=False)
    metric_unit = Column(String, nullable=True)
    metric_description = Column(Text, nullable=True)
    labels = Column(Text, nullable=True)
    captured_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    health_run = relationship("HealthRun", back_populates="metrics")


class HealthRunRawPayload(Base):
    """
    Raw connector API response payloads for audit and debug purposes.

    Stored separately from the normalized results to keep the main tables
    lean. Retained for a configurable retention period.
    """

    __tablename__ = "health_run_raw_payloads"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    health_run_id = Column(
        String,
        ForeignKey("health_runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    project_connector_id = Column(
        String,
        ForeignKey("project_connectors.id", ondelete="CASCADE"),
        nullable=True,
    )
    connector_name = Column(String, nullable=True)
    connector_slug = Column(String, nullable=True)
    payload_type = Column(String, nullable=False, default="health_response")
    raw_payload = Column(Text, nullable=True)
    payload_size_bytes = Column(Integer, nullable=True)
    captured_at = Column(DateTime, nullable=False, default=datetime.utcnow)
