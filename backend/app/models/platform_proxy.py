from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text
from app.db.base import Base


class PlatformProxySettings(Base):
    __tablename__ = "platform_proxy_settings"

    id = Column(String, primary_key=True, default="default")
    proxy_url = Column(Text, nullable=True)
    proxy_strict_ssl = Column(Boolean, default=True, nullable=False)
    no_proxy = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=False, nullable=False)
    updated_by = Column(String, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
