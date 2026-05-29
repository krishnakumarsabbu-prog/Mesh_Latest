from sqlalchemy import Column, String, Boolean, DateTime, Float, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.db.base import Base


class ProjectConnectorMetric(Base):
    __tablename__ = "project_connector_metrics"
    __table_args__ = (
        UniqueConstraint("project_connector_id", "metric_template_id", name="uq_pcm_connector_template"),
    )

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_connector_id = Column(String, ForeignKey("project_connectors.id", ondelete="CASCADE"), nullable=False, index=True)
    metric_template_id = Column(String, ForeignKey("metric_templates.id", ondelete="CASCADE"), nullable=False, index=True)

    is_enabled = Column(Boolean, default=True, nullable=False)
    is_critical = Column(Boolean, default=False, nullable=False)

    threshold_warning = Column(Float, nullable=True)
    threshold_critical = Column(Float, nullable=True)

    label_override = Column(String, nullable=True)
    query_config_override = Column(JSON, nullable=True)

    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    metric_template = relationship("MetricTemplate", lazy="select")
