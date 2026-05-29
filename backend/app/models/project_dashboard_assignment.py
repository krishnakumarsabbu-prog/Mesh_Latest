import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Float, JSON, Text, UniqueConstraint, ForeignKey
from app.db.base import Base


class ProjectDashboardAssignment(Base):
    __tablename__ = "project_dashboard_assignments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id"), nullable=False, index=True)
    template_id = Column(String, ForeignKey("dashboard_templates.id"), nullable=False, index=True)
    display_name = Column(String, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    refresh_interval_seconds = Column(Integer, default=60, nullable=False)
    assigned_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("project_id", "template_id", name="uq_project_template"),
    )


class ProjectDashboardWidgetOverride(Base):
    __tablename__ = "project_dashboard_widget_overrides"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    assignment_id = Column(String, ForeignKey("project_dashboard_assignments.id"), nullable=False, index=True)
    widget_id = Column(String, ForeignKey("dashboard_widgets.id"), nullable=False, index=True)
    is_hidden = Column(Boolean, default=False, nullable=False)
    title_override = Column(String, nullable=True)
    sort_order_override = Column(Integer, nullable=True)
    threshold_config_override = Column(JSON, nullable=True)
    display_config_override = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("assignment_id", "widget_id", name="uq_assignment_widget"),
    )
