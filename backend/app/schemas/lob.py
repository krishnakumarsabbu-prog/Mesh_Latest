from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class LobBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: Optional[str] = "#0A84FF"
    icon: Optional[str] = "building"


class LobCreate(LobBase):
    slug: str
    tenant_id: str


class LobUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None


class LobResponse(LobBase):
    id: str
    slug: str
    is_active: bool
    tenant_id: str
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    project_count: Optional[int] = 0
    member_count: Optional[int] = 0

    class Config:
        from_attributes = True


class LobAdminAssign(BaseModel):
    user_id: str


class LobMemberResponse(BaseModel):
    id: str
    lob_id: str
    user_id: str
    role: str
    joined_at: datetime
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
