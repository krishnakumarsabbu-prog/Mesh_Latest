from sqlalchemy import Column, String, Integer, Boolean, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
from app.db.base import Base


class OntologyNode(Base):
    __tablename__ = "ontology_nodes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    node_key = Column(String, unique=True, nullable=False, index=True)
    label = Column(String, nullable=False)
    domain = Column(String, nullable=False, index=True)  # organization, business, applications, runtime, ...
    ontology_class = Column(String, nullable=False)  # e.g. Application, Service, Capability, RuntimeAsset
    sub_class_of = Column(String, nullable=True)  # parent class name for inheritance hierarchy
    icon = Column(String, nullable=True)  # lucide icon name
    color = Column(String, nullable=True)
    status = Column(String, default="healthy")  # healthy | degraded | down | unknown
    is_root = Column(Boolean, default=False)
    parent_id = Column(String, ForeignKey("ontology_nodes.id", ondelete="CASCADE"), nullable=True, index=True)
    properties_json = Column(JSON, nullable=True)  # data/object property descriptors
    metadata_json = Column(JSON, nullable=True)
    tenant_id = Column(String, default="default", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    parent = relationship("OntologyNode", remote_side="OntologyNode.id", back_populates="children")
    children = relationship("OntologyNode", back_populates="parent", cascade="all, delete-orphan")

    outgoing_edges = relationship("OntologyEdge", foreign_keys="OntologyEdge.source_node_id", back_populates="source_node", cascade="all, delete-orphan")
    incoming_edges = relationship("OntologyEdge", foreign_keys="OntologyEdge.target_node_id", back_populates="target_node", cascade="all, delete-orphan")


class OntologyEdge(Base):
    __tablename__ = "ontology_edges"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    source_node_id = Column(String, ForeignKey("ontology_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    target_node_id = Column(String, ForeignKey("ontology_nodes.id", ondelete="CASCADE"), nullable=False, index=True)
    edge_type = Column(String, nullable=False)  # subClassOf | dependsOn | mappedTo | governedBy | executesCapability | ...
    label = Column(String, nullable=True)
    is_animated = Column(Boolean, default=False)
    weight = Column(Integer, default=1)
    properties_json = Column(JSON, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    tenant_id = Column(String, default="default", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    source_node = relationship("OntologyNode", foreign_keys=[source_node_id], back_populates="outgoing_edges")
    target_node = relationship("OntologyNode", foreign_keys=[target_node_id], back_populates="incoming_edges")
