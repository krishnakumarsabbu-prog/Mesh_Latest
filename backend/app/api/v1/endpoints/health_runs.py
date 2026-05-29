"""
Health Run API endpoints.

Provides endpoints to trigger project health runs, retrieve run history,
inspect individual run details, and fetch the latest run for a project.

Routes:
  POST /health/run/{project_id}          — trigger a new health run
  GET  /health/history/{project_id}      — list historical runs for a project
  GET  /health/run/{run_id}              — get details for a specific run
  GET  /health/latest/{project_id}       — get the most recent run for a project
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user, require_project_admin
from app.db.base import get_db
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunStatus,
    HealthRunTrigger,
)
from app.models.user import User
from app.services.health_orchestrator import health_orchestrator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/health", tags=["health-runs"])


@router.post(
    "/run/{project_id}",
    response_model=dict,
    summary="Trigger a project health run",
)
async def run_project_health(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
) -> Dict[str, Any]:
    """
    Execute a full health run for all configured connectors in a project.

    Runs all enabled connectors in parallel, aggregates results, computes
    health score, and persists the full execution snapshot. Returns the
    run summary immediately upon completion.
    """
    logger.info(
        "Health run requested: project=%s user=%s", project_id, current_user.id
    )

    result = await health_orchestrator.run_project_health(
        db=db,
        project_id=project_id,
        triggered_by=HealthRunTrigger.MANUAL.value,
        triggered_by_user_id=current_user.id,
    )
    return result


@router.get(
    "/history/{project_id}",
    response_model=dict,
    summary="List health run history for a project",
)
async def get_project_health_history(
    project_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return paginated health run history for a project, newest first.
    """
    result = await db.execute(
        select(HealthRun)
        .where(HealthRun.project_id == project_id)
        .order_by(desc(HealthRun.started_at))
        .limit(limit)
        .offset(offset)
    )
    runs = result.scalars().all()

    count_result = await db.execute(
        select(HealthRun).where(HealthRun.project_id == project_id)
    )
    total = len(count_result.scalars().all())

    return {
        "runs": [_serialize_run_summary(r) for r in runs],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get(
    "/run/{run_id}",
    response_model=dict,
    summary="Get details for a specific health run",
)
async def get_health_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return full details for a health run, including per-connector results.
    """
    result = await db.execute(
        select(HealthRun)
        .options(selectinload(HealthRun.connector_results))
        .where(HealthRun.id == run_id)
    )
    run = result.scalar_one_or_none()

    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Health run '{run_id}' not found",
        )

    return _serialize_run_detail(run)


@router.get(
    "/latest/{project_id}",
    response_model=dict,
    summary="Get the latest health run for a project",
)
async def get_latest_health_run(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return the most recent completed health run for a project, with connector details.
    Returns 404 if no runs exist yet.
    """
    result = await db.execute(
        select(HealthRun)
        .options(selectinload(HealthRun.connector_results))
        .where(HealthRun.project_id == project_id)
        .order_by(desc(HealthRun.started_at))
        .limit(1)
    )
    run = result.scalar_one_or_none()

    if run is None:
        return {
            "run_id": None,
            "execution_id": None,
            "project_id": project_id,
            "status": "no_runs",
            "overall_health_status": None,
            "overall_score": None,
            "connector_count": 0,
            "success_count": 0,
            "failure_count": 0,
            "skipped_count": 0,
            "total_duration_ms": None,
            "triggered_by": None,
            "started_at": None,
            "completed_at": None,
            "error_message": None,
            "contributing_factors": [],
            "connector_results": [],
        }

    return _serialize_run_detail(run)


def _serialize_run_summary(run: HealthRun) -> Dict[str, Any]:
    """Serialize a HealthRun to a summary dict."""
    return {
        "run_id": run.id,
        "execution_id": run.execution_id,
        "project_id": run.project_id,
        "status": run.status.value if run.status else None,
        "overall_health_status": run.overall_health_status.value if run.overall_health_status else None,
        "overall_score": run.overall_score,
        "connector_count": run.connector_count,
        "success_count": run.success_count,
        "failure_count": run.failure_count,
        "skipped_count": run.skipped_count,
        "total_duration_ms": run.total_duration_ms,
        "triggered_by": run.triggered_by.value if run.triggered_by else None,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "error_message": run.error_message,
    }


def _serialize_run_detail(run: HealthRun) -> Dict[str, Any]:
    """Serialize a HealthRun with connector results to a detail dict."""
    summary = _serialize_run_summary(run)

    factors: List[str] = []
    if run.contributing_factors:
        try:
            factors = json.loads(run.contributing_factors)
        except Exception:
            factors = [run.contributing_factors]

    connector_results = []
    for r in (run.connector_results or []):
        connector_results.append({
            "id": r.id,
            "project_connector_id": r.project_connector_id,
            "connector_name": r.connector_name,
            "connector_slug": r.connector_slug,
            "connector_category": r.connector_category,
            "outcome": r.outcome.value if r.outcome else None,
            "health_status": r.health_status.value if r.health_status else None,
            "health_score": r.health_score,
            "response_time_ms": r.response_time_ms,
            "error_message": r.error_message,
            "message": r.message,
            "weight": r.weight,
            "is_enabled": r.is_enabled,
            "priority": r.priority,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "duration_ms": r.duration_ms,
        })

    summary["contributing_factors"] = factors
    summary["connector_results"] = connector_results
    return summary
