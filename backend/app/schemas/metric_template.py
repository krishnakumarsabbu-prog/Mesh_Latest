from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime
from app.models.metric_template import MetricType, AggregationType, ParserType


class MetricTemplateBase(BaseModel):
    name: str
    metric_key: str
    description: Optional[str] = None
    category: Optional[str] = None
    display_order: int = 0

    metric_type: MetricType = MetricType.NUMBER
    unit: Optional[str] = None
    aggregation_type: AggregationType = AggregationType.LATEST

    threshold_warning: Optional[float] = None
    threshold_critical: Optional[float] = None

    query_config: Optional[Dict[str, Any]] = None
    parser_type: ParserType = ParserType.JSON_PATH
    result_mapping: Optional[Dict[str, Any]] = None
    transformation_rules: Optional[List[Dict[str, Any]]] = None

    is_enabled_by_default: bool = True
    is_required: bool = False
    is_custom: bool = False


class MetricTemplateCreate(MetricTemplateBase):
    pass


class MetricTemplateUpdate(BaseModel):
    name: Optional[str] = None
    metric_key: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    display_order: Optional[int] = None

    metric_type: Optional[MetricType] = None
    unit: Optional[str] = None
    aggregation_type: Optional[AggregationType] = None

    threshold_warning: Optional[float] = None
    threshold_critical: Optional[float] = None

    query_config: Optional[Dict[str, Any]] = None
    parser_type: Optional[ParserType] = None
    result_mapping: Optional[Dict[str, Any]] = None
    transformation_rules: Optional[List[Dict[str, Any]]] = None

    is_enabled_by_default: Optional[bool] = None
    is_required: Optional[bool] = None
    is_custom: Optional[bool] = None


class MetricTemplateReorder(BaseModel):
    ordered_ids: List[str]


class MetricTemplateClone(BaseModel):
    new_name: Optional[str] = None
    new_metric_key: Optional[str] = None


class MetricTemplateTestRequest(BaseModel):
    endpoint_url: str
    auth_config: Optional[Dict[str, Any]] = None
    timeout_seconds: Optional[int] = 10


class MetricTemplateTestResult(BaseModel):
    success: bool
    raw_response: Optional[Any] = None
    parsed_value: Optional[Any] = None
    error: Optional[str] = None
    response_time_ms: Optional[float] = None
    status_code: Optional[int] = None
    validation_errors: Optional[List[str]] = None


class MetricTemplateResponse(MetricTemplateBase):
    id: str
    catalog_entry_id: str
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
