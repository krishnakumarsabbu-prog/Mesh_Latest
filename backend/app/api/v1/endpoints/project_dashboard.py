"""
Project Health Dashboard API endpoints.

Provides analytics-grade health data for per-project observability dashboards.

Routes:
  GET /dashboard/project/{project_id}/summary    — overview health cards
  GET /dashboard/project/{project_id}/trends     — trend line series
  GET /dashboard/project/{project_id}/metrics    — metric KPI series
  GET /dashboard/project/{project_id}/connector/{connector_id}  — drilldown
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.services.project_dashboard_service import project_dashboard_service

router = APIRouter(prefix="/dashboard", tags=["project-dashboard"])


@router.get(
    "/project/{project_id}/summary",
    response_model=dict,
    summary="Get project health summary",
)
async def get_project_summary(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return await project_dashboard_service.get_project_summary(db, project_id)


@router.get(
    "/project/{project_id}/trends",
    response_model=dict,
    summary="Get project health trends",
)
async def get_project_trends(
    project_id: str,
    time_range: str = Query(default="24h", regex="^(24h|7d|30d|custom)$"),
    custom_hours: Optional[int] = Query(default=None, ge=1, le=2160),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return await project_dashboard_service.get_project_trends(
        db, project_id, time_range=time_range, custom_hours=custom_hours
    )


@router.get(
    "/project/{project_id}/metrics",
    response_model=dict,
    summary="Get project metrics KPI series",
)
async def get_project_metrics(
    project_id: str,
    time_range: str = Query(default="24h", regex="^(24h|7d|30d|custom)$"),
    custom_hours: Optional[int] = Query(default=None, ge=1, le=2160),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return await project_dashboard_service.get_project_metrics(
        db, project_id, time_range=time_range, custom_hours=custom_hours
    )


@router.get(
    "/project/{project_id}/connector/{connector_id}",
    response_model=dict,
    summary="Get connector drilldown data",
)
async def get_connector_drilldown(
    project_id: str,
    connector_id: str,
    time_range: str = Query(default="24h", regex="^(24h|7d|30d|custom)$"),
    custom_hours: Optional[int] = Query(default=None, ge=1, le=2160),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return await project_dashboard_service.get_connector_drilldown(
        db, project_id, connector_id, time_range=time_range, custom_hours=custom_hours
    )
