from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.connector import ConnectorType, ConnectorStatus


class ConnectorBase(BaseModel):
    name: str
    description: Optional[str] = None
    type: ConnectorType = ConnectorType.REST_API
    endpoint_url: Optional[str] = None
    config: Optional[str] = None
    check_interval_seconds: Optional[str] = "60"
    timeout_seconds: Optional[str] = "30"


class ConnectorCreate(ConnectorBase):
    project_id: str


class ConnectorUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    endpoint_url: Optional[str] = None
    config: Optional[str] = None
    is_active: Optional[bool] = None
    check_interval_seconds: Optional[str] = None
    timeout_seconds: Optional[str] = None


class ConnectorResponse(ConnectorBase):
    id: str
    project_id: str
    status: ConnectorStatus
    is_active: bool
    last_checked: Optional[datetime]
    last_status_change: Optional[datetime]
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    uptime_percentage: Optional[float] = None
    avg_response_time_ms: Optional[float] = None

    class Config:
        from_attributes = True
