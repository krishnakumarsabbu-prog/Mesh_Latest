import json
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_current_user, require_project_admin
from app.models.user import User
from app.models.project_connector import ProjectConnector
from app.schemas.project_connector import (
    ProjectConnectorAssign,
    ProjectConnectorConfig,
    ProjectConnectorToggle,
    ProjectConnectorTestRequest,
    ProjectConnectorResponse,
    ProjectConnectorTestResult,
    CatalogEntrySnippet,
)
from app.services.project_connector_service import project_connector_service

router = APIRouter(prefix="/projects/{project_id}/connectors", tags=["project-connectors"])


def _serialize(pc: ProjectConnector) -> dict:
    catalog = pc.catalog_entry
    catalog_snippet = None
    if catalog:
        catalog_snippet = {
            "id": catalog.id,
            "slug": catalog.slug,
            "name": catalog.name,
            "vendor": catalog.vendor,
            "category": catalog.category.value if hasattr(catalog.category, "value") else catalog.category,
            "icon": catalog.icon,
            "color": catalog.color,
            "config_schema": catalog.config_schema,
            "default_config": catalog.default_config,
            "test_definition": catalog.test_definition,
            "docs_url": catalog.docs_url,
            "version": catalog.version,
        }

    config_parsed: Optional[Dict[str, Any]] = None
    if pc.config:
        try:
            config_parsed = json.loads(pc.config)
        except Exception:
            config_parsed = None

    return {
        "id": pc.id,
        "project_id": pc.project_id,
        "catalog_entry_id": pc.catalog_entry_id,
        "name": pc.name,
        "description": pc.description,
        "config": config_parsed,
        "is_enabled": pc.is_enabled,
        "priority": pc.priority,
        "status": pc.status.value if hasattr(pc.status, "value") else pc.status,
        "last_test_at": pc.last_test_at.isoformat() if pc.last_test_at else None,
        "last_test_success": pc.last_test_success,
        "last_test_error": pc.last_test_error,
        "last_test_response_ms": pc.last_test_response_ms,
        "assigned_by": pc.assigned_by,
        "created_at": pc.created_at.isoformat() if pc.created_at else None,
        "updated_at": pc.updated_at.isoformat() if pc.updated_at else None,
        "catalog_entry": catalog_snippet,
    }


@router.get("", response_model=List[dict])
async def list_project_connectors(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pcs = await project_connector_service.list_for_project(db, project_id)
    return [_serialize(pc) for pc in pcs]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def assign_connector(
    project_id: str,
    data: ProjectConnectorAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    try:
        pc = await project_connector_service.assign(db, project_id, data, current_user.id)
        return _serialize(pc)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))


@router.get("/{pc_id}", response_model=dict)
async def get_project_connector(
    project_id: str,
    pc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pc = await project_connector_service.get_by_id(db, pc_id)
    if not pc or pc.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project connector not found")
    return _serialize(pc)


@router.patch("/{pc_id}/configure", response_model=dict)
async def configure_connector(
    project_id: str,
    pc_id: str,
    data: ProjectConnectorConfig,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    pc = await project_connector_service.get_by_id(db, pc_id)
    if not pc or pc.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project connector not found")
    updated = await project_connector_service.configure(db, pc_id, data)
    return _serialize(updated)


@router.patch("/{pc_id}/toggle", response_model=dict)
async def toggle_connector(
    project_id: str,
    pc_id: str,
    data: ProjectConnectorToggle,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    pc = await project_connector_service.get_by_id(db, pc_id)
    if not pc or pc.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project connector not found")
    updated = await project_connector_service.toggle_enabled(db, pc_id, data.is_enabled)
    return _serialize(updated)


@router.post("/{pc_id}/test", response_model=dict)
async def test_connector(
    project_id: str,
    pc_id: str,
    data: ProjectConnectorTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    pc = await project_connector_service.get_by_id(db, pc_id)
    if not pc or pc.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project connector not found")
    result = await project_connector_service.test_connection(
        db, pc_id, override_config=data.config, override_credentials=data.credentials
    )
    return {
        "success": result.success,
        "response_time_ms": result.response_time_ms,
        "error": result.error,
        "details": result.details,
    }


@router.delete("/{pc_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_connector(
    project_id: str,
    pc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    pc = await project_connector_service.get_by_id(db, pc_id)
    if not pc or pc.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project connector not found")
    await project_connector_service.remove(db, pc_id)
