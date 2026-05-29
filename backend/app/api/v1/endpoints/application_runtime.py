"""
Application Runtime Metrics API endpoints.

Provides per-application observability data collected by Splunk and AppDynamics connectors.

Routes:
  GET /projects/{project_id}/applications                        — list app names in project
  GET /applications/{app_name}/metrics                          — latest runtime metrics
  GET /applications/{app_name}/snapshot                         — latest health snapshot
  GET /applications/{app_name}/history/{metric_key}             — metric trend history
  GET /projects/{project_id}/connectors/{pc_id}/app-metrics     — metrics for a connector
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.services.connector_agent_service import connector_agent_service

router = APIRouter(tags=["application-runtime"])


@router.get(
    "/projects/{project_id}/applications",
    response_model=List[str],
    summary="List application names tracked in a project",
)
async def list_project_applications(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return distinct application names that have runtime metrics for a project."""
    return await connector_agent_service.get_project_application_names(db, project_id)


@router.get(
    "/applications/{app_name}/metrics",
    response_model=List[Dict[str, Any]],
    summary="Get latest runtime metrics for an application",
)
async def get_application_metrics(
    app_name: str,
    environment: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent application runtime metrics, grouped by metric key."""
    return await connector_agent_service.get_application_metrics(
        db, app_name, environment=environment, limit=limit
    )


@router.get(
    "/applications/{app_name}/snapshot",
    response_model=Optional[Dict[str, Any]],
    summary="Get latest health snapshot for an application",
)
async def get_application_snapshot(
    app_name: str,
    environment: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent aggregated health snapshot for an application."""
    return await connector_agent_service.get_application_health_snapshot(
        db, app_name, environment=environment
    )


@router.get(
    "/applications/{app_name}/history/{metric_key}",
    response_model=List[Dict[str, Any]],
    summary="Get metric history for trend analysis",
)
async def get_metric_history(
    app_name: str,
    metric_key: str,
    environment: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return historical metric values for an application metric key."""
    return await connector_agent_service.get_application_metric_history(
        db, app_name, metric_key, environment=environment, limit=limit
    )
