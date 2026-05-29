from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from app.db.base import Base


class ProjectStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    MAINTENANCE = "maintenance"
    ARCHIVED = "archived"


class ProjectMemberRole(str, enum.Enum):
    PROJECT_ADMIN = "project_admin"
    PROJECT_USER = "project_user"


class Project(Base):
    __tablename__ = "projects"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    lob_id = Column(String, ForeignKey("lobs.id"), nullable=False)
    team_id = Column(String, ForeignKey("teams.id"), nullable=True, index=True)
    component_id = Column(String, ForeignKey("components.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(SAEnum(ProjectStatus), default=ProjectStatus.ACTIVE)
    environment = Column(String, default="production")
    tags = Column(Text, nullable=True)
    color = Column(String, default="#30D158")
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    lob = relationship("Lob", back_populates="projects")
    team = relationship("Team", back_populates="owned_projects", foreign_keys=[team_id])
    component = relationship("Component", back_populates="projects")
    connectors = relationship("Connector", back_populates="project")
    health_checks = relationship("HealthCheck", back_populates="project")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    team_assignments = relationship("TeamProject", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(SAEnum(ProjectMemberRole), default=ProjectMemberRole.PROJECT_USER, nullable=False)
    assigned_by = Column(String, ForeignKey("users.id"), nullable=True)
    joined_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])
    assigner = relationship("User", foreign_keys=[assigned_by])
