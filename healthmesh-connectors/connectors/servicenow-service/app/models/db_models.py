from sqlalchemy import Column, String, Integer, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class CMDBAsset(Base):
    __tablename__ = "cmdb_assets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ci_name = Column(String(100), unique=True, nullable=False)
    ci_class = Column(String(50), nullable=False) # cmdb_ci_win_server, cmdb_ci_db_instance
    operational_status = Column(String(50), default="Operational") # Operational, Standby, Retired
    assigned_to = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)

class ServiceNowIncident(Base):
    __tablename__ = "incidents"
    id = Column(Integer, primary_key=True, autoincrement=True)
    number = Column(String(50), unique=True, nullable=False)
    short_description = Column(String(200), nullable=False)
    severity = Column(String(50), default="3 - Moderate") # 1 - Critical, 2 - High
    incident_state = Column(String(50), default="New") # New, In Progress, Resolved
    assigned_group = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
