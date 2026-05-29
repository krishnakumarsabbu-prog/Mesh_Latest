"""
Project Health Dashboard Aggregation Service.

Provides analytics-grade summaries, trend data, and connector metrics
for per-project health observability dashboards.

Supports time-range filters: 24h, 7d, 30d, and custom ranges.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.connector_execution_log import ConnectorAgentStatus
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunMetric,
    HealthRunStatus,
    RunHealthStatus,
)
from app.models.project import Project
from app.models.project_connector import ProjectConnector

logger = logging.getLogger("healthmesh.dashboard")

TIME_RANGES: Dict[str, int] = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
}


def _hours_from_range(time_range: str, custom_hours: Optional[int] = None) -> int:
    if time_range == "custom" and custom_hours:
        return max(1, min(custom_hours, 24 * 90))
    return TIME_RANGES.get(time_range, 24)


class ProjectDashboardService:

    async def get_project_summary(
        self,
        db: AsyncSession,
        project_id: str,
    ) -> Dict[str, Any]:
        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return {}

        latest_run = await self._get_latest_run(db, project_id)

        connector_result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.project_id == project_id)
        )
        all_connectors = connector_result.scalars().all()
        total_connectors = len(all_connectors)
        enabled_connectors = sum(1 for c in all_connectors if c.is_enabled)

        agent_status_result = await db.execute(
            select(ConnectorAgentStatus).where(
                ConnectorAgentStatus.project_connector_id.in_([c.id for c in all_connectors])
            )
        )
        agent_statuses = agent_status_result.scalars().all()
        status_map = {s.project_connector_id: s for s in agent_statuses}

        healthy_count = sum(
            1 for s in agent_statuses if s.health_status and s.health_status.value == "healthy"
        )
        degraded_count = sum(
            1 for s in agent_statuses if s.health_status and s.health_status.value == "degraded"
        )
        down_count = sum(
            1 for s in agent_statuses if s.health_status and s.health_status.value in ("down", "error", "timeout")
        )
        unknown_count = total_connectors - healthy_count - degraded_count - down_count

        availability_pct = 0.0
        if agent_statuses:
            total_uptime = sum((s.uptime_percentage or 0) for s in agent_statuses)
            availability_pct = round(total_uptime / len(agent_statuses), 2)

        sla_pct = 100.0
        incident_count = sum((s.total_failures or 0) for s in agent_statuses)

        if total_connectors > 0:
            failure_ratio = down_count / total_connectors
            sla_pct = round(max(0, (1 - failure_ratio) * 100), 2)

        overall_score = None
        overall_health_status = None
        last_run_at = None
        last_run_status = None
        last_run_id = None

        if latest_run:
            overall_score = latest_run.overall_score
            overall_health_status = (
                latest_run.overall_health_status.value
                if latest_run.overall_health_status
                else None
            )
            last_run_at = latest_run.completed_at or latest_run.started_at
            last_run_status = latest_run.status.value if latest_run.status else None
            last_run_id = latest_run.id

        connector_summaries = []
        for pc in all_connectors:
            agent_st = status_map.get(pc.id)
            entry = pc.catalog_entry if hasattr(pc, "catalog_entry") else None
            connector_summaries.append({
                "id": pc.id,
                "name": pc.name,
                "slug": entry.slug if entry else None,
                "category": entry.category.value if entry and hasattr(entry.category, "value") else None,
                "icon": entry.icon if entry else None,
                "color": entry.color if entry else None,
                "is_enabled": pc.is_enabled,
                "priority": pc.priority,
                "status": pc.status.value if pc.status else None,
                "health_status": agent_st.health_status.value if agent_st and agent_st.health_status else "unknown",
                "last_sync_at": agent_st.last_sync_at.isoformat() if agent_st and agent_st.last_sync_at else None,
                "last_sync_response_ms": agent_st.last_sync_response_ms if agent_st else None,
                "uptime_percentage": agent_st.uptime_percentage if agent_st else None,
                "consecutive_failures": agent_st.consecutive_failures if agent_st else 0,
                "total_executions": agent_st.total_executions if agent_st else 0,
                "total_failures": agent_st.total_failures if agent_st else 0,
                "last_error": agent_st.last_error if agent_st else None,
            })

        return {
            "project_id": project_id,
            "project_name": project.name,
            "project_color": project.color,
            "overall_score": overall_score,
            "overall_health_status": overall_health_status,
            "last_run_at": last_run_at.isoformat() if last_run_at else None,
            "last_run_status": last_run_status,
            "last_run_id": last_run_id,
            "availability_percentage": availability_pct,
            "sla_percentage": sla_pct,
            "incident_count": incident_count,
            "total_connectors": total_connectors,
            "enabled_connectors": enabled_connectors,
            "healthy_connectors": healthy_count,
            "degraded_connectors": degraded_count,
            "down_connectors": down_count,
            "unknown_connectors": unknown_count,
            "connectors": connector_summaries,
        }

    async def get_project_trends(
        self,
        db: AsyncSession,
        project_id: str,
        time_range: str = "24h",
        custom_hours: Optional[int] = None,
    ) -> Dict[str, Any]:
        hours = _hours_from_range(time_range, custom_hours)
        since = datetime.utcnow() - timedelta(hours=hours)

        runs_result = await db.execute(
            select(HealthRun)
            .options(selectinload(HealthRun.connector_results))
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
                HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
            )
            .order_by(HealthRun.started_at)
        )
        runs = runs_result.scalars().all()

        overall_trend: List[Dict[str, Any]] = []
        connector_trends: Dict[str, List[Dict[str, Any]]] = {}
        availability_trend: List[Dict[str, Any]] = []
        incident_trend: List[Dict[str, Any]] = []

        for run in runs:
            ts = run.completed_at or run.started_at
            ts_str = ts.isoformat() if ts else None

            overall_trend.append({
                "timestamp": ts_str,
                "score": run.overall_score,
                "status": run.overall_health_status.value if run.overall_health_status else None,
                "success_count": run.success_count,
                "failure_count": run.failure_count,
                "duration_ms": run.total_duration_ms,
            })

            total_c = run.connector_count or 0
            healthy_c = run.success_count or 0
            avail = round((healthy_c / total_c) * 100, 2) if total_c > 0 else 100.0
            availability_trend.append({
                "timestamp": ts_str,
                "availability": avail,
            })

            incident_trend.append({
                "timestamp": ts_str,
                "incidents": run.failure_count or 0,
            })

            for cr in (run.connector_results or []):
                cname = cr.connector_name
                if cname not in connector_trends:
                    connector_trends[cname] = []
                connector_trends[cname].append({
                    "timestamp": ts_str,
                    "score": cr.health_score,
                    "status": cr.health_status.value if cr.health_status else None,
                    "response_time_ms": cr.response_time_ms,
                    "outcome": cr.outcome.value if cr.outcome else None,
                })

        return {
            "time_range": time_range,
            "hours": hours,
            "since": since.isoformat(),
            "overall_trend": overall_trend,
            "availability_trend": availability_trend,
            "incident_trend": incident_trend,
            "connector_trends": connector_trends,
        }

    async def get_project_metrics(
        self,
        db: AsyncSession,
        project_id: str,
        time_range: str = "24h",
        custom_hours: Optional[int] = None,
    ) -> Dict[str, Any]:
        hours = _hours_from_range(time_range, custom_hours)
        since = datetime.utcnow() - timedelta(hours=hours)

        runs_result = await db.execute(
            select(HealthRun.id)
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
            )
        )
        run_ids = [r[0] for r in runs_result.all()]

        if not run_ids:
            return {
                "time_range": time_range,
                "hours": hours,
                "metrics": [],
                "connector_response_times": [],
                "run_durations": [],
                "score_distribution": {},
            }

        metrics_result = await db.execute(
            select(HealthRunMetric).where(
                HealthRunMetric.health_run_id.in_(run_ids)
            ).order_by(HealthRunMetric.captured_at)
        )
        metrics = metrics_result.scalars().all()

        grouped_metrics: Dict[str, List[Dict[str, Any]]] = {}
        for m in metrics:
            key = f"{m.connector_name or 'unknown'}::{m.metric_name}"
            if key not in grouped_metrics:
                grouped_metrics[key] = []
            grouped_metrics[key].append({
                "timestamp": m.captured_at.isoformat() if m.captured_at else None,
                "value": m.metric_value,
                "unit": m.metric_unit,
                "connector": m.connector_name,
                "metric": m.metric_name,
                "description": m.metric_description,
            })

        metrics_series = [
            {
                "key": k,
                "connector": v[0]["connector"] if v else None,
                "metric_name": v[0]["metric"] if v else None,
                "unit": v[0]["unit"] if v else None,
                "description": v[0]["description"] if v else None,
                "data_points": v,
                "latest_value": v[-1]["value"] if v else None,
                "avg_value": round(sum(p["value"] for p in v) / len(v), 4) if v else None,
                "min_value": min(p["value"] for p in v) if v else None,
                "max_value": max(p["value"] for p in v) if v else None,
            }
            for k, v in grouped_metrics.items()
        ]

        cr_result = await db.execute(
            select(HealthRunConnectorResult).where(
                HealthRunConnectorResult.health_run_id.in_(run_ids)
            )
        )
        connector_results = cr_result.scalars().all()

        rt_by_connector: Dict[str, List[int]] = {}
        for cr in connector_results:
            if cr.response_time_ms is not None:
                if cr.connector_name not in rt_by_connector:
                    rt_by_connector[cr.connector_name] = []
                rt_by_connector[cr.connector_name].append(cr.response_time_ms)

        connector_response_times = [
            {
                "connector": name,
                "avg_ms": round(sum(vals) / len(vals), 1),
                "min_ms": min(vals),
                "max_ms": max(vals),
                "samples": len(vals),
            }
            for name, vals in rt_by_connector.items()
            if vals
        ]

        runs_dur_result = await db.execute(
            select(HealthRun).where(
                HealthRun.id.in_(run_ids),
                HealthRun.total_duration_ms.isnot(None),
            ).order_by(HealthRun.started_at)
        )
        duration_runs = runs_dur_result.scalars().all()
        run_durations = [
            {
                "timestamp": (r.completed_at or r.started_at).isoformat() if (r.completed_at or r.started_at) else None,
                "duration_ms": r.total_duration_ms,
                "score": r.overall_score,
                "status": r.overall_health_status.value if r.overall_health_status else None,
            }
            for r in duration_runs
        ]

        score_buckets = {"excellent": 0, "good": 0, "fair": 0, "poor": 0}
        for r in duration_runs:
            s = r.overall_score or 0
            if s >= 90:
                score_buckets["excellent"] += 1
            elif s >= 70:
                score_buckets["good"] += 1
            elif s >= 50:
                score_buckets["fair"] += 1
            else:
                score_buckets["poor"] += 1

        return {
            "time_range": time_range,
            "hours": hours,
            "metrics": metrics_series,
            "connector_response_times": connector_response_times,
            "run_durations": run_durations,
            "score_distribution": score_buckets,
            "total_runs": len(run_ids),
        }

    async def get_connector_drilldown(
        self,
        db: AsyncSession,
        project_id: str,
        connector_id: str,
        time_range: str = "24h",
        custom_hours: Optional[int] = None,
    ) -> Dict[str, Any]:
        hours = _hours_from_range(time_range, custom_hours)
        since = datetime.utcnow() - timedelta(hours=hours)

        pc_result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(
                ProjectConnector.id == connector_id,
                ProjectConnector.project_id == project_id,
            )
        )
        pc = pc_result.scalar_one_or_none()
        if not pc:
            return {}

        agent_st_result = await db.execute(
            select(ConnectorAgentStatus).where(
                ConnectorAgentStatus.project_connector_id == connector_id
            )
        )
        agent_st = agent_st_result.scalar_one_or_none()

        runs_result = await db.execute(
            select(HealthRun.id, HealthRun.started_at)
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
            )
        )
        run_rows = runs_result.all()
        run_ids = [r[0] for r in run_rows]

        cr_result = await db.execute(
            select(HealthRunConnectorResult)
            .where(
                HealthRunConnectorResult.project_connector_id == connector_id,
                HealthRunConnectorResult.health_run_id.in_(run_ids),
            )
            .order_by(HealthRunConnectorResult.started_at)
        )
        connector_runs = cr_result.scalars().all()

        run_history = []
        for cr in connector_runs:
            run_history.append({
                "run_id": cr.health_run_id,
                "outcome": cr.outcome.value if cr.outcome else None,
                "health_status": cr.health_status.value if cr.health_status else None,
                "health_score": cr.health_score,
                "response_time_ms": cr.response_time_ms,
                "error_message": cr.error_message,
                "message": cr.message,
                "duration_ms": cr.duration_ms,
                "started_at": cr.started_at.isoformat() if cr.started_at else None,
                "completed_at": cr.completed_at.isoformat() if cr.completed_at else None,
                "metrics": self._parse_metrics_snapshot(cr.metrics_snapshot),
            })

        metrics_result = await db.execute(
            select(HealthRunMetric).where(
                HealthRunMetric.project_connector_id == connector_id,
                HealthRunMetric.health_run_id.in_(run_ids),
            ).order_by(HealthRunMetric.captured_at)
        )
        metrics = metrics_result.scalars().all()
        metrics_by_name: Dict[str, List[Dict[str, Any]]] = {}
        for m in metrics:
            if m.metric_name not in metrics_by_name:
                metrics_by_name[m.metric_name] = []
            metrics_by_name[m.metric_name].append({
                "timestamp": m.captured_at.isoformat() if m.captured_at else None,
                "value": m.metric_value,
                "unit": m.metric_unit,
            })

        recent_errors = [
            {
                "timestamp": cr.started_at.isoformat() if cr.started_at else None,
                "error": cr.error_message,
                "outcome": cr.outcome.value if cr.outcome else None,
            }
            for cr in connector_runs
            if cr.error_message
        ][-10:]

        catalog = pc.catalog_entry
        return {
            "connector_id": connector_id,
            "connector_name": pc.name,
            "connector_slug": catalog.slug if catalog else None,
            "connector_category": catalog.category.value if catalog and hasattr(catalog.category, "value") else None,
            "connector_icon": catalog.icon if catalog else None,
            "connector_color": catalog.color if catalog else None,
            "is_enabled": pc.is_enabled,
            "priority": pc.priority,
            "status": pc.status.value if pc.status else None,
            "current_health_status": agent_st.health_status.value if agent_st and agent_st.health_status else "unknown",
            "last_sync_at": agent_st.last_sync_at.isoformat() if agent_st and agent_st.last_sync_at else None,
            "last_sync_response_ms": agent_st.last_sync_response_ms if agent_st else None,
            "uptime_percentage": agent_st.uptime_percentage if agent_st else None,
            "consecutive_failures": agent_st.consecutive_failures if agent_st else 0,
            "total_executions": agent_st.total_executions if agent_st else 0,
            "total_failures": agent_st.total_failures if agent_st else 0,
            "last_error": agent_st.last_error if agent_st else None,
            "last_error_at": agent_st.last_error_at.isoformat() if agent_st and agent_st.last_error_at else None,
            "run_history": run_history,
            "metrics_by_name": metrics_by_name,
            "recent_errors": recent_errors,
            "time_range": time_range,
            "hours": hours,
        }

    async def _get_latest_run(
        self, db: AsyncSession, project_id: str
    ) -> Optional[HealthRun]:
        result = await db.execute(
            select(HealthRun)
            .where(HealthRun.project_id == project_id)
            .order_by(desc(HealthRun.started_at))
            .limit(1)
        )
        return result.scalar_one_or_none()

    def _parse_metrics_snapshot(self, snapshot: Optional[str]) -> List[Dict[str, Any]]:
        if not snapshot:
            return []
        try:
            return json.loads(snapshot)
        except Exception:
            return []


project_dashboard_service = ProjectDashboardService()
