from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class ReplicaSet(Base):
    __tablename__ = "replica_sets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="PRIMARY_OK") # PRIMARY_OK, NO_PRIMARY, SPLIT_BRAIN
    node_count = Column(Integer, default=3)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MongoNode(Base):
    __tablename__ = "mongo_nodes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    replica_set_name = Column(String(100), nullable=False)
    name = Column(String(100), unique=True, nullable=False)
    role = Column(String(50), default="SECONDARY") # PRIMARY, SECONDARY, ARBITER
    status = Column(String(50), default="ONLINE") # ONLINE, OFFLINE
    host = Column(String(100), nullable=True)
    port = Column(Integer, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CollectionMetric(Base):
    __tablename__ = "collections"
    id = Column(Integer, primary_key=True, autoincrement=True)
    database_name = Column(String(100), nullable=False)
    name = Column(String(100), nullable=False)
    document_count = Column(Integer, default=0)
    size_bytes = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ReplicaMetric(Base):
    __tablename__ = "replica_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    node_name = Column(String(100), nullable=False)
    read_latency_ms = Column(Float, default=1.0)
    write_latency_ms = Column(Float, default=2.5)
    sync_lag_seconds = Column(Integer, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow)

class MongoAlert(Base):
    __tablename__ = "mongo_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # REPLICA_SET, NODE, COLLECTION
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # ROLE_MISMATCH, PRIMARY_DOWN, SYNC_LAG
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
