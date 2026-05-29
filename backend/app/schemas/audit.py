from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str]
    action: str
    resource_type: str
    resource_id: Optional[str]
    changes: Optional[str]
    ip_address: Optional[str]
    tenant_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
