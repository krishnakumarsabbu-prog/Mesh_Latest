from sqlalchemy import Column, String, Integer, DateTime, Text, JSON
from datetime import datetime
import uuid
from app.db.base import Base


class MigrationRun(Base):
    __tablename__ = "migration_runs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, nullable=True, index=True)  # References dc_exit_sessions
    source_dc = Column(String, nullable=False, index=True)
    target_dc = Column(String, nullable=False, index=True)
    status = Column(String, default="PENDING", nullable=False)  # PENDING | RUNNING | COMPLETED | FAILED | ROLLING_BACK
    mode = Column(String, default="STAGED", nullable=False)  # DRY_RUN | STAGED | EXPRESS
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class MigrationWaveRecord(Base):
    __tablename__ = "migration_waves"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, nullable=False, index=True)
    wave_number = Column(Integer, nullable=False)
    status = Column(String, default="pending", nullable=False)  # pending | running | complete | failed
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AppMigrationRecord(Base):
    __tablename__ = "app_migrations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, nullable=False, index=True)
    wave_id = Column(String, nullable=True, index=True)
    app_id = Column(String, nullable=False, index=True)
    app_name = Column(String, nullable=True)
    status = Column(String, default="pending", nullable=False)  # pending | running | verifying | completed | failed | rolled_back | skipped
    current_phase = Column(String, nullable=True)  # NOTIFY | DATA_PLANE | MESSAGING_PLANE | COMPUTE_PLANE | TRAFFIC_SHIFT | CONFIG_RIPPLE | VALIDATE
    progress = Column(Integer, default=0, nullable=False)
    error_message = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=True)
    end_time = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class AdapterCallAudit(Base):
    __tablename__ = "adapter_call_audits"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    run_id = Column(String, nullable=False, index=True)
    app_id = Column(String, nullable=True, index=True)
    adapter_name = Column(String, nullable=False)  # ComputeAdapter, StorageAdapter, etc.
    operation = Column(String, nullable=False)  # provisionWorkload, scaleUp, etc.
    target = Column(String, nullable=True)
    parameters_json = Column(JSON, nullable=True)
    status = Column(String, nullable=False)  # SUCCESS | FAILED
    response_json = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False)
