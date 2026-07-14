from sqlalchemy import Column, String, Integer, DateTime, Text, JSON
from datetime import datetime
import uuid
from app.db.base import Base


class DCExitSession(Base):
    __tablename__ = "dc_exit_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_key = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    current_step = Column(String, default="discover", nullable=False)  # discover | analyze | decide | execute | validate
    status = Column(String, default="pending")  # pending | in-progress | complete | archived
    data_center_short = Column(String, nullable=True, index=True)  # target DC being exited
    project_id = Column(String, nullable=True, index=True)
    tenant_id = Column(String, default="default", nullable=False)
    phase_state_json = Column(JSON, nullable=True)  # per-step status payload
    discover_data_json = Column(JSON, nullable=True)
    analyze_data_json = Column(JSON, nullable=True)
    decide_data_json = Column(JSON, nullable=True)
    execute_data_json = Column(JSON, nullable=True)
    validate_data_json = Column(JSON, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
