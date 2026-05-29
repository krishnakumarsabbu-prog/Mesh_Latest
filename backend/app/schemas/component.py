from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ComponentBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#AF52DE"
    icon: Optional[str] = "box"


class ComponentCreate(ComponentBase):
    slug: str
    team_id: str
    lob_id: str


class ComponentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class ComponentResponse(ComponentBase):
    id: str
    slug: str
    team_id: str
    lob_id: str
    is_active: bool
    tenant_id: str
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    project_count: Optional[int] = 0

    class Config:
        from_attributes = True
