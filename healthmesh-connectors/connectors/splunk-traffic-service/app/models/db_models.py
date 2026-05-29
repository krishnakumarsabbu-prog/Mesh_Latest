from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class TrafficLog(Base):
    __tablename__ = "traffic_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    application_name = Column(String(100), nullable=False)
    api_endpoint = Column(String(200), nullable=False)
    request_count = Column(Integer, default=0)
    error_count = Column(Integer, default=0)
    retry_count = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow)

class APIMetric(Base):
    __tablename__ = "api_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    api_endpoint = Column(String(200), unique=True, nullable=False)
    avg_latency_ms = Column(Float, default=0.0)
    success_rate = Column(Float, default=100.0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class LoadBalancer(Base):
    __tablename__ = "load_balancers"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="ACTIVE") # ACTIVE, DEGRADED, OFFLINE
    active_connections = Column(Integer, default=0)
    target_group_name = Column(String(100), default="default-target")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class TrafficAlert(Base):
    __tablename__ = "traffic_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # ENDPOINT, LOAD_BALANCER
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # TRAFFIC_SPIKE, ERROR_RATE_HIGH, RETRY_RATE_HIGH, LB_DOWN
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
