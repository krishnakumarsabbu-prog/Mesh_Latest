from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime


class WidgetMetricBindingCreate(BaseModel):
    metric_source_scope: str = "connector_metric"
    metric_key: str
    connector_type: Optional[str] = None
    aggregation_mode: str = "latest"
    display_label: Optional[str] = None
    color_override: Optional[str] = None
    sort_order: int = 0


class WidgetMetricBindingResponse(BaseModel):
    id: str
    widget_id: str
    metric_source_scope: str
    metric_key: str
    connector_type: Optional[str]
    aggregation_mode: str
    display_label: Optional[str]
    color_override: Optional[str]
    sort_order: int

    class Config:
        from_attributes = True


class DashboardWidgetCreate(BaseModel):
    widget_type: str
    title: str
    subtitle: Optional[str] = None
    layout_x: int = 0
    layout_y: int = 0
    width: int = 3
    height: int = 2
    chart_config: Optional[Dict[str, Any]] = None
    threshold_config: Optional[Dict[str, Any]] = None
    display_config: Optional[Dict[str, Any]] = None
    sort_order: int = 0
    metric_bindings: List[WidgetMetricBindingCreate] = []


class DashboardWidgetUpdate(BaseModel):
    widget_type: Optional[str] = None
    title: Optional[str] = None
    subtitle: Optional[str] = None
    layout_x: Optional[int] = None
    layout_y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    chart_config: Optional[Dict[str, Any]] = None
    threshold_config: Optional[Dict[str, Any]] = None
    display_config: Optional[Dict[str, Any]] = None
    sort_order: Optional[int] = None
    metric_bindings: Optional[List[WidgetMetricBindingCreate]] = None


class DashboardWidgetResponse(BaseModel):
    id: str
    dashboard_template_id: str
    widget_type: str
    title: str
    subtitle: Optional[str]
    layout_x: int
    layout_y: int
    width: int
    height: int
    chart_config: Optional[Dict[str, Any]]
    threshold_config: Optional[Dict[str, Any]]
    display_config: Optional[Dict[str, Any]]
    sort_order: int
    created_at: datetime
    updated_at: datetime
    metric_bindings: List[WidgetMetricBindingResponse] = []

    class Config:
        from_attributes = True


class DashboardTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    scope: str = "project"
    category: Optional[str] = None
    tags: Optional[str] = None
    visibility: str = "private"
    widgets: List[DashboardWidgetCreate] = []


class DashboardTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    scope: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[str] = None
    visibility: Optional[str] = None


class DashboardTemplateSaveLayout(BaseModel):
    widgets: List[DashboardWidgetCreate]


class DashboardTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    scope: str
    category: Optional[str]
    tags: Optional[str]
    visibility: str
    is_default: bool
    version: int
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    widgets: List[DashboardWidgetResponse] = []

    class Config:
        from_attributes = True
