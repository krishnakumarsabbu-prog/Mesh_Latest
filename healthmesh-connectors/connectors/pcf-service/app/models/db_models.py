from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class PCFApp(Base):
    __tablename__ = "pcf_apps"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    org = Column(String(100), nullable=False)
    space = Column(String(100), nullable=False)
    instances_desired = Column(Integer, default=2)
    instances_running = Column(Integer, default=2)
    status = Column(String(50), default="STARTED") # STARTED, STOPPED, CRASHED
    updated_at = Column(DateTime, default=datetime.utcnow)

class DiegoCell(Base):
    __tablename__ = "diego_cells"
    id = Column(Integer, primary_key=True, autoincrement=True)
    cell_id = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="HEALTHY") # HEALTHY, DEGRADED
    memory_utilization_pct = Column(Float, default=45.0)
    updated_at = Column(DateTime, default=datetime.utcnow)
