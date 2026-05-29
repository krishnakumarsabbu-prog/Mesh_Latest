from pydantic import BaseModel
from typing import Optional, Any, Dict, List
from datetime import datetime
from app.models.connector_catalog import CatalogConnectorCategory, CatalogConnectorStatus


class ConnectorCatalogBase(BaseModel):
    name: str
    description: Optional[str] = None
    vendor: Optional[str] = None
    category: CatalogConnectorCategory = CatalogConnectorCategory.CUSTOM
    icon: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[str] = None
    config_schema: Optional[Dict[str, Any]] = None
    default_config: Optional[Dict[str, Any]] = None
    test_definition: Optional[Dict[str, Any]] = None
    docs_url: Optional[str] = None
    version: Optional[str] = None


class ConnectorCatalogCreate(ConnectorCatalogBase):
    slug: Optional[str] = None


class ConnectorCatalogUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    category: Optional[CatalogConnectorCategory] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    tags: Optional[str] = None
    is_enabled: Optional[bool] = None
    config_schema: Optional[Dict[str, Any]] = None
    default_config: Optional[Dict[str, Any]] = None
    test_definition: Optional[Dict[str, Any]] = None
    docs_url: Optional[str] = None
    version: Optional[str] = None


class ConnectorCatalogResponse(ConnectorCatalogBase):
    id: str
    slug: str
    status: CatalogConnectorStatus
    is_system: bool
    is_enabled: bool
    created_by: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConnectorCatalogTestRequest(BaseModel):
    endpoint_url: str
    config: Optional[Dict[str, Any]] = None
    credentials: Optional[Dict[str, Any]] = None
    auth_type: Optional[str] = None
    timeout_seconds: Optional[int] = 10


class ConnectorCatalogTestResult(BaseModel):
    success: bool
    status_code: Optional[int] = None
    response_time_ms: Optional[float] = None
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
