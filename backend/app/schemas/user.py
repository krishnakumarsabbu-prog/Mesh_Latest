from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models.user import UserRole


class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.PROJECT_USER


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.PROJECT_USER


class UserAdminCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str
    role: UserRole = UserRole.PROJECT_USER
    tenant_id: Optional[str] = "default"


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None
    password: Optional[str] = None


class RoleAssignmentCreate(BaseModel):
    role: UserRole
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None


class RoleAssignmentResponse(BaseModel):
    id: str
    user_id: str
    role: UserRole
    resource_type: Optional[str]
    resource_id: Optional[str]
    granted_by: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    is_active: bool
    avatar_url: Optional[str]
    tenant_id: Optional[str]
    last_login: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_safe(cls, obj) -> "UserResponse":
        return cls(
            id=obj.id,
            email=obj.email,
            full_name=obj.full_name,
            role=obj.role,
            is_active=obj.is_active,
            avatar_url=obj.avatar_url,
            tenant_id=obj.tenant_id,
            last_login=obj.last_login,
            created_at=obj.created_at,
        )


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
