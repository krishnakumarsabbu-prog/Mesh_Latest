from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class DatabaseInstance(Base):
    __tablename__ = "databases"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="OPEN") # OPEN, MOUNTED, DOWN
    db_role = Column(String(50), default="PRIMARY") # PRIMARY, PHYSICAL STANDBY
    host = Column(String(100), nullable=True)
    port = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ReplicationStatus(Base):
    __tablename__ = "replication_status"
    id = Column(Integer, primary_key=True, autoincrement=True)
    database_name = Column(String(100), nullable=False)
    replication_lag_seconds = Column(Integer, default=0)
    dr_ready = Column(Boolean, default=True)
    last_synced_at = Column(DateTime, default=datetime.utcnow)

class DBSession(Base):
    __tablename__ = "db_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    database_name = Column(String(100), nullable=False)
    session_count = Column(Integer, default=0)
    active_sessions = Column(Integer, default=0)
    blocked_sessions = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class WaitEvent(Base):
    __tablename__ = "wait_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    database_name = Column(String(100), nullable=False)
    event_name = Column(String(100), nullable=False)
    wait_class = Column(String(100), default="Other")
    total_wait_time_ms = Column(Float, default=0.0)
    avg_wait_time_ms = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow)

class DBAlert(Base):
    __tablename__ = "db_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # INSTANCE, DATAGUARD, SESSIONS
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # INSTANCE_DOWN, REPLICATION_LAG, SESSION_BLOCKED
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
