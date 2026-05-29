from sqlalchemy import Column, String, Boolean, DateTime, Text, JSON, Integer, Float, Enum as SAEnum, ForeignKey
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class MetricType(str, enum.Enum):
    NUMBER = "number"
    PERCENTAGE = "percentage"
    TIME_SERIES = "time_series"
    TABLE = "table"
    STATUS = "status"
    BOOLEAN = "boolean"
    DURATION = "duration"


class AggregationType(str, enum.Enum):
    SUM = "sum"
    AVG = "avg"
    MAX = "max"
    MIN = "min"
    COUNT = "count"
    LATEST = "latest"


class ParserType(str, enum.Enum):
    JSON_PATH = "json_path"
    REGEX = "regex"
    XML_PATH = "xml_path"
    CSV = "csv"
    PLAIN_TEXT = "plain_text"
    CUSTOM = "custom"


class MetricTemplate(Base):
    __tablename__ = "metric_templates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    catalog_entry_id = Column(String, ForeignKey("connector_catalog.id", ondelete="CASCADE"), nullable=False)

    name = Column(String, nullable=False)
    metric_key = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True)
    display_order = Column(Integer, default=0)

    metric_type = Column(SAEnum(MetricType), default=MetricType.NUMBER)
    unit = Column(String, nullable=True)
    aggregation_type = Column(SAEnum(AggregationType), default=AggregationType.LATEST)

    threshold_warning = Column(Float, nullable=True)
    threshold_critical = Column(Float, nullable=True)

    query_config = Column(JSON, nullable=True)
    parser_type = Column(SAEnum(ParserType), default=ParserType.JSON_PATH)
    result_mapping = Column(JSON, nullable=True)
    transformation_rules = Column(JSON, nullable=True)

    is_enabled_by_default = Column(Boolean, default=True)
    is_required = Column(Boolean, default=False)
    is_custom = Column(Boolean, default=False)

    # Application-scoped fields
    metric_scope = Column(String, nullable=True)
    source_service = Column(String, nullable=True)
    application_name = Column(String, nullable=True)
    environment = Column(String, nullable=True)
    visualization_type = Column(String, nullable=True)
    dynamic_threshold = Column(Boolean, default=False)
    severity_weight = Column(Integer, default=1)
    health_impact_score = Column(Float, nullable=True)
    metric_query_template = Column(Text, nullable=True)

    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
