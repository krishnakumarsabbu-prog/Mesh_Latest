import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer, Float, JSON, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum


class DashboardScope(str, enum.Enum):
    PROJECT = "project"
    TEAM = "team"
    LOB = "lob"
    GLOBAL = "global"


class DashboardVisibility(str, enum.Enum):
    GLOBAL = "global"
    LOB = "lob"
    PRIVATE = "private"


class WidgetType(str, enum.Enum):
    KPI_CARD = "kpi_card"
    GAUGE = "gauge"
    PROGRESS_RING = "progress_ring"
    SPARKLINE = "sparkline"
    LINE_CHART = "line_chart"
    AREA_CHART = "area_chart"
    BAR_CHART = "bar_chart"
    STACKED_BAR = "stacked_bar"
    PIE_DONUT = "pie_donut"
    SLA_CARD = "sla_card"
    ALERT_PANEL = "alert_panel"
    STATUS_TIMELINE = "status_timeline"
    COMPARISON_GRID = "comparison_grid"
    TABLE_WIDGET = "table_widget"
    HEATMAP = "heatmap"
    HEALTH_DISTRIBUTION = "health_distribution"


class MetricSourceScope(str, enum.Enum):
    CONNECTOR_METRIC = "connector_metric"
    TEAM_AGGREGATE = "team_aggregate"
    LOB_AGGREGATE = "lob_aggregate"
    PROJECT_AGGREGATE = "project_aggregate"


class AggregationMode(str, enum.Enum):
    LATEST = "latest"
    AVG = "avg"
    SUM = "sum"
    MIN = "min"
    MAX = "max"
    COUNT = "count"
    P95 = "p95"
    P99 = "p99"


class DashboardTemplate(Base):
    __tablename__ = "dashboard_templates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    scope = Column(SAEnum(DashboardScope), nullable=False, default=DashboardScope.PROJECT)
    category = Column(String, nullable=True)
    tags = Column(String, nullable=True)
    visibility = Column(SAEnum(DashboardVisibility), nullable=False, default=DashboardVisibility.PRIVATE)
    is_default = Column(Boolean, default=False, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    thumbnail_config = Column(JSON, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    widgets = relationship("DashboardWidget", back_populates="template", cascade="all, delete-orphan", order_by="DashboardWidget.sort_order")


class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    dashboard_template_id = Column(String, ForeignKey("dashboard_templates.id"), nullable=False, index=True)
    widget_type = Column(SAEnum(WidgetType), nullable=False)
    title = Column(String, nullable=False)
    subtitle = Column(String, nullable=True)

    layout_x = Column(Integer, default=0, nullable=False)
    layout_y = Column(Integer, default=0, nullable=False)
    width = Column(Integer, default=3, nullable=False)
    height = Column(Integer, default=2, nullable=False)

    chart_config = Column(JSON, nullable=True)
    threshold_config = Column(JSON, nullable=True)
    display_config = Column(JSON, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    template = relationship("DashboardTemplate", back_populates="widgets")
    metric_bindings = relationship("WidgetMetricBinding", back_populates="widget", cascade="all, delete-orphan", order_by="WidgetMetricBinding.sort_order")


class WidgetMetricBinding(Base):
    __tablename__ = "widget_metric_bindings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    widget_id = Column(String, ForeignKey("dashboard_widgets.id"), nullable=False, index=True)
    metric_source_scope = Column(SAEnum(MetricSourceScope), nullable=False, default=MetricSourceScope.CONNECTOR_METRIC)
    metric_key = Column(String, nullable=False)
    connector_type = Column(String, nullable=True)
    aggregation_mode = Column(SAEnum(AggregationMode), nullable=False, default=AggregationMode.LATEST)
    display_label = Column(String, nullable=True)
    color_override = Column(String, nullable=True)
    sort_order = Column(Integer, default=0, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    widget = relationship("DashboardWidget", back_populates="metric_bindings")
