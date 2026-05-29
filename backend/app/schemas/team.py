from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#0A84FF"
    icon: Optional[str] = "users"


class TeamCreate(TeamBase):
    slug: str
    lob_id: str


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class TeamResponse(TeamBase):
    id: str
    slug: str
    lob_id: str
    is_active: bool
    tenant_id: str
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    member_count: Optional[int] = 0
    project_count: Optional[int] = 0

    class Config:
        from_attributes = True


class TeamMemberCreate(BaseModel):
    user_id: str
    role: str = "member"


class TeamMemberResponse(BaseModel):
    id: str
    team_id: str
    user_id: str
    role: str
    joined_at: datetime
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class TeamProjectAssign(BaseModel):
    project_id: str


class TeamProjectResponse(BaseModel):
    id: str
    team_id: str
    project_id: str
    assigned_at: datetime
    project_name: Optional[str] = None
    project_color: Optional[str] = None
    project_status: Optional[str] = None
    project_environment: Optional[str] = None
    connector_count: Optional[int] = 0
    healthy_count: Optional[int] = 0

    class Config:
        from_attributes = True
