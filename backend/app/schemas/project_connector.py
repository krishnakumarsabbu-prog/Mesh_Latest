from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime


class ProjectConnectorAssign(BaseModel):
    catalog_entry_id: str
    name: str
    description: Optional[str] = None
    priority: int = 0


class ProjectConnectorConfig(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    credentials: Optional[Dict[str, Any]] = None
    priority: Optional[int] = None


class ProjectConnectorToggle(BaseModel):
    is_enabled: bool


class ProjectConnectorTestRequest(BaseModel):
    config: Optional[Dict[str, Any]] = None
    credentials: Optional[Dict[str, Any]] = None


class CatalogEntrySnippet(BaseModel):
    id: str
    slug: str
    name: str
    vendor: Optional[str]
    category: str
    icon: Optional[str]
    color: Optional[str]
    config_schema: Optional[Dict[str, Any]]
    default_config: Optional[Dict[str, Any]]
    test_definition: Optional[Dict[str, Any]]
    docs_url: Optional[str]
    version: Optional[str]

    class Config:
        from_attributes = True


class ProjectConnectorResponse(BaseModel):
    id: str
    project_id: str
    catalog_entry_id: str
    name: str
    description: Optional[str]
    config: Optional[Dict[str, Any]]
    is_enabled: bool
    priority: int
    status: str
    last_test_at: Optional[datetime]
    last_test_success: Optional[bool]
    last_test_error: Optional[str]
    last_test_response_ms: Optional[int]
    assigned_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    catalog_entry: Optional[CatalogEntrySnippet]

    class Config:
        from_attributes = True


class ProjectConnectorTestResult(BaseModel):
    success: bool
    response_time_ms: Optional[int]
    error: Optional[str]
    details: Optional[Dict[str, Any]]
