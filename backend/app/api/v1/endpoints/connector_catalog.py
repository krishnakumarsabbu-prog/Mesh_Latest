from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.base import get_db
from app.schemas.connector_catalog import (
    ConnectorCatalogCreate,
    ConnectorCatalogUpdate,
    ConnectorCatalogResponse,
    ConnectorCatalogTestRequest,
    ConnectorCatalogTestResult,
)
from app.services.connector_catalog_service import connector_catalog_service
from app.api.deps import get_current_user, require_lob_admin
from app.models.user import User, UserRole

router = APIRouter(prefix="/connector-catalog", tags=["connector-catalog"])

CATALOG_MANAGE_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}


def _require_catalog_manage(current_user: User) -> None:
    if current_user.role not in CATALOG_MANAGE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admin or LOB Admin can manage the connector catalog",
        )


@router.get("", response_model=List[dict])
async def list_catalog(
    category: Optional[str] = Query(None),
    enabled_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entries = await connector_catalog_service.get_all(db, category=category, enabled_only=enabled_only)
    return [_serialize(e) for e in entries]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_catalog_entry(
    data: ConnectorCatalogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_catalog_manage(current_user)
    try:
        entry = await connector_catalog_service.create(db, data, current_user.id)
        return _serialize(entry)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{entry_id}", response_model=dict)
async def get_catalog_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await connector_catalog_service.get_by_id(db, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    return _serialize(entry)


@router.patch("/{entry_id}", response_model=dict)
async def update_catalog_entry(
    entry_id: str,
    data: ConnectorCatalogUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_catalog_manage(current_user)
    entry = await connector_catalog_service.update(db, entry_id, data)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    return _serialize(entry)


@router.post("/{entry_id}/enable", response_model=dict)
async def enable_catalog_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_catalog_manage(current_user)
    entry = await connector_catalog_service.toggle_enabled(db, entry_id, True)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    return _serialize(entry)


@router.post("/{entry_id}/disable", response_model=dict)
async def disable_catalog_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_catalog_manage(current_user)
    entry = await connector_catalog_service.toggle_enabled(db, entry_id, False)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    return _serialize(entry)


@router.post("/{entry_id}/test", response_model=dict)
async def test_catalog_entry(
    entry_id: str,
    test_req: ConnectorCatalogTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await connector_catalog_service.test_connector(db, entry_id, test_req)
    return result.model_dump()


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_catalog_entry(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_catalog_manage(current_user)
    if not await connector_catalog_service.delete(db, entry_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete: entry not found or is a system connector",
        )


def _serialize(entry) -> dict:
    return {
        "id": entry.id,
        "slug": entry.slug,
        "name": entry.name,
        "description": entry.description,
        "vendor": entry.vendor,
        "category": entry.category,
        "status": entry.status,
        "icon": entry.icon,
        "color": entry.color,
        "tags": entry.tags,
        "is_system": entry.is_system,
        "is_enabled": entry.is_enabled,
        "config_schema": entry.config_schema,
        "default_config": entry.default_config,
        "test_definition": entry.test_definition,
        "docs_url": entry.docs_url,
        "version": entry.version,
        "created_by": entry.created_by,
        "created_at": entry.created_at.isoformat() if entry.created_at else None,
        "updated_at": entry.updated_at.isoformat() if entry.updated_at else None,
    }
