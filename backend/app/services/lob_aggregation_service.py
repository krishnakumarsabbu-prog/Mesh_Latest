"""
LOB Aggregation Service.

Computes and persists roll-up metrics for every LOB by aggregating
pre-computed Team aggregate metrics and the project health runs
belonging to all projects under that LOB.

Computed metrics (all persisted as individual rows in lob_aggregate_metrics):
  avg_team_health          – mean of avg_project_health across all teams in LOB
  avg_project_health       – mean health score across all projects in LOB
  total_projects           – total project count in LOB
  critical_projects_count  – count of projects with score < 50 or critical status
  critical_teams_count     – teams whose avg_project_health < 50
  portfolio_availability   – mean availability across all projects in LOB
  total_incidents          – sum of open incidents across all projects in LOB
  sla_breach_rate          – (total sla breaches / total incidents) * 100, capped 0-100
  team_count               – number of active teams in LOB
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.aggregates import LobAggregateMetric, TeamAggregateMetric
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunMetric,
    HealthRunStatus,
    RunHealthStatus,
)
from app.models.lob import Lob
from app.models.project import Project
from app.models.team import Team

logger = logging.getLogger("healthmesh.aggregation.lob")

_HEALTHY_THRESHOLD = 80.0
_CRITICAL_THRESHOLD = 50.0
_WINDOW_HOURS = 24


class LobAggregationService:

    async def recompute_lob(self, db: AsyncSession, lob_id: str) -> Dict[str, Any]:
        """Recompute all aggregate metrics for a single LOB and persist them."""
        logger.info(f"[lob-agg] recomputing lob={lob_id}")

        metrics = await self._compute_metrics(db, lob_id)
        await self._upsert_metrics(db, lob_id, metrics)

        logger.info(f"[lob-agg] lob={lob_id} done: {len(metrics)} metrics persisted")
        return metrics

    async def recompute_all_lobs(self, db: AsyncSession) -> Dict[str, Dict[str, Any]]:
        """Recompute aggregate metrics for every active LOB."""
        result = await db.execute(select(Lob).where(Lob.is_active == True))
        lobs = result.scalars().all()

        results: Dict[str, Dict[str, Any]] = {}
        for lob in lobs:
            try:
                results[lob.id] = await self.recompute_lob(db, lob.id)
            except Exception as exc:
                logger.error(f"[lob-agg] failed for lob={lob.id}: {exc}")
        return results

    async def get_lob_metrics(
        self, db: AsyncSession, lob_id: str
    ) -> Dict[str, Any]:
        """Return the last-persisted aggregate metrics for a LOB."""
        result = await db.execute(
            select(LobAggregateMetric).where(LobAggregateMetric.lob_id == lob_id)
        )
        rows = result.scalars().all()
        if not rows:
            return {}
        return {
            row.metric_key: {
                "value": row.numeric_value,
                "string_value": row.string_value,
                "last_computed_at": row.last_computed_at.isoformat() if row.last_computed_at else None,
            }
            for row in rows
        }

    async def get_all_lobs_metrics(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """Return last-persisted aggregate metrics for all LOBs, shaped for dashboards."""
        result = await db.execute(select(Lob).where(Lob.is_active == True))
        lobs = result.scalars().all()

        output = []
        for lob in lobs:
            metrics = await self.get_lob_metrics(db, lob.id)
            output.append({
                "lob_id": lob.id,
                "lob_name": lob.name,
                "lob_slug": lob.slug,
                "metrics": {k: v["value"] for k, v in metrics.items()},
                "last_computed_at": max(
                    (v["last_computed_at"] for v in metrics.values() if v["last_computed_at"]),
                    default=None,
                ),
            })
        return output

    async def _compute_metrics(
        self, db: AsyncSession, lob_id: str
    ) -> Dict[str, float]:
        teams = await self._get_lob_teams(db, lob_id)
        team_ids = [t.id for t in teams]
        team_count = len(team_ids)

        projects = await self._get_lob_projects(db, lob_id)
        project_ids = [p.id for p in projects]
        total_projects = len(project_ids)

        if not project_ids:
            return self._zero_metrics(team_count, total_projects)

        latest_runs = await self._get_latest_runs(db, project_ids)
        run_ids = [r.id for r in latest_runs]
        scores = [r.overall_score or 0.0 for r in latest_runs]
        statuses = [
            r.overall_health_status.value if r.overall_health_status else "unknown"
            for r in latest_runs
        ]

        avg_project_health = sum(scores) / len(scores) if scores else 0.0
        critical_projects = sum(
            1 for i, s in enumerate(scores)
            if s < _CRITICAL_THRESHOLD
            or statuses[i] in {RunHealthStatus.DOWN.value, RunHealthStatus.ERROR.value}
        )

        avg_team_health = await self._compute_avg_team_health(db, team_ids)
        critical_teams = await self._count_critical_teams(db, team_ids)

        portfolio_availability = await self._avg_metric(db, run_ids, "availability")
        total_incidents = await self._sum_metric(db, run_ids, "open_incidents")
        total_sla_breaches = await self._sum_metric(db, run_ids, "sla_breaches")

        if total_incidents > 0:
            sla_breach_rate = min((total_sla_breaches / total_incidents) * 100.0, 100.0)
        else:
            sla_breach_rate = 0.0

        return {
            "avg_team_health": round(avg_team_health, 2),
            "avg_project_health": round(avg_project_health, 2),
            "total_projects": float(total_projects),
            "critical_projects_count": float(critical_projects),
            "critical_teams_count": float(critical_teams),
            "portfolio_availability": round(portfolio_availability, 2),
            "total_incidents": float(total_incidents),
            "sla_breach_rate": round(sla_breach_rate, 2),
            "team_count": float(team_count),
        }

    async def _get_lob_teams(self, db: AsyncSession, lob_id: str) -> List[Team]:
        result = await db.execute(
            select(Team).where(and_(Team.lob_id == lob_id, Team.is_active == True))
        )
        return result.scalars().all()

    async def _get_lob_projects(self, db: AsyncSession, lob_id: str) -> List[Project]:
        result = await db.execute(
            select(Project).where(Project.lob_id == lob_id)
        )
        return result.scalars().all()

    async def _get_latest_runs(
        self, db: AsyncSession, project_ids: List[str]
    ) -> List[HealthRun]:
        since = datetime.utcnow() - timedelta(hours=_WINDOW_HOURS * 7)
        latest_runs: List[HealthRun] = []
        for pid in project_ids:
            result = await db.execute(
                select(HealthRun)
                .where(
                    and_(
                        HealthRun.project_id == pid,
                        HealthRun.status == HealthRunStatus.COMPLETED,
                        HealthRun.started_at >= since,
                    )
                )
                .order_by(HealthRun.started_at.desc())
                .limit(1)
            )
            run = result.scalar_one_or_none()
            if run:
                latest_runs.append(run)
        return latest_runs

    async def _compute_avg_team_health(
        self, db: AsyncSession, team_ids: List[str]
    ) -> float:
        if not team_ids:
            return 0.0
        result = await db.execute(
            select(func.avg(TeamAggregateMetric.numeric_value)).where(
                and_(
                    TeamAggregateMetric.team_id.in_(team_ids),
                    TeamAggregateMetric.metric_key == "avg_project_health",
                )
            )
        )
        val = result.scalar_one_or_none()
        return float(val) if val is not None else 0.0

    async def _count_critical_teams(
        self, db: AsyncSession, team_ids: List[str]
    ) -> int:
        if not team_ids:
            return 0
        result = await db.execute(
            select(func.count(TeamAggregateMetric.id)).where(
                and_(
                    TeamAggregateMetric.team_id.in_(team_ids),
                    TeamAggregateMetric.metric_key == "avg_project_health",
                    TeamAggregateMetric.numeric_value < _CRITICAL_THRESHOLD,
                )
            )
        )
        val = result.scalar_one_or_none()
        return int(val) if val else 0

    async def _sum_metric(
        self, db: AsyncSession, run_ids: List[str], metric_name: str
    ) -> float:
        if not run_ids:
            return 0.0
        result = await db.execute(
            select(func.sum(HealthRunMetric.metric_value)).where(
                and_(
                    HealthRunMetric.health_run_id.in_(run_ids),
                    HealthRunMetric.metric_name == metric_name,
                )
            )
        )
        val = result.scalar_one_or_none()
        return float(val) if val is not None else 0.0

    async def _avg_metric(
        self, db: AsyncSession, run_ids: List[str], metric_name: str
    ) -> float:
        if not run_ids:
            return 0.0
        result = await db.execute(
            select(func.avg(HealthRunMetric.metric_value)).where(
                and_(
                    HealthRunMetric.health_run_id.in_(run_ids),
                    HealthRunMetric.metric_name == metric_name,
                )
            )
        )
        val = result.scalar_one_or_none()
        if val is not None:
            return float(val)
        result2 = await db.execute(
            select(func.avg(HealthRunConnectorResult.health_score)).where(
                HealthRunConnectorResult.health_run_id.in_(run_ids)
            )
        )
        val2 = result2.scalar_one_or_none()
        return float(val2) if val2 is not None else 100.0

    def _zero_metrics(self, team_count: int, total_projects: int) -> Dict[str, float]:
        return {
            "avg_team_health": 0.0,
            "avg_project_health": 0.0,
            "total_projects": float(total_projects),
            "critical_projects_count": 0.0,
            "critical_teams_count": 0.0,
            "portfolio_availability": 0.0,
            "total_incidents": 0.0,
            "sla_breach_rate": 0.0,
            "team_count": float(team_count),
        }

    async def _upsert_metrics(
        self, db: AsyncSession, lob_id: str, metrics: Dict[str, float]
    ) -> None:
        now = datetime.utcnow()
        for metric_key, value in metrics.items():
            result = await db.execute(
                select(LobAggregateMetric).where(
                    and_(
                        LobAggregateMetric.lob_id == lob_id,
                        LobAggregateMetric.metric_key == metric_key,
                    )
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                existing.numeric_value = value
                existing.last_computed_at = now
                existing.compute_window_hours = _WINDOW_HOURS
            else:
                db.add(
                    LobAggregateMetric(
                        id=str(uuid.uuid4()),
                        lob_id=lob_id,
                        metric_key=metric_key,
                        numeric_value=value,
                        compute_window_hours=_WINDOW_HOURS,
                        last_computed_at=now,
                    )
                )
        await db.flush()


lob_aggregation_service = LobAggregationService()
