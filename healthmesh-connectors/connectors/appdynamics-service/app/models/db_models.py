from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class AppDynamicsApplication(Base):
    __tablename__ = "applications"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="NORMAL") # NORMAL, WARNING, CRITICAL
    node_count = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AppDynamicsNode(Base):
    __tablename__ = "app_nodes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    application_name = Column(String(100), nullable=False)
    name = Column(String(100), unique=True, nullable=False)
    tier_name = Column(String(100), default="DefaultTier")
    status = Column(String(50), default="ACTIVE") # ACTIVE, INACTIVE
    host = Column(String(100), nullable=True)
    port = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AppDynamicsTransaction(Base):
    __tablename__ = "transactions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    application_name = Column(String(100), nullable=False)
    name = Column(String(150), nullable=False)
    call_count = Column(Integer, default=0)
    average_response_time_ms = Column(Float, default=0.0)
    error_percentage = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class AppDynamicsMetric(Base):
    __tablename__ = "app_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    application_name = Column(String(100), nullable=False)
    cpu_usage_percentage = Column(Float, default=0.0)
    memory_usage_mb = Column(Float, default=0.0)
    throughput_calls_per_min = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow)

class AppDynamicsAlert(Base):
    __tablename__ = "app_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # APPLICATION, NODE, TRANSACTION
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # LATENCY_HIGH, ERROR_RATE_HIGH, NODE_DOWN
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
