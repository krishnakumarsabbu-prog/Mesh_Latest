"""
Pydantic schemas for health run API endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class HealthRunConnectorResultSchema(BaseModel):
    id: str
    project_connector_id: str
    connector_name: str
    connector_slug: Optional[str]
    connector_category: Optional[str]
    outcome: str
    health_status: str
    health_score: Optional[float]
    response_time_ms: Optional[int]
    error_message: Optional[str]
    message: Optional[str]
    weight: float
    is_enabled: bool
    priority: int
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]

    model_config = {"from_attributes": True}


class HealthRunSummary(BaseModel):
    run_id: str
    execution_id: str
    project_id: str
    status: str
    overall_health_status: Optional[str]
    overall_score: Optional[float]
    connector_count: int
    success_count: int
    failure_count: int
    skipped_count: int
    total_duration_ms: Optional[int]
    triggered_by: str
    started_at: datetime
    completed_at: Optional[datetime]

    model_config = {"from_attributes": True}


class HealthRunDetail(HealthRunSummary):
    contributing_factors: List[str]
    connector_results: List[HealthRunConnectorResultSchema]

    model_config = {"from_attributes": True}


class RunHealthRequest(BaseModel):
    pass


class HealthRunListResponse(BaseModel):
    runs: List[HealthRunSummary]
    total: int
