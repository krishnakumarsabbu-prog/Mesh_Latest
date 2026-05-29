from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.db.base import get_db
from app.api.deps import get_current_user, require_project_admin
from app.models.user import User
from app.models.dashboard_template import (
    DashboardTemplate, DashboardWidget, WidgetMetricBinding,
    DashboardScope, DashboardVisibility, WidgetType, MetricSourceScope, AggregationMode,
)
from app.schemas.dashboard_template import (
    DashboardTemplateCreate, DashboardTemplateUpdate,
    DashboardTemplateSaveLayout,
)
from app.services.dashboard_template_service import dashboard_template_service

router = APIRouter(prefix="/dashboard-templates", tags=["dashboard-templates"])


def _serialize_mb(mb: WidgetMetricBinding) -> dict:
    return {
        "id": mb.id,
        "widget_id": mb.widget_id,
        "metric_source_scope": mb.metric_source_scope.value if hasattr(mb.metric_source_scope, "value") else mb.metric_source_scope,
        "metric_key": mb.metric_key,
        "connector_type": mb.connector_type,
        "aggregation_mode": mb.aggregation_mode.value if hasattr(mb.aggregation_mode, "value") else mb.aggregation_mode,
        "display_label": mb.display_label,
        "color_override": mb.color_override,
        "sort_order": mb.sort_order,
    }


def _serialize_widget(w: DashboardWidget) -> dict:
    return {
        "id": w.id,
        "dashboard_template_id": w.dashboard_template_id,
        "widget_type": w.widget_type.value if hasattr(w.widget_type, "value") else w.widget_type,
        "title": w.title,
        "subtitle": w.subtitle,
        "layout_x": w.layout_x,
        "layout_y": w.layout_y,
        "width": w.width,
        "height": w.height,
        "chart_config": w.chart_config,
        "threshold_config": w.threshold_config,
        "display_config": w.display_config,
        "sort_order": w.sort_order,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "updated_at": w.updated_at.isoformat() if w.updated_at else None,
        "metric_bindings": [_serialize_mb(mb) for mb in (w.metric_bindings or [])],
    }


def _serialize(t: DashboardTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "scope": t.scope.value if hasattr(t.scope, "value") else t.scope,
        "category": t.category,
        "tags": t.tags,
        "visibility": t.visibility.value if hasattr(t.visibility, "value") else t.visibility,
        "is_default": t.is_default,
        "version": t.version,
        "created_by": t.created_by,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
        "widgets": [_serialize_widget(w) for w in (t.widgets or [])],
        "widget_count": len(t.widgets or []),
    }


@router.get("", response_model=List[dict])
async def list_templates(
    scope: Optional[str] = Query(None),
    visibility: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    templates = await dashboard_template_service.list_all(db, scope=scope, visibility=visibility)
    return [_serialize(t) for t in templates]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_template(
    data: DashboardTemplateCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    template = await dashboard_template_service.create(db, data, current_user.id)
    return _serialize(template)


@router.get("/{template_id}", response_model=dict)
async def get_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    template = await dashboard_template_service.get_by_id(db, template_id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _serialize(template)


@router.patch("/{template_id}", response_model=dict)
async def update_template(
    template_id: str,
    data: DashboardTemplateUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    template = await dashboard_template_service.update(db, template_id, data)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _serialize(template)


@router.put("/{template_id}/layout", response_model=dict)
async def save_layout(
    template_id: str,
    data: DashboardTemplateSaveLayout,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    template = await dashboard_template_service.save_layout(db, template_id, data)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _serialize(template)


class CloneRequest(BaseModel):
    name: str


@router.post("/{template_id}/clone", response_model=dict, status_code=status.HTTP_201_CREATED)
async def clone_template(
    template_id: str,
    data: CloneRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    template = await dashboard_template_service.clone(db, template_id, data.name, current_user.id)
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    return _serialize(template)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_template(
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    deleted = await dashboard_template_service.delete(db, template_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")


@router.get("/meta/widget-types", response_model=List[dict])
async def get_widget_types(current_user: User = Depends(get_current_user)):
    return [
        {"value": "kpi_card", "label": "KPI Card", "description": "Single metric headline with trend", "default_width": 2, "default_height": 1, "min_width": 1, "min_height": 1, "category": "metric"},
        {"value": "gauge", "label": "Gauge", "description": "Semi-circular gauge for thresholds", "default_width": 2, "default_height": 2, "min_width": 2, "min_height": 2, "category": "metric"},
        {"value": "progress_ring", "label": "Progress Ring", "description": "Circular progress indicator", "default_width": 2, "default_height": 2, "min_width": 2, "min_height": 2, "category": "metric"},
        {"value": "sparkline", "label": "Sparkline", "description": "Compact inline time-series", "default_width": 2, "default_height": 1, "min_width": 2, "min_height": 1, "category": "chart"},
        {"value": "line_chart", "label": "Line Chart", "description": "Multi-series line over time", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "chart"},
        {"value": "area_chart", "label": "Area Chart", "description": "Filled area time-series", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "chart"},
        {"value": "bar_chart", "label": "Bar Chart", "description": "Vertical/horizontal bar comparison", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "chart"},
        {"value": "stacked_bar", "label": "Stacked Bar", "description": "Multi-series stacked bars", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "chart"},
        {"value": "pie_donut", "label": "Pie / Donut", "description": "Distribution breakdown", "default_width": 3, "default_height": 3, "min_width": 2, "min_height": 2, "category": "chart"},
        {"value": "sla_card", "label": "SLA Card", "description": "SLA compliance status card", "default_width": 2, "default_height": 2, "min_width": 2, "min_height": 2, "category": "status"},
        {"value": "alert_panel", "label": "Alert Panel", "description": "Active alert feed with severity", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "status"},
        {"value": "status_timeline", "label": "Status Timeline", "description": "Timeline of status transitions", "default_width": 6, "default_height": 2, "min_width": 4, "min_height": 2, "category": "status"},
        {"value": "comparison_grid", "label": "Comparison Grid", "description": "Side-by-side metric comparison", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "table"},
        {"value": "table_widget", "label": "Table", "description": "Tabular data with sorting", "default_width": 6, "default_height": 4, "min_width": 4, "min_height": 3, "category": "table"},
        {"value": "heatmap", "label": "Heatmap", "description": "Color-coded matrix for patterns", "default_width": 6, "default_height": 3, "min_width": 4, "min_height": 3, "category": "chart"},
        {"value": "health_distribution", "label": "Health Distribution", "description": "Health status donut breakdown", "default_width": 3, "default_height": 3, "min_width": 2, "min_height": 2, "category": "status"},
        {"value": "runtime_app_location_summary", "label": "App Location Summary", "description": "Shows application runtime location across data centers", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "observability"},
        {"value": "runtime_dc_health_map", "label": "Data Center Health Map", "description": "Visual grid of data centers with asset counts", "default_width": 4, "default_height": 3, "min_width": 3, "min_height": 2, "category": "observability"},
        {"value": "runtime_freshness_status", "label": "Data Freshness Status", "description": "Overview of data source age and staleness", "default_width": 3, "default_height": 3, "min_width": 2, "min_height": 2, "category": "observability"},
    ]
