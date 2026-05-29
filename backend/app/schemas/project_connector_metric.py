from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime


class ProjectConnectorMetricUpsert(BaseModel):
    metric_template_id: str
    is_enabled: bool = True
    is_critical: bool = False
    threshold_warning: Optional[float] = None
    threshold_critical: Optional[float] = None
    label_override: Optional[str] = None
    query_config_override: Optional[Dict[str, Any]] = None


class ProjectConnectorMetricBulkSave(BaseModel):
    bindings: List[ProjectConnectorMetricUpsert]


class MetricTemplateSnippet(BaseModel):
    id: str
    name: str
    metric_key: str
    description: Optional[str]
    category: Optional[str]
    display_order: int
    metric_type: str
    unit: Optional[str]
    aggregation_type: str
    threshold_warning: Optional[float]
    threshold_critical: Optional[float]
    is_enabled_by_default: bool
    is_required: bool
    is_custom: bool

    class Config:
        from_attributes = True


class ProjectConnectorMetricResponse(BaseModel):
    id: str
    project_connector_id: str
    metric_template_id: str
    is_enabled: bool
    is_critical: bool
    threshold_warning: Optional[float]
    threshold_critical: Optional[float]
    label_override: Optional[str]
    query_config_override: Optional[Dict[str, Any]]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    metric_template: Optional[MetricTemplateSnippet]

    class Config:
        from_attributes = True
