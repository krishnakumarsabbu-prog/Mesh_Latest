from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.project import ProjectStatus, ProjectMemberRole


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    environment: Optional[str] = "production"
    tags: Optional[str] = None
    color: Optional[str] = "#30D158"


class ProjectCreate(ProjectBase):
    slug: str
    lob_id: str
    team_id: str
    component_id: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatus] = None
    environment: Optional[str] = None
    tags: Optional[str] = None
    color: Optional[str] = None
    component_id: Optional[str] = None


class ProjectResponse(ProjectBase):
    id: str
    slug: str
    lob_id: str
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    component_id: Optional[str] = None
    component_name: Optional[str] = None
    status: ProjectStatus
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    connector_count: Optional[int] = 0
    healthy_count: Optional[int] = 0
    degraded_count: Optional[int] = 0
    down_count: Optional[int] = 0
    member_count: Optional[int] = 0

    class Config:
        from_attributes = True


class ProjectMemberCreate(BaseModel):
    user_id: str
    role: ProjectMemberRole = ProjectMemberRole.PROJECT_USER


class ProjectMemberUpdate(BaseModel):
    role: ProjectMemberRole


class ProjectMemberResponse(BaseModel):
    id: str
    project_id: str
    user_id: str
    role: ProjectMemberRole
    assigned_by: Optional[str]
    joined_at: datetime
    user_email: Optional[str] = None
    user_full_name: Optional[str] = None
    user_avatar_url: Optional[str] = None

    class Config:
        from_attributes = True
