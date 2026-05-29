from sqlalchemy import Column, String, Integer, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class Dashboard(Base):
    __tablename__ = "dashboards"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(100), nullable=False)
    uid = Column(String(50), unique=True, nullable=False)
    status = Column(String(50), default="ACTIVE")
    updated_at = Column(DateTime, default=datetime.utcnow)

class DataSource(Base):
    __tablename__ = "datasources"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    ds_type = Column(String(50), nullable=False) # prometheus, influxdb, elasticsearch
    status = Column(String(50), default="OK") # OK, ERROR
    updated_at = Column(DateTime, default=datetime.utcnow)
