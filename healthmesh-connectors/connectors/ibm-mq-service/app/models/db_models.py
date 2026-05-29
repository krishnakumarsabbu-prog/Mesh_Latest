from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class QueueManager(Base):
    __tablename__ = "queue_managers"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="RUNNING") # RUNNING, STOPPED, ALERT
    host = Column(String(100), nullable=True)
    port = Column(Integer, nullable=True)
    channel_count = Column(Integer, default=0)
    queue_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Queue(Base):
    __tablename__ = "queues"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    queue_manager_name = Column(String(100), nullable=False)
    current_depth = Column(Integer, default=0)
    max_depth = Column(Integer, default=5000)
    open_input_count = Column(Integer, default=0)
    open_output_count = Column(Integer, default=0)
    backlog_detected = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class Channel(Base):
    __tablename__ = "channels"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    queue_manager_name = Column(String(100), nullable=False)
    channel_type = Column(String(50), default="SVRCONN") # SENDER, RECEIVER, SVRCONN
    status = Column(String(50), default="RUNNING") # RUNNING, STOPPED, RETRYING, INACTIVE
    connection_name = Column(String(200), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class QueueMetric(Base):
    __tablename__ = "queue_metrics"
    id = Column(Integer, primary_key=True, autoincrement=True)
    queue_name = Column(String(100), nullable=False)
    queue_manager_name = Column(String(100), nullable=False)
    depth = Column(Integer, nullable=False)
    msg_in_rate = Column(Float, default=0.0)
    msg_out_rate = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow)

class MQAlert(Base):
    __tablename__ = "mq_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # QMGR, QUEUE, CHANNEL
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # DEPTH_HIGH, CHANNEL_STOPPED, QMGR_DOWN
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING, INFO
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
