from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class SCOMServer(Base):
    __tablename__ = "servers"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="ONLINE") # ONLINE, UNREACHABLE
    os_type = Column(String(50), default="WINDOWS") # WINDOWS, LINUX
    cpu_cores = Column(Integer, default=4)
    memory_mb = Column(Integer, default=16384)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class SCOMReplica(Base):
    __tablename__ = "replicas"
    id = Column(Integer, primary_key=True, autoincrement=True)
    source_server_name = Column(String(100), nullable=False)
    target_server_name = Column(String(100), nullable=False)
    replication_status = Column(String(50), default="SYNCED") # SYNCED, REPLICATING, ERROR
    replication_lag_seconds = Column(Integer, default=0)
    dr_test_status = Column(String(50), default="PASSED") # PASSED, FAILED
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class InfraMetric(Base):
    __tablename__ = "infra_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    server_name = Column(String(100), nullable=False)
    cpu_utilization_pct = Column(Float, default=0.0)
    memory_utilization_pct = Column(Float, default=0.0)
    disk_free_gb = Column(Float, default=100.0)
    timestamp = Column(DateTime, default=datetime.utcnow)

class InfraAlert(Base):
    __tablename__ = "infra_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # SERVER, REPLICA
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # HOST_DOWN, DISK_FULL, REPLICA_LAG, DR_TEST_FAILED
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
