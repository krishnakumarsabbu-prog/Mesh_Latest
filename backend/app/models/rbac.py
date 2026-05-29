from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.db.base import Base


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, unique=True, nullable=False, index=True)
    entity = Column(String, nullable=False)
    action = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")

    __table_args__ = (UniqueConstraint("entity", "action", name="uq_permission_entity_action"),)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    role = Column(String, nullable=False, index=True)
    permission_id = Column(String, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    permission = relationship("Permission", back_populates="role_permissions")

    __table_args__ = (UniqueConstraint("role", "permission_id", name="uq_role_permission"),)


class ScopedRoleAssignment(Base):
    __tablename__ = "scoped_role_assignments"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)
    scope_type = Column(String, nullable=False)
    scope_id = Column(String, nullable=False)
    granted_by = Column(String, ForeignKey("users.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("user_id", "role", "scope_type", "scope_id", name="uq_scoped_assignment"),)
