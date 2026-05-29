from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class BatchJob(Base):
    __tablename__ = "batch_jobs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="ACTIVE") # ACTIVE, FAILING, INACTIVE
    schedule = Column(String(100), default="0 0 * * *") # cron syntax
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BatchExecution(Base):
    __tablename__ = "batch_executions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String(100), nullable=False)
    status = Column(String(50), default="SUCCESS") # SUCCESS, FAILED, RUNNING, DELAYED
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)
    error_message = Column(String(500), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BatchSLA(Base):
    __tablename__ = "batch_slas"
    id = Column(Integer, primary_key=True, autoincrement=True)
    job_name = Column(String(100), unique=True, nullable=False)
    max_duration_seconds = Column(Integer, default=3600)
    critical_delay_threshold_seconds = Column(Integer, default=600)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class BatchAlert(Base):
    __tablename__ = "batch_alerts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    component = Column(String(100), nullable=False) # JOB, EXECUTION
    component_name = Column(String(100), nullable=False)
    alert_type = Column(String(100), nullable=False) # JOB_FAILED, SLA_BREACH, JOB_DELAYED
    severity = Column(String(50), default="WARNING") # CRITICAL, WARNING
    message = Column(String(500), nullable=False)
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
