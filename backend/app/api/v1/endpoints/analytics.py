"""
Analytics API Endpoints.

Provides historical analytics, trend analysis, SLA/uptime metrics,
project comparison, connector performance history, and export support.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.services.analytics_service import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/project/{project_id}/trends")
async def get_project_trends(
    project_id: str,
    time_range: str = Query("7d", description="Time range: 24h, 7d, 30d, 90d, custom"),
    granularity: Optional[str] = Query(None, description="hourly, daily, weekly, monthly"),
    custom_start: Optional[str] = Query(None, description="ISO datetime for custom range start"),
    custom_end: Optional[str] = Query(None, description="ISO datetime for custom range end"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_dt = _parse_dt(custom_start)
    end_dt = _parse_dt(custom_end)
    result = await analytics_service.get_project_trends(
        db=db,
        project_id=project_id,
        time_range=time_range,
        granularity=granularity,
        custom_start=start_dt,
        custom_end=end_dt,
    )
    return result


@router.get("/project/{project_id}/comparison")
async def get_project_comparison(
    project_id: str,
    time_range: str = Query("7d"),
    custom_start: Optional[str] = Query(None),
    custom_end: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_dt = _parse_dt(custom_start)
    end_dt = _parse_dt(custom_end)
    result = await analytics_service.get_all_projects_comparison(
        db=db,
        time_range=time_range,
        custom_start=start_dt,
        custom_end=end_dt,
    )
    return result


@router.get("/projects/comparison")
async def get_multi_project_comparison(
    project_ids: List[str] = Query(..., description="List of project IDs to compare"),
    time_range: str = Query("7d"),
    custom_start: Optional[str] = Query(None),
    custom_end: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not project_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one project_id required")
    start_dt = _parse_dt(custom_start)
    end_dt = _parse_dt(custom_end)
    result = await analytics_service.get_project_comparison(
        db=db,
        project_ids=project_ids,
        time_range=time_range,
        custom_start=start_dt,
        custom_end=end_dt,
    )
    return result


@router.get("/project/{project_id}/sla")
async def get_project_sla(
    project_id: str,
    time_range: str = Query("30d"),
    sla_threshold: float = Query(99.0, description="SLA threshold percentage (e.g. 99.0)"),
    custom_start: Optional[str] = Query(None),
    custom_end: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_dt = _parse_dt(custom_start)
    end_dt = _parse_dt(custom_end)
    result = await analytics_service.get_sla_metrics(
        db=db,
        project_id=project_id,
        time_range=time_range,
        sla_threshold=sla_threshold,
        custom_start=start_dt,
        custom_end=end_dt,
    )
    return result


@router.get("/project/{project_id}/connectors/history")
async def get_connector_performance_history(
    project_id: str,
    time_range: str = Query("7d"),
    granularity: Optional[str] = Query(None),
    custom_start: Optional[str] = Query(None),
    custom_end: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_dt = _parse_dt(custom_start)
    end_dt = _parse_dt(custom_end)
    result = await analytics_service.get_connector_performance_history(
        db=db,
        project_id=project_id,
        time_range=time_range,
        granularity=granularity,
        custom_start=start_dt,
        custom_end=end_dt,
    )
    return result


@router.get("/project/{project_id}/export")
async def export_project_analytics(
    project_id: str,
    format: str = Query("json", description="Export format: json or csv"),
    time_range: str = Query("30d"),
    custom_start: Optional[str] = Query(None),
    custom_end: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start_dt = _parse_dt(custom_start)
    end_dt = _parse_dt(custom_end)
    result = await analytics_service.export_project_analytics(
        db=db,
        project_id=project_id,
        export_format=format,
        time_range=time_range,
        custom_start=start_dt,
        custom_end=end_dt,
    )

    if format == "csv":
        filename = result.get("filename", f"analytics_{project_id}.csv")
        return Response(
            content=result["content"],
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    return result


@router.get("/overview")
async def get_analytics_overview(
    lob_id: Optional[str] = Query(None),
    time_range: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await analytics_service.get_all_projects_comparison(
        db=db,
        lob_id=lob_id,
        time_range=time_range,
    )
    return result


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00").replace("+00:00", ""))
    except Exception:
        return None
