from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class OCPCluster(Base):
    __tablename__ = "clusters"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="READY") # READY, UNHEALTHY, ERROR
    node_count = Column(Integer, default=5)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OCPNamespace(Base):
    __tablename__ = "namespaces"
    id = Column(Integer, primary_key=True, autoincrement=True)
    cluster_name = Column(String(100), nullable=False)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="ACTIVE") # ACTIVE, TERMINATING
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OCPPod(Base):
    __tablename__ = "pods"
    id = Column(Integer, primary_key=True, autoincrement=True)
    namespace_name = Column(String(100), nullable=False)
    name = Column(String(150), unique=True, nullable=False)
    status = Column(String(50), default="RUNNING") # RUNNING, FAILED, CRASH_LOOP_BACK_OFF
    ip_address = Column(String(50), nullable=True)
    restart_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OCPDeployment(Base):
    __tablename__ = "deployments"
    id = Column(Integer, primary_key=True, autoincrement=True)
    namespace_name = Column(String(100), nullable=False)
    name = Column(String(100), nullable=False)
    replicas = Column(Integer, default=1)
    available_replicas = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class OCPPodMetric(Base):
    __tablename__ = "pod_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    pod_name = Column(String(150), nullable=False)
    cpu_usage_cores = Column(Float, default=0.01)
    memory_usage_bytes = Column(Integer, default=67108864) # default 64MB
    timestamp = Column(DateTime, default=datetime.utcnow)

class OCPAlert(Base):
    __tablename__ = "ocp_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # CLUSTER, NAMESPACE, POD, DEPLOYMENT
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # POD_CRASHING, REPLICA_MISMATCH, CLUSTER_UNHEALTHY
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
