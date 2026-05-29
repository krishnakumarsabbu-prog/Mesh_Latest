from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class VirtualService(Base):
    __tablename__ = "virtual_services"
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(200), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    tenant = Column(String(100), nullable=True)
    health_score = Column(Float, default=0.0)
    performance_score = Column(Float, default=0.0)
    security_penalty = Column(Float, default=0.0)
    resources_penalty = Column(Float, default=0.0)
    anomaly_penalty = Column(Float, default=0.0)
    active_se_count = Column(Integer, default=0)
    status = Column(String(50), default="UP")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Pool(Base):
    __tablename__ = "pools"
    id = Column(Integer, primary_key=True, autoincrement=True)
    uuid = Column(String(200), nullable=False)
    name = Column(String(200), nullable=False)
    tenant = Column(String(100), nullable=True)
    server = Column(String(100), nullable=True)
    health_score = Column(Float, default=0.0)
    performance_score = Column(Float, default=0.0)
    health_status = Column(Float, default=0.0)
    uptime = Column(Float, default=0.0)
    avg_complete_responses = Column(Float, default=0.0)
    avg_error_responses = Column(Float, default=0.0)
    new_connections = Column(Float, default=0.0)
    bandwidth = Column(Float, default=0.0)
    status = Column(String(50), default="UP")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class LoadBalancerMetric(Base):
    __tablename__ = "lb_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    resource_uuid = Column(String(200), nullable=False)
    resource_name = Column(String(200), nullable=False)
    resource_type = Column(String(50), nullable=False)  # pool or virtualservice
    metric_name = Column(String(200), nullable=False)
    metric_value = Column(Float, default=0.0)
    tenant = Column(String(100), nullable=True)
    server = Column(String(100), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

class ADCAlert(Base):
    __tablename__ = "adc_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False)
    component_name = Column(String(200), nullable=False)
    alert_type = Column(String(100), nullable=False)
    severity = Column(String(50), default="WARNING")
    message = Column(Text, nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PoolMembership(Base):
    __tablename__ = "pool_memberships"
    id = Column(Integer, primary_key=True, autoincrement=True)
    app_id = Column(String(100), nullable=False)
    pool_name = Column(String(200), nullable=False)
    tenant = Column(String(100), nullable=True)
    controller = Column(String(200), nullable=True)
    site = Column(String(100), nullable=True)
    zone = Column(String(100), nullable=True)
    enabled = Column(Boolean, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
