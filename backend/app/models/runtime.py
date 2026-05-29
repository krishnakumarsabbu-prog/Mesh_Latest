from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Text, JSON, Float
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.db.base import Base

class RuntimeDataCenter(Base):
    __tablename__ = "runtime_data_centers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    short_name = Column(String, unique=True, index=True, nullable=False)
    region = Column(String, nullable=True)
    zone = Column(String, nullable=True)
    asset_count = Column(Integer, default=0)

    assets = relationship("RuntimeAsset", back_populates="data_center", cascade="all, delete-orphan")


class RuntimeAsset(Base):
    __tablename__ = "runtime_assets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, index=True, nullable=False)
    asset_type = Column(String, nullable=False)  # e.g., MQ_QMGR, MONGO_NODE, ORACLE_DB, KAFKA_BROKER, OCP_POD, SERVER
    tech_stack = Column(String, nullable=False)  # e.g., ibm_mq, mongodb, oracle, mssql, kafka, ocp, vm
    environment = Column(String, nullable=False)  # e.g., PRODUCTION, UAT, DR
    host = Column(String, nullable=True)
    port = Column(Integer, nullable=True)
    platform = Column(String, default="LINUX")
    
    data_center_short = Column(String, ForeignKey("runtime_data_centers.short_name", ondelete="CASCADE"), nullable=True)
    
    latest_confidence_level = Column(Integer, default=3)  # 1 - 4
    confidence_label = Column(String, default="MEDIUM")  # HIGH | MEDIUM | LOW | CONFLICT | UNKNOWN
    confidence_score = Column(Integer, default=65)        # 0-100 engine-computed score
    latest_operational_state = Column(String, default="ACTIVE")  # ACTIVE, STANDBY, UNKNOWN
    latest_replication_role = Column(String, default="NONE")  # PRIMARY, SECONDARY, PHYSICAL_STANDBY, MONGOS, etc.
    write_authority = Column(Boolean, default=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow)
    is_deterministic = Column(Boolean, default=True)
    data_source = Column(String, nullable=False)  # e.g., cmdb, mongodb, oracle_oem, ibm_mq
    metadata_json = Column(JSON, nullable=True)  # Store specific columns like cluster, rs_nm, node chains

    data_center = relationship("RuntimeDataCenter", back_populates="assets")


class DataSourceImport(Base):
    __tablename__ = "data_source_imports"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_name = Column(String, nullable=False)  # e.g. ibm_mq, mongodb, oracle_oem, cmdb
    file_name = Column(String, nullable=False)
    imported_at = Column(DateTime, default=datetime.utcnow)
    record_count = Column(Integer, default=0)
    status = Column(String, default="SUCCESS")  # SUCCESS, PARTIAL, FAILED
    errors = Column(JSON, nullable=True)


class ApplicationIntent(Base):
    __tablename__ = "application_intents"

    application_id = Column(String, primary_key=True, index=True)
    application_name = Column(String, nullable=False)
    intended_active_dcs = Column(JSON, nullable=False)  # e.g., ["IBB1", "SHV"]
    intended_primary_dc = Column(String, nullable=False)  # e.g., "IBB1"
    intended_environments = Column(JSON, nullable=True)  # e.g., ["PRODUCTION"]
    failover_type = Column(String, default="AUTOMATIC")
    replication_model = Column(String, default="SINGLE_WRITER")  # SINGLE_WRITER, MULTI_WRITER
    required_tech_stacks = Column(JSON, nullable=False)  # e.g., ["oracle", "ibm_mq"]
    alignment_status = Column(String, default="UNKNOWN")  # ALIGNED | DRIFTED | UNKNOWN
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SourceProposal(Base):
    __tablename__ = "source_proposals"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_name = Column(String, nullable=False)
    system = Column(String, nullable=False)
    signal_type = Column(String, nullable=False)
    tech_stack = Column(String, nullable=False)
    rationale = Column(Text, nullable=False)
    is_deterministic_claim = Column(Boolean, default=True)
    proposed_by = Column(String, nullable=False)
    proposed_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="PENDING")  # PENDING, ACCEPTED, REJECTED


class RuntimeAuditLog(Base):
    __tablename__ = "runtime_audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    event_type = Column(String, nullable=False)  # IMPORT, DRIFT_DETECTED, CONFLICT_DETECTED, INTENT_CREATED, etc.
    description = Column(Text, nullable=False)
    actor = Column(String, default="operator")
    source = Column(String, nullable=True)
    application_id = Column(String, nullable=True)
    occurred_at = Column(DateTime, default=datetime.utcnow)
