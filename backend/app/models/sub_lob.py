from sqlalchemy import Column, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.db.base import Base
from app.models.team import Team

class SubLob(Base):
    __tablename__ = "sub_lobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    color = Column(String, default="#BF5AF2")
    icon = Column(String, default="layers")
    lob_id = Column(String, ForeignKey("lobs.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    tenant_id = Column(String, nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    lob = relationship("Lob", backref="sub_lobs")
    members = relationship("SubLobMember", back_populates="sub_lob", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="sub_lob")


class SubLobMember(Base):
    __tablename__ = "sub_lob_members"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sub_lob_id = Column(String, ForeignKey("sub_lobs.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    role = Column(String, default="member")
    joined_at = Column(DateTime, default=datetime.utcnow)

    sub_lob = relationship("SubLob", back_populates="members")
    user = relationship("User", backref="sub_lob_memberships")



