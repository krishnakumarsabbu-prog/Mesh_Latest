from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.db.base import Base


class Lob(Base):
    __tablename__ = "lobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String, default="#0A84FF")
    icon = Column(String, default="building")
    is_active = Column(Boolean, default=True)
    tenant_id = Column(String, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    projects = relationship("Project", back_populates="lob")
    members = relationship("LobMember", back_populates="lob")
    teams = relationship("Team", back_populates="lob")
    components = relationship("Component", back_populates="lob", cascade="all, delete-orphan")


class LobMember(Base):
    __tablename__ = "lob_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    lob_id = Column(String, ForeignKey("lobs.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(String, default="member")
    joined_at = Column(DateTime, default=datetime.utcnow)

    lob = relationship("Lob", back_populates="members")
    user = relationship("User", back_populates="lob_memberships")
