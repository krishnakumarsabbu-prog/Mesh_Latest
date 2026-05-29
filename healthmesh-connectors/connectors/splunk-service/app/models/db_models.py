from sqlalchemy import Column, String, Integer, DateTime, Boolean
from shared.database.session import Base
from shared.ingestion.engine import IngestionLogBase
from datetime import datetime

class IngestionLog(IngestionLogBase):
    __tablename__ = "ingestion_logs"

class SplunkIndex(Base):
    __tablename__ = "splunk_indexes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), unique=True, nullable=False)
    status = Column(String(50), default="ACTIVE")
    events_indexed_count = Column(Integer, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow)

class LogExceptionRecord(Base):
    __tablename__ = "log_exceptions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    index_name = Column(String(100), nullable=False)
    exception_class = Column(String(100), nullable=False) # NullPointerException, SqlTimeoutException
    message = Column(String(500), nullable=False)
    occurrences = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow)
