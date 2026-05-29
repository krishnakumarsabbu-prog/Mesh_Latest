from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db.base import get_db
from app.schemas.metric_template import (
    MetricTemplateCreate,
    MetricTemplateUpdate,
    MetricTemplateReorder,
    MetricTemplateClone,
    MetricTemplateTestRequest,
    MetricTemplateTestResult,
    MetricTemplateResponse,
)
from app.services.metric_template_service import metric_template_service
from app.services.connector_catalog_service import connector_catalog_service
from app.api.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter(tags=["metric-templates"])

MANAGE_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}


def _require_manage(current_user: User) -> None:
    if current_user.role not in MANAGE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Super Admin, LOB Admin, or Admin can manage metric templates",
        )


def _serialize(t) -> dict:
    return {
        "id": t.id,
        "catalog_entry_id": t.catalog_entry_id,
        "name": t.name,
        "metric_key": t.metric_key,
        "description": t.description,
        "category": t.category,
        "display_order": t.display_order,
        "metric_type": t.metric_type,
        "unit": t.unit,
        "aggregation_type": t.aggregation_type,
        "threshold_warning": t.threshold_warning,
        "threshold_critical": t.threshold_critical,
        "query_config": t.query_config,
        "parser_type": t.parser_type,
        "result_mapping": t.result_mapping,
        "transformation_rules": t.transformation_rules,
        "is_enabled_by_default": t.is_enabled_by_default,
        "is_required": t.is_required,
        "is_custom": t.is_custom,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


@router.get("/connector-catalog/{entry_id}/metrics", response_model=List[dict])
async def list_metric_templates(
    entry_id: str,
    category: Optional[str] = Query(None),
    enabled_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    entry = await connector_catalog_service.get_by_id(db, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    templates = await metric_template_service.list_for_catalog(
        db, entry_id, category=category, enabled_only=enabled_only
    )
    return [_serialize(t) for t in templates]


@router.post("/connector-catalog/{entry_id}/metrics", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_metric_template(
    entry_id: str,
    data: MetricTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    entry = await connector_catalog_service.get_by_id(db, entry_id)
    if not entry:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Catalog entry not found")
    try:
        template = await metric_template_service.create(db, entry_id, data, current_user.id)
        return _serialize(template)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/connector-catalog/{entry_id}/metrics/{template_id}", response_model=dict)
async def get_metric_template(
    entry_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await metric_template_service.get_by_id(db, template_id)
    if not template or template.catalog_entry_id != entry_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    return _serialize(template)


@router.patch("/connector-catalog/{entry_id}/metrics/{template_id}", response_model=dict)
async def update_metric_template(
    entry_id: str,
    template_id: str,
    data: MetricTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    template = await metric_template_service.get_by_id(db, template_id)
    if not template or template.catalog_entry_id != entry_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    try:
        updated = await metric_template_service.update(db, template_id, data)
        return _serialize(updated)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/connector-catalog/{entry_id}/metrics/{template_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_metric_template(
    entry_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    template = await metric_template_service.get_by_id(db, template_id)
    if not template or template.catalog_entry_id != entry_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    if not await metric_template_service.delete(db, template_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete metric template")


@router.post("/connector-catalog/{entry_id}/metrics/{template_id}/clone", response_model=dict, status_code=status.HTTP_201_CREATED)
async def clone_metric_template(
    entry_id: str,
    template_id: str,
    data: MetricTemplateClone,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    template = await metric_template_service.get_by_id(db, template_id)
    if not template or template.catalog_entry_id != entry_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    cloned = await metric_template_service.clone(
        db, template_id, data.new_name, data.new_metric_key, current_user.id
    )
    if not cloned:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to clone metric template")
    return _serialize(cloned)


@router.post("/connector-catalog/{entry_id}/metrics/{template_id}/enable", response_model=dict)
async def enable_metric_template(
    entry_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    template = await metric_template_service.toggle_enabled(db, template_id, True)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    return _serialize(template)


@router.post("/connector-catalog/{entry_id}/metrics/{template_id}/disable", response_model=dict)
async def disable_metric_template(
    entry_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    template = await metric_template_service.toggle_enabled(db, template_id, False)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    return _serialize(template)


@router.post("/connector-catalog/{entry_id}/metrics/reorder", response_model=List[dict])
async def reorder_metric_templates(
    entry_id: str,
    data: MetricTemplateReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_manage(current_user)
    templates = await metric_template_service.reorder(db, entry_id, data.ordered_ids)
    return [_serialize(t) for t in templates]


@router.post("/connector-catalog/{entry_id}/metrics/{template_id}/test", response_model=dict)
async def test_metric_template(
    entry_id: str,
    template_id: str,
    test_req: MetricTemplateTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await metric_template_service.get_by_id(db, template_id)
    if not template or template.catalog_entry_id != entry_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric template not found")
    result = await metric_template_service.test_metric(db, template_id, test_req)
    return result.model_dump()
