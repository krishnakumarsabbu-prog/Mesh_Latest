from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.api.deps import get_current_user, require_project_admin
from app.models.user import User
from app.models.project_connector import ProjectConnector
from app.models.project_connector_metric import ProjectConnectorMetric
from app.models.metric_template import MetricTemplate
from app.schemas.project_connector_metric import (
    ProjectConnectorMetricUpsert,
    ProjectConnectorMetricBulkSave,
    ProjectConnectorMetricResponse,
)
from app.services.project_connector_metric_service import project_connector_metric_service
from app.services.project_connector_service import project_connector_service
from app.services.metric_template_service import metric_template_service

router = APIRouter(
    prefix="/projects/{project_id}/connectors/{pc_id}/metrics",
    tags=["project-connector-metrics"],
)


def _serialize_template(tmpl: Optional[MetricTemplate]) -> Optional[dict]:
    if not tmpl:
        return None
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "metric_key": tmpl.metric_key,
        "description": tmpl.description,
        "category": tmpl.category,
        "display_order": tmpl.display_order,
        "metric_type": tmpl.metric_type.value if hasattr(tmpl.metric_type, "value") else tmpl.metric_type,
        "unit": tmpl.unit,
        "aggregation_type": tmpl.aggregation_type.value if hasattr(tmpl.aggregation_type, "value") else tmpl.aggregation_type,
        "threshold_warning": tmpl.threshold_warning,
        "threshold_critical": tmpl.threshold_critical,
        "is_enabled_by_default": tmpl.is_enabled_by_default,
        "is_required": tmpl.is_required,
        "is_custom": tmpl.is_custom,
    }


def _serialize_binding(binding: ProjectConnectorMetric) -> dict:
    return {
        "id": binding.id,
        "project_connector_id": binding.project_connector_id,
        "metric_template_id": binding.metric_template_id,
        "is_enabled": binding.is_enabled,
        "is_critical": binding.is_critical,
        "threshold_warning": binding.threshold_warning,
        "threshold_critical": binding.threshold_critical,
        "label_override": binding.label_override,
        "query_config_override": binding.query_config_override,
        "created_by": binding.created_by,
        "created_at": binding.created_at.isoformat() if binding.created_at else None,
        "updated_at": binding.updated_at.isoformat() if binding.updated_at else None,
        "metric_template": _serialize_template(binding.metric_template),
    }


async def _get_pc(db: AsyncSession, project_id: str, pc_id: str) -> ProjectConnector:
    pc = await project_connector_service.get_by_id(db, pc_id)
    if not pc or pc.project_id != project_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project connector not found")
    return pc


@router.get("", response_model=List[dict])
async def list_metric_bindings(
    project_id: str,
    pc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_pc(db, project_id, pc_id)
    bindings = await project_connector_metric_service.list_for_connector(db, pc_id)
    return [_serialize_binding(b) for b in bindings]


@router.post("/initialize", response_model=List[dict])
async def initialize_defaults(
    project_id: str,
    pc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    pc = await _get_pc(db, project_id, pc_id)
    bindings = await project_connector_metric_service.initialize_defaults(
        db, pc_id, pc.catalog_entry_id, current_user.id
    )
    return [_serialize_binding(b) for b in bindings]


@router.put("", response_model=List[dict])
async def bulk_save_bindings(
    project_id: str,
    pc_id: str,
    data: ProjectConnectorMetricBulkSave,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    await _get_pc(db, project_id, pc_id)
    bindings = await project_connector_metric_service.bulk_save(db, pc_id, data, current_user.id)
    return [_serialize_binding(b) for b in bindings]


@router.put("/{binding_id}", response_model=dict)
async def update_binding(
    project_id: str,
    pc_id: str,
    binding_id: str,
    data: ProjectConnectorMetricUpsert,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    await _get_pc(db, project_id, pc_id)
    binding = await project_connector_metric_service.get_by_id(db, binding_id)
    if not binding or binding.project_connector_id != pc_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric binding not found")
    updated = await project_connector_metric_service.upsert(db, pc_id, data, current_user.id)
    return _serialize_binding(updated)


@router.delete("/{binding_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_binding(
    project_id: str,
    pc_id: str,
    binding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    await _get_pc(db, project_id, pc_id)
    binding = await project_connector_metric_service.get_by_id(db, binding_id)
    if not binding or binding.project_connector_id != pc_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Metric binding not found")
    await project_connector_metric_service.delete_binding(db, binding_id)
