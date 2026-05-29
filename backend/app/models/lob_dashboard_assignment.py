import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, JSON, UniqueConstraint, ForeignKey

from app.db.base import Base


class LobDashboardAssignment(Base):
    __tablename__ = "lob_dashboard_assignments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lob_id = Column(String, ForeignKey("lobs.id"), nullable=False, index=True)
    template_id = Column(String, ForeignKey("dashboard_templates.id"), nullable=False, index=True)
    display_name = Column(String, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    refresh_interval_seconds = Column(Integer, default=300, nullable=False)
    assigned_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("lob_id", "template_id", name="uq_lob_template"),
    )


class LobDashboardWidgetOverride(Base):
    __tablename__ = "lob_dashboard_widget_overrides"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id = Column(String, ForeignKey("lob_dashboard_assignments.id"), nullable=False, index=True)
    widget_id = Column(String, ForeignKey("dashboard_widgets.id"), nullable=False, index=True)
    is_hidden = Column(Boolean, default=False, nullable=False)
    title_override = Column(String, nullable=True)
    sort_order_override = Column(Integer, nullable=True)
    threshold_config_override = Column(JSON, nullable=True)
    display_config_override = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("assignment_id", "widget_id", name="uq_lob_assignment_widget"),
    )
