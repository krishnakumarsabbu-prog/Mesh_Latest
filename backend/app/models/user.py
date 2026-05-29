from sqlalchemy import Column, String, Boolean, DateTime, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    LOB_ADMIN = "lob_admin"
    PROJECT_ADMIN = "project_admin"
    PROJECT_USER = "project_user"
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"


ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}
SUPER_ROLES = {UserRole.SUPER_ADMIN}


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.PROJECT_USER, nullable=False)
    is_active = Column(Boolean, default=True)
    avatar_url = Column(String, nullable=True)
    tenant_id = Column(String, nullable=True, default="default")
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lob_memberships = relationship("LobMember", back_populates="user", lazy="selectin")
    role_assignments = relationship(
        "UserRoleAssignment",
        foreign_keys="UserRoleAssignment.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class UserRoleAssignment(Base):
    __tablename__ = "user_role_assignments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(SAEnum(UserRole), nullable=False)
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    granted_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], back_populates="role_assignments")
