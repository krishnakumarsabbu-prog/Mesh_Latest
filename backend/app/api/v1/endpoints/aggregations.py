"""
Aggregation API Endpoints.

Exposes pre-computed Team and LOB roll-up metrics for dashboard consumption.

Endpoints:
  GET  /aggregations/teams                   – all team aggregates
  GET  /aggregations/teams/{team_id}         – single team aggregates
  POST /aggregations/teams/{team_id}/recompute – manual trigger
  GET  /aggregations/lobs                    – all LOB aggregates
  GET  /aggregations/lobs/{lob_id}           – single LOB aggregates
  POST /aggregations/lobs/{lob_id}/recompute  – manual trigger
  POST /aggregations/recompute-all            – full system refresh (admin)
"""

from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.services.lob_aggregation_service import lob_aggregation_service
from app.services.team_aggregation_service import team_aggregation_service

router = APIRouter(prefix="/aggregations", tags=["aggregations"])


@router.get("/teams", response_model=List[Dict[str, Any]])
async def list_team_aggregates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await team_aggregation_service.get_all_teams_metrics(db)


@router.get("/teams/{team_id}", response_model=Dict[str, Any])
async def get_team_aggregate(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metrics = await team_aggregation_service.get_team_metrics(db, team_id)
    if not metrics:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No aggregate metrics found for this team. Trigger a recompute first.",
        )
    return {
        "team_id": team_id,
        "metrics": {k: v["value"] for k, v in metrics.items()},
        "last_computed_at": max(
            (v["last_computed_at"] for v in metrics.values() if v["last_computed_at"]),
            default=None,
        ),
    }


@router.post("/teams/{team_id}/recompute", response_model=Dict[str, Any])
async def recompute_team_aggregate(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    result = await team_aggregation_service.recompute_team(db, team_id)
    return {"team_id": team_id, "metrics": result, "status": "recomputed"}


@router.get("/lobs", response_model=List[Dict[str, Any]])
async def list_lob_aggregates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await lob_aggregation_service.get_all_lobs_metrics(db)


@router.get("/lobs/{lob_id}", response_model=Dict[str, Any])
async def get_lob_aggregate(
    lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    metrics = await lob_aggregation_service.get_lob_metrics(db, lob_id)
    if not metrics:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No aggregate metrics found for this LOB. Trigger a recompute first.",
        )
    return {
        "lob_id": lob_id,
        "metrics": {k: v["value"] for k, v in metrics.items()},
        "last_computed_at": max(
            (v["last_computed_at"] for v in metrics.values() if v["last_computed_at"]),
            default=None,
        ),
    }


@router.post("/lobs/{lob_id}/recompute", response_model=Dict[str, Any])
async def recompute_lob_aggregate(
    lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    result = await lob_aggregation_service.recompute_lob(db, lob_id)
    return {"lob_id": lob_id, "metrics": result, "status": "recomputed"}


@router.post("/recompute-all", response_model=Dict[str, Any])
async def recompute_all_aggregates(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_admin(current_user)
    team_results = await team_aggregation_service.recompute_all_teams(db)
    lob_results = await lob_aggregation_service.recompute_all_lobs(db)
    return {
        "status": "recomputed",
        "teams_processed": len(team_results),
        "lobs_processed": len(lob_results),
    }


def _require_admin(user: User) -> None:
    allowed = {"super_admin", "admin", "lob_admin"}
    if user.role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to trigger aggregate recomputation.",
        )
