from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class ScrapeTarget(Base):
    __tablename__ = "scrape_targets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String(100), nullable=False)
    instance = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="UP") # UP, DOWN
    last_scrape_duration_ms = Column(Float, default=12.5)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ActiveAlert(Base):
    __tablename__ = "active_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_name = Column(String(100), nullable=False)
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    instance = Column(String(100), nullable=False)
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
