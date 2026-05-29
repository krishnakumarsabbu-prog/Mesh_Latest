from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.health_check import HealthStatus


class HealthCheckResponse(BaseModel):
    id: str
    connector_id: str
    project_id: str
    status: HealthStatus
    response_time_ms: Optional[float]
    status_code: Optional[int]
    error_message: Optional[str]
    checked_at: datetime

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_lobs: int
    total_projects: int
    total_connectors: int
    healthy_connectors: int
    degraded_connectors: int
    down_connectors: int
    unknown_connectors: int
    overall_health_percentage: float
    avg_response_time_ms: Optional[float]


class HealthTrend(BaseModel):
    timestamp: datetime
    healthy: int
    degraded: int
    down: int
    total: int


class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: Optional[datetime] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    message: str
    suggestions: Optional[List[str]] = None
    data: Optional[dict] = None
