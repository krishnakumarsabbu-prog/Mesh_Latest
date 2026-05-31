from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class SubLobBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#BF5AF2"
    icon: Optional[str] = "layers"
    lob_id: str


class SubLobCreate(SubLobBase):
    slug: str
    tenant_id: str


class SubLobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    lob_id: Optional[str] = None


class SubLobResponse(SubLobBase):
    id: str
    slug: str
    is_active: bool
    tenant_id: str
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    team_count: Optional[int] = 0
    project_count: Optional[int] = 0
    member_count: Optional[int] = 0

    class Config:
        from_attributes = True


class SubLobAdminAssign(BaseModel):
    user_id: str


class SubLobMemberResponse(BaseModel):
    id: str
    sub_lob_id: str
    user_id: str
    role: str
    joined_at: datetime
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
