from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime


class WidgetOverrideCreate(BaseModel):
    widget_id: str
    is_hidden: bool = False
    title_override: Optional[str] = None
    sort_order_override: Optional[int] = None
    threshold_config_override: Optional[Dict[str, Any]] = None
    display_config_override: Optional[Dict[str, Any]] = None


class WidgetOverrideResponse(WidgetOverrideCreate):
    id: str
    assignment_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssignmentCreate(BaseModel):
    template_id: str
    display_name: Optional[str] = None
    is_default: bool = False
    refresh_interval_seconds: int = 60


class AssignmentUpdate(BaseModel):
    display_name: Optional[str] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None
    refresh_interval_seconds: Optional[int] = None


class AssignmentReorder(BaseModel):
    ordered_assignment_ids: List[str]


class AssignmentResponse(BaseModel):
    id: str
    project_id: str
    template_id: str
    display_name: Optional[str] = None
    sort_order: int
    is_default: bool
    refresh_interval_seconds: int
    assigned_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    template_name: Optional[str] = None
    template_description: Optional[str] = None
    template_scope: Optional[str] = None
    template_visibility: Optional[str] = None
    template_category: Optional[str] = None
    widget_count: int = 0
    overrides: List[WidgetOverrideResponse] = []

    class Config:
        from_attributes = True


class ValidationWarning(BaseModel):
    widget_id: str
    widget_title: str
    metric_key: str
    connector_type: Optional[str]
    message: str


class ValidationError(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class AssignmentValidationResult(BaseModel):
    valid: bool
    errors: List[ValidationError] = []
    warnings: List[ValidationWarning] = []
    missing_connector_types: List[str] = []
    missing_metric_keys: List[str] = []
    satisfied_bindings: int = 0
    total_bindings: int = 0


class LiveWidgetData(BaseModel):
    widget_id: str
    widget_type: str
    title: str
    subtitle: Optional[str] = None
    is_hidden: bool = False
    layout_x: int
    layout_y: int
    width: int
    height: int
    sort_order: int
    chart_config: Optional[Dict[str, Any]] = None
    threshold_config: Optional[Dict[str, Any]] = None
    display_config: Optional[Dict[str, Any]] = None
    resolved_metrics: List[Dict[str, Any]] = []
    has_data: bool = False
    error: Optional[str] = None


class LiveDashboardResponse(BaseModel):
    assignment_id: str
    project_id: str
    template_id: str
    dashboard_name: str
    template_name: str
    refresh_interval_seconds: int
    rendered_at: str
    widgets: List[LiveWidgetData] = []
    project_summary: Optional[Dict[str, Any]] = None
