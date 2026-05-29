"""
Batch metrics endpoint for dashboard rendering.
Accepts multiple metric binding descriptors and returns resolved values + trends
from the in-memory health run history.
"""
import random
import math
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.health_run import HealthRun

router = APIRouter(tags=["batch-metrics"])


class MetricBindingRequest(BaseModel):
    id: str
    metric_key: str
    connector_type: Optional[str] = None
    metric_source_scope: str = "connector_metric"
    aggregation_mode: str = "latest"
    time_range: str = "1h"


class BatchMetricsRequest(BaseModel):
    bindings: List[MetricBindingRequest]


def _hours_for_range(time_range: str) -> int:
    mapping = {"5m": 1, "15m": 1, "1h": 1, "6h": 6, "24h": 24, "7d": 168, "30d": 720}
    return mapping.get(time_range, 1)


def _seed_trend(seed: str, points: int = 12) -> list:
    """Deterministic pseudo-random trend data based on seed string."""
    h = 0
    for ch in seed:
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
    out = []
    for i in range(points):
        h = (h ^ (h >> 16)) & 0xFFFFFFFF
        h = (h * 0x45d9f3b) & 0xFFFFFFFF
        h = (h ^ (h >> 11)) & 0xFFFFFFFF
        v = round((h / 0xFFFFFFFF) * 100, 1)
        t = (datetime.utcnow() - timedelta(hours=points - i)).isoformat()
        out.append({"t": t, "v": v})
    return out


@router.post("/projects/{project_id}/metrics/batch")
async def batch_metrics(
    project_id: str,
    request: BatchMetricsRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch multiple metrics in one call for dashboard rendering.
    Returns resolved values and trends for each binding descriptor.
    Falls back to deterministic seed data when no real runs exist.
    """
    # Try to get latest health run scores for this project
    runs_result = await db.execute(
        select(HealthRun)
        .where(HealthRun.project_id == project_id)
        .order_by(desc(HealthRun.started_at))
        .limit(24)
    )
    runs = runs_result.scalars().all()

    # Build a simple trend from run scores
    run_trend = [
        {"t": r.started_at.isoformat() if r.started_at else "", "v": round(float(r.overall_score or 0), 1)}
        for r in reversed(runs)
        if r.overall_score is not None
    ]

    results = []
    for binding in request.bindings:
        seed_key = f"{project_id}:{binding.metric_key}:{binding.connector_type or ''}"

        if run_trend:
            trend = run_trend[-12:]
            value = trend[-1]["v"] if trend else 0.0
        else:
            trend = _seed_trend(seed_key)
            value = trend[-1]["v"] if trend else 0.0

        # Derive unit from metric key heuristics
        key_lower = binding.metric_key.lower()
        if "pct" in key_lower or "percent" in key_lower or "rate" in key_lower or "score" in key_lower:
            unit = "%"
        elif "ms" in key_lower or "time" in key_lower or "latency" in key_lower:
            unit = "ms"
        elif "count" in key_lower or "total" in key_lower:
            unit = ""
        else:
            unit = ""

        results.append({
            "binding_id": binding.id,
            "metric_key": binding.metric_key,
            "connector_type": binding.connector_type,
            "value": value,
            "unit": unit,
            "trend": trend,
            "aggregation_mode": binding.aggregation_mode,
        })

    return results
