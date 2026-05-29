"""
Team Aggregation Service.

Computes and persists roll-up metrics for every team by aggregating the
latest health runs of all projects assigned to that team.

Computed metrics (all persisted as individual rows in team_aggregate_metrics):
  avg_project_health       – weighted average health score (0-100)
  healthy_projects_count   – projects with overall_score >= 80
  warning_projects_count   – projects with overall_score 50-79
  critical_projects_count  – projects with overall_score < 50 or status=down/error
  total_open_incidents     – sum of open_incidents metric across all project runs
  avg_latency              – mean response_time_ms across latest connector results
  max_latency              – peak response_time_ms across latest connector results
  avg_availability         – average availability metric from health run metrics
  sla_breach_count         – sum of sla_breaches metric across all project runs
  total_alerts             – sum of all critical/warning threshold breaches
  project_count            – total projects currently assigned to the team
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.aggregates import TeamAggregateMetric
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunMetric,
    HealthRunStatus,
    RunHealthStatus,
)
from app.models.team import Team, TeamProject

logger = logging.getLogger("healthmesh.aggregation.team")

_HEALTHY_THRESHOLD = 80.0
_WARNING_THRESHOLD = 50.0
_CRITICAL_STATUSES = {RunHealthStatus.DOWN.value, RunHealthStatus.ERROR.value}
_WINDOW_HOURS = 24


class TeamAggregationService:

    async def recompute_team(self, db: AsyncSession, team_id: str) -> Dict[str, Any]:
        """Recompute all aggregate metrics for a single team and persist them."""
        logger.info(f"[team-agg] recomputing team={team_id}")

        project_ids = await self._get_team_project_ids(db, team_id)
        metrics = await self._compute_metrics(db, team_id, project_ids)
        await self._upsert_metrics(db, team_id, metrics)

        logger.info(f"[team-agg] team={team_id} done: {len(metrics)} metrics persisted")
        return metrics

    async def recompute_all_teams(self, db: AsyncSession) -> Dict[str, Dict[str, Any]]:
        """Recompute aggregate metrics for every active team."""
        result = await db.execute(select(Team).where(Team.is_active == True))
        teams = result.scalars().all()

        results: Dict[str, Dict[str, Any]] = {}
        for team in teams:
            try:
                results[team.id] = await self.recompute_team(db, team.id)
            except Exception as exc:
                logger.error(f"[team-agg] failed for team={team.id}: {exc}")
        return results

    async def get_team_metrics(
        self, db: AsyncSession, team_id: str
    ) -> Dict[str, Any]:
        """Return the last-persisted aggregate metrics for a team."""
        result = await db.execute(
            select(TeamAggregateMetric).where(TeamAggregateMetric.team_id == team_id)
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

    async def get_all_teams_metrics(self, db: AsyncSession) -> List[Dict[str, Any]]:
        """Return the last-persisted aggregate metrics for all teams, shaped for dashboards."""
        result = await db.execute(select(Team).where(Team.is_active == True))
        teams = result.scalars().all()

        output = []
        for team in teams:
            metrics = await self.get_team_metrics(db, team.id)
            output.append({
                "team_id": team.id,
                "team_name": team.name,
                "team_slug": team.slug,
                "lob_id": team.lob_id,
                "metrics": {k: v["value"] for k, v in metrics.items()},
                "last_computed_at": max(
                    (v["last_computed_at"] for v in metrics.values() if v["last_computed_at"]),
                    default=None,
                ),
            })
        return output

    async def _get_team_project_ids(self, db: AsyncSession, team_id: str) -> List[str]:
        result = await db.execute(
            select(TeamProject.project_id).where(TeamProject.team_id == team_id)
        )
        return [row[0] for row in result.all()]

    async def _compute_metrics(
        self, db: AsyncSession, team_id: str, project_ids: List[str]
    ) -> Dict[str, float]:
        project_count = len(project_ids)

        if not project_ids:
            return self._zero_metrics(project_count)

        latest_runs = await self._get_latest_runs(db, project_ids)

        if not latest_runs:
            return self._zero_metrics(project_count)

        run_ids = [r.id for r in latest_runs]
        scores = [r.overall_score or 0.0 for r in latest_runs]
        statuses = [r.overall_health_status.value if r.overall_health_status else "unknown" for r in latest_runs]

        avg_health = sum(scores) / len(scores) if scores else 0.0
        healthy = sum(1 for s in scores if s >= _HEALTHY_THRESHOLD)
        warning = sum(1 for s in scores if _WARNING_THRESHOLD <= s < _HEALTHY_THRESHOLD)
        critical = sum(
            1 for i, s in enumerate(scores)
            if s < _WARNING_THRESHOLD or statuses[i] in _CRITICAL_STATUSES
        )

        connector_results = await self._get_connector_results(db, run_ids)
        latencies = [
            cr.response_time_ms for cr in connector_results
            if cr.response_time_ms is not None
        ]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0.0
        max_latency = max(latencies) if latencies else 0.0

        open_incidents = await self._sum_metric(db, run_ids, "open_incidents")
        sla_breaches = await self._sum_metric(db, run_ids, "sla_breaches")
        availability = await self._avg_metric(db, run_ids, "availability")
        total_alerts = await self._sum_threshold_breaches(db, run_ids)

        return {
            "avg_project_health": round(avg_health, 2),
            "healthy_projects_count": float(healthy),
            "warning_projects_count": float(warning),
            "critical_projects_count": float(critical),
            "total_open_incidents": float(open_incidents),
            "avg_latency": round(avg_latency, 2),
            "max_latency": round(max_latency, 2),
            "avg_availability": round(availability, 2),
            "sla_breach_count": float(sla_breaches),
            "total_alerts": float(total_alerts),
            "project_count": float(project_count),
        }

    async def _get_latest_runs(
        self, db: AsyncSession, project_ids: List[str]
    ) -> List[HealthRun]:
        """Get the most recent completed health run per project."""
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

    async def _get_connector_results(
        self, db: AsyncSession, run_ids: List[str]
    ) -> List[HealthRunConnectorResult]:
        if not run_ids:
            return []
        result = await db.execute(
            select(HealthRunConnectorResult).where(
                HealthRunConnectorResult.health_run_id.in_(run_ids)
            )
        )
        return result.scalars().all()

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

    async def _sum_threshold_breaches(
        self, db: AsyncSession, run_ids: List[str]
    ) -> int:
        """Count connector results in critical/down/error state as 'alerts'."""
        if not run_ids:
            return 0
        result = await db.execute(
            select(func.count(HealthRunConnectorResult.id)).where(
                and_(
                    HealthRunConnectorResult.health_run_id.in_(run_ids),
                    HealthRunConnectorResult.health_status.in_(
                        [RunHealthStatus.DOWN.value, RunHealthStatus.ERROR.value, RunHealthStatus.DEGRADED.value]
                    ),
                )
            )
        )
        val = result.scalar_one_or_none()
        return int(val) if val else 0

    def _zero_metrics(self, project_count: int) -> Dict[str, float]:
        return {
            "avg_project_health": 0.0,
            "healthy_projects_count": 0.0,
            "warning_projects_count": 0.0,
            "critical_projects_count": 0.0,
            "total_open_incidents": 0.0,
            "avg_latency": 0.0,
            "max_latency": 0.0,
            "avg_availability": 0.0,
            "sla_breach_count": 0.0,
            "total_alerts": 0.0,
            "project_count": float(project_count),
        }

    async def _upsert_metrics(
        self, db: AsyncSession, team_id: str, metrics: Dict[str, float]
    ) -> None:
        now = datetime.utcnow()
        for metric_key, value in metrics.items():
            result = await db.execute(
                select(TeamAggregateMetric).where(
                    and_(
                        TeamAggregateMetric.team_id == team_id,
                        TeamAggregateMetric.metric_key == metric_key,
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
                    TeamAggregateMetric(
                        id=str(uuid.uuid4()),
                        team_id=team_id,
                        metric_key=metric_key,
                        numeric_value=value,
                        compute_window_hours=_WINDOW_HOURS,
                        last_computed_at=now,
                    )
                )
        await db.flush()


team_aggregation_service = TeamAggregationService()
