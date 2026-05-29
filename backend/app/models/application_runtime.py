from sqlalchemy import Column, String, Boolean, DateTime, Text, Float, Integer, ForeignKey
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class ApplicationRuntimeMetric(Base):
    __tablename__ = "application_runtime_metrics"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_connector_id = Column(String, ForeignKey("project_connectors.id", ondelete="CASCADE"), nullable=True, index=True)
    connector_type = Column(String, nullable=True)

    application_name = Column(String, nullable=False, index=True)
    environment = Column(String, nullable=True)
    service_name = Column(String, nullable=True)
    namespace = Column(String, nullable=True)

    metric_category = Column(String, nullable=True)
    metric_key = Column(String, nullable=False, index=True)
    metric_name = Column(String, nullable=True)
    metric_scope = Column(String, nullable=True)

    metric_value = Column(Float, nullable=True)
    metric_unit = Column(String, nullable=True)

    warning_threshold = Column(Float, nullable=True)
    critical_threshold = Column(Float, nullable=True)

    health_score = Column(Float, nullable=True)
    severity = Column(String, nullable=True)

    source_index = Column(String, nullable=True)
    source_entity = Column(String, nullable=True)

    trace_id = Column(String, nullable=True)
    correlation_id = Column(String, nullable=True)
    transaction_id = Column(String, nullable=True)

    collected_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)


class ApplicationMetricHistory(Base):
    __tablename__ = "application_metric_history"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    application_name = Column(String, nullable=False, index=True)
    environment = Column(String, nullable=True)

    metric_key = Column(String, nullable=False, index=True)
    metric_value = Column(Float, nullable=True)
    metric_unit = Column(String, nullable=True)

    aggregation_type = Column(String, nullable=True)

    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    avg_value = Column(Float, nullable=True)
    p95_value = Column(Float, nullable=True)
    p99_value = Column(Float, nullable=True)

    collected_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)


class ApplicationHealthSnapshot(Base):
    __tablename__ = "application_health_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    application_name = Column(String, nullable=False, index=True)
    environment = Column(String, nullable=True)
    project_connector_id = Column(String, ForeignKey("project_connectors.id", ondelete="CASCADE"), nullable=True, index=True)

    overall_health_score = Column(Float, nullable=True)
    runtime_health_score = Column(Float, nullable=True)
    infrastructure_health_score = Column(Float, nullable=True)
    api_health_score = Column(Float, nullable=True)
    database_health_score = Column(Float, nullable=True)
    mq_health_score = Column(Float, nullable=True)

    active_alerts = Column(Integer, default=0)
    critical_alerts = Column(Integer, default=0)

    total_requests = Column(Integer, nullable=True)
    failed_requests = Column(Integer, nullable=True)

    avg_response_time = Column(Float, nullable=True)
    p95_response_time = Column(Float, nullable=True)
    p99_response_time = Column(Float, nullable=True)

    snapshot_timestamp = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
