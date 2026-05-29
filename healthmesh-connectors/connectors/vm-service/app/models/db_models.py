from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class ESXiHost(Base):
    __tablename__ = "esxi_hosts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="CONNECTED") # CONNECTED, NOT_RESPONDING
    cpu_cores = Column(Integer, default=64)
    memory_gb = Column(Integer, default=512)
    updated_at = Column(DateTime, default=datetime.utcnow)

class VirtualMachine(Base):
    __tablename__ = "virtual_machines"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    host_name = Column(String(100), nullable=False)
    power_state = Column(String(50), default="POWERED_ON") # POWERED_ON, POWERED_OFF
    cpu_provisioned = Column(Integer, default=4)
    ram_provisioned_gb = Column(Integer, default=16)
    updated_at = Column(DateTime, default=datetime.utcnow)
