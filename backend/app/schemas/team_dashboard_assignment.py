from __future__ import annotations
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from datetime import datetime


class TeamWidgetOverrideCreate(BaseModel):
    widget_id: str
    is_hidden: bool = False
    title_override: Optional[str] = None
    sort_order_override: Optional[int] = None
    threshold_config_override: Optional[Dict[str, Any]] = None
    display_config_override: Optional[Dict[str, Any]] = None


class TeamWidgetOverrideResponse(TeamWidgetOverrideCreate):
    id: str
    assignment_id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TeamAssignmentCreate(BaseModel):
    template_id: str
    display_name: Optional[str] = None
    is_default: bool = False
    refresh_interval_seconds: int = 60


class TeamAssignmentUpdate(BaseModel):
    display_name: Optional[str] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None
    refresh_interval_seconds: Optional[int] = None


class TeamAssignmentReorder(BaseModel):
    ordered_assignment_ids: List[str]


class TeamAssignmentResponse(BaseModel):
    id: str
    team_id: str
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
    overrides: List[TeamWidgetOverrideResponse] = []

    class Config:
        from_attributes = True


class TeamAssignmentValidationWarning(BaseModel):
    widget_id: str
    widget_title: str
    metric_key: str
    message: str


class TeamAssignmentValidationError(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None


class TeamAssignmentValidationResult(BaseModel):
    valid: bool
    errors: List[TeamAssignmentValidationError] = []
    warnings: List[TeamAssignmentValidationWarning] = []
    missing_metric_keys: List[str] = []
    satisfied_bindings: int = 0
    total_bindings: int = 0
    available_metric_keys: List[str] = []


class TeamLiveWidgetData(BaseModel):
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


class TeamSummary(BaseModel):
    team_id: str
    team_name: str
    team_color: Optional[str] = None
    project_count: float = 0
    healthy_projects: float = 0
    warning_projects: float = 0
    critical_projects: float = 0
    avg_project_health: float = 0
    total_alerts: float = 0
    avg_availability: float = 0
    sla_breach_count: float = 0
    metrics_computed_at: Optional[str] = None


class TeamLiveDashboardResponse(BaseModel):
    assignment_id: str
    team_id: str
    template_id: str
    dashboard_name: str
    template_name: str
    refresh_interval_seconds: int
    rendered_at: str
    widgets: List[TeamLiveWidgetData] = []
    team_summary: Optional[TeamSummary] = None
