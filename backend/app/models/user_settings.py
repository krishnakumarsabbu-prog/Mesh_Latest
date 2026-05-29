import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, Integer, JSON, DateTime, ForeignKey, Text
from app.db.base import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)

    email_notifications = Column(Boolean, default=True, nullable=False)
    in_app_notifications = Column(Boolean, default=True, nullable=False)
    alert_severity_info = Column(Boolean, default=True, nullable=False)
    alert_severity_warning = Column(Boolean, default=True, nullable=False)
    alert_severity_critical = Column(Boolean, default=True, nullable=False)
    digest_frequency = Column(String, default="daily", nullable=False)
    quiet_hours_enabled = Column(Boolean, default=False, nullable=False)
    quiet_hours_start = Column(String, default="22:00", nullable=False)
    quiet_hours_end = Column(String, default="07:00", nullable=False)
    dashboard_alert_subscriptions = Column(JSON, default=list)
    notification_channels = Column(JSON, default=list)

    theme = Column(String, default="light", nullable=False)
    default_dashboard_layout = Column(String, default="grid", nullable=False)
    density = Column(String, default="comfortable", nullable=False)
    chart_animations = Column(Boolean, default=True, nullable=False)
    sidebar_collapsed = Column(Boolean, default=False, nullable=False)
    default_landing_page = Column(String, default="/dashboard", nullable=False)
    table_row_density = Column(String, default="default", nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_token_hash = Column(String, nullable=False, unique=True)
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    last_active = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    expires_at = Column(DateTime, nullable=True)
