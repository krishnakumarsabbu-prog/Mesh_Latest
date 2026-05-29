"""
Historical Analytics Service.

Provides enterprise-grade historical analytics, trend analysis, SLA/uptime metrics,
project comparison, connector performance history, and export support.

Backed entirely by persisted health execution history in SQLite via SQLAlchemy.
"""

from __future__ import annotations

import csv
import io
import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import and_, case, desc, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.connector_execution_log import ConnectorAgentStatus, ConnectorExecutionLog
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunMetric,
    HealthRunStatus,
    RunHealthStatus,
)
from app.models.project import Project
from app.models.project_connector import ProjectConnector

logger = logging.getLogger("healthmesh.analytics")

GRANULARITY_MAP = {
    "hourly": "hour",
    "daily": "day",
    "weekly": "week",
    "monthly": "month",
}

RANGE_HOURS: Dict[str, int] = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
    "90d": 24 * 90,
}


def _resolve_hours(time_range: str, custom_start: Optional[datetime] = None, custom_end: Optional[datetime] = None) -> Tuple[int, datetime, datetime]:
    now = datetime.utcnow()
    if time_range == "custom" and custom_start and custom_end:
        delta = custom_end - custom_start
        hours = max(1, int(delta.total_seconds() / 3600))
        return hours, custom_start, custom_end
    hours = RANGE_HOURS.get(time_range, 24)
    return hours, now - timedelta(hours=hours), now


def _bucket_label(ts: datetime, granularity: str) -> str:
    if granularity == "hourly":
        return ts.strftime("%Y-%m-%dT%H:00:00")
    elif granularity == "daily":
        return ts.strftime("%Y-%m-%d")
    elif granularity == "weekly":
        # ISO week start (Monday)
        start = ts - timedelta(days=ts.weekday())
        return start.strftime("%Y-%m-%d")
    elif granularity == "monthly":
        return ts.strftime("%Y-%m")
    return ts.strftime("%Y-%m-%dT%H:00:00")


def _infer_granularity(hours: int) -> str:
    if hours <= 48:
        return "hourly"
    elif hours <= 24 * 14:
        return "daily"
    elif hours <= 24 * 60:
        return "weekly"
    return "monthly"


class AnalyticsService:

    # -------------------------------------------------------------------------
    # Project Trend Analytics
    # -------------------------------------------------------------------------

    async def get_project_trends(
        self,
        db: AsyncSession,
        project_id: str,
        time_range: str = "7d",
        granularity: Optional[str] = None,
        custom_start: Optional[datetime] = None,
        custom_end: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        hours, since, until = _resolve_hours(time_range, custom_start, custom_end)
        if not granularity:
            granularity = _infer_granularity(hours)

        runs_result = await db.execute(
            select(HealthRun)
            .options(selectinload(HealthRun.connector_results))
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
                HealthRun.started_at <= until,
                HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
            )
            .order_by(HealthRun.started_at)
        )
        runs = runs_result.scalars().all()

        buckets: Dict[str, Dict[str, Any]] = {}
        for run in runs:
            ts = run.completed_at or run.started_at
            if not ts:
                continue
            label = _bucket_label(ts, granularity)
            if label not in buckets:
                buckets[label] = {
                    "timestamp": label,
                    "scores": [],
                    "success_counts": [],
                    "failure_counts": [],
                    "total_counts": [],
                    "statuses": [],
                }
            b = buckets[label]
            if run.overall_score is not None:
                b["scores"].append(run.overall_score)
            b["success_counts"].append(run.success_count or 0)
            b["failure_counts"].append(run.failure_count or 0)
            b["total_counts"].append(run.connector_count or 0)
            if run.overall_health_status:
                b["statuses"].append(run.overall_health_status.value)

        def _dominant_status(statuses: List[str]) -> Optional[str]:
            if not statuses:
                return None
            for s in ["down", "error", "timeout", "degraded", "healthy", "unknown"]:
                if s in statuses:
                    return s
            return statuses[-1]

        health_trend = []
        availability_trend = []
        incident_trend = []
        sla_trend = []

        for label in sorted(buckets.keys()):
            b = buckets[label]
            avg_score = round(sum(b["scores"]) / len(b["scores"]), 2) if b["scores"] else None
            total_success = sum(b["success_counts"])
            total_failures = sum(b["failure_counts"])
            total_connectors = sum(b["total_counts"])
            avail = round((total_success / total_connectors) * 100, 2) if total_connectors > 0 else None
            sla = round(max(0, (1 - total_failures / total_connectors) * 100), 2) if total_connectors > 0 else None

            health_trend.append({
                "timestamp": label,
                "score": avg_score,
                "status": _dominant_status(b["statuses"]),
                "run_count": len(b["scores"]),
            })
            availability_trend.append({
                "timestamp": label,
                "availability": avail,
            })
            incident_trend.append({
                "timestamp": label,
                "incidents": total_failures,
                "total_runs": len(b["failure_counts"]),
            })
            sla_trend.append({
                "timestamp": label,
                "sla": sla,
            })

        # Connector-specific trend
        connector_trends: Dict[str, List[Dict[str, Any]]] = {}
        for run in runs:
            ts = run.completed_at or run.started_at
            if not ts:
                continue
            label = _bucket_label(ts, granularity)
            for cr in (run.connector_results or []):
                cname = cr.connector_name
                if cname not in connector_trends:
                    connector_trends[cname] = {}
                if label not in connector_trends[cname]:
                    connector_trends[cname][label] = {"scores": [], "response_times": [], "outcomes": []}
                if cr.health_score is not None:
                    connector_trends[cname][label]["scores"].append(cr.health_score)
                if cr.response_time_ms is not None:
                    connector_trends[cname][label]["response_times"].append(cr.response_time_ms)
                if cr.outcome:
                    connector_trends[cname][label]["outcomes"].append(cr.outcome.value)

        connector_trend_series: Dict[str, List[Dict[str, Any]]] = {}
        for cname, label_map in connector_trends.items():
            series = []
            for label in sorted(label_map.keys()):
                d = label_map[label]
                avg_score = round(sum(d["scores"]) / len(d["scores"]), 2) if d["scores"] else None
                avg_rt = round(sum(d["response_times"]) / len(d["response_times"]), 1) if d["response_times"] else None
                outcomes = d["outcomes"]
                success_rate = round(outcomes.count("success") / len(outcomes) * 100, 2) if outcomes else None
                series.append({
                    "timestamp": label,
                    "score": avg_score,
                    "avg_response_time_ms": avg_rt,
                    "success_rate": success_rate,
                })
            connector_trend_series[cname] = series

        # Delta computation
        score_delta = None
        if len(health_trend) >= 2:
            first = health_trend[0]["score"]
            last = health_trend[-1]["score"]
            if first is not None and last is not None:
                score_delta = round(last - first, 2)

        return {
            "project_id": project_id,
            "time_range": time_range,
            "granularity": granularity,
            "hours": hours,
            "since": since.isoformat(),
            "until": until.isoformat(),
            "total_runs": len(runs),
            "score_delta": score_delta,
            "health_trend": health_trend,
            "availability_trend": availability_trend,
            "incident_trend": incident_trend,
            "sla_trend": sla_trend,
            "connector_trends": connector_trend_series,
        }

    # -------------------------------------------------------------------------
    # Project Comparison Analytics
    # -------------------------------------------------------------------------

    async def get_project_comparison(
        self,
        db: AsyncSession,
        project_ids: List[str],
        time_range: str = "7d",
        custom_start: Optional[datetime] = None,
        custom_end: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        hours, since, until = _resolve_hours(time_range, custom_start, custom_end)

        projects_result = await db.execute(
            select(Project).where(Project.id.in_(project_ids))
        )
        projects = {p.id: p for p in projects_result.scalars().all()}

        runs_result = await db.execute(
            select(HealthRun)
            .where(
                HealthRun.project_id.in_(project_ids),
                HealthRun.started_at >= since,
                HealthRun.started_at <= until,
                HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
            )
            .order_by(HealthRun.project_id, HealthRun.started_at)
        )
        runs = runs_result.scalars().all()

        by_project: Dict[str, List[HealthRun]] = {}
        for r in runs:
            if r.project_id not in by_project:
                by_project[r.project_id] = []
            by_project[r.project_id].append(r)

        agent_statuses_result = await db.execute(
            select(ConnectorAgentStatus)
            .join(ProjectConnector, ConnectorAgentStatus.project_connector_id == ProjectConnector.id)
            .where(ProjectConnector.project_id.in_(project_ids))
        )
        all_agent_statuses = agent_statuses_result.scalars().all()

        pc_result = await db.execute(
            select(ProjectConnector).where(ProjectConnector.project_id.in_(project_ids))
        )
        all_pcs = pc_result.scalars().all()
        pc_by_project: Dict[str, List[ProjectConnector]] = {}
        for pc in all_pcs:
            if pc.project_id not in pc_by_project:
                pc_by_project[pc.project_id] = []
            pc_by_project[pc.project_id].append(pc)

        pc_ids_by_project: Dict[str, set] = {pid: {pc.id for pc in pcs} for pid, pcs in pc_by_project.items()}
        agent_by_project: Dict[str, List[ConnectorAgentStatus]] = {}
        for status in all_agent_statuses:
            for pid, pc_ids in pc_ids_by_project.items():
                if status.project_connector_id in pc_ids:
                    if pid not in agent_by_project:
                        agent_by_project[pid] = []
                    agent_by_project[pid].append(status)

        comparison = []
        for pid in project_ids:
            proj = projects.get(pid)
            proj_runs = by_project.get(pid, [])
            agent_sts = agent_by_project.get(pid, [])

            scores = [r.overall_score for r in proj_runs if r.overall_score is not None]
            avg_score = round(sum(scores) / len(scores), 2) if scores else None

            total_success = sum(r.success_count or 0 for r in proj_runs)
            total_connectors = sum(r.connector_count or 0 for r in proj_runs)
            availability = round(total_success / total_connectors * 100, 2) if total_connectors > 0 else None

            total_failures = sum(r.failure_count or 0 for r in proj_runs)
            sla = round(max(0, (1 - total_failures / total_connectors) * 100), 2) if total_connectors > 0 else None

            uptimes = [s.uptime_percentage for s in agent_sts if s.uptime_percentage is not None]
            uptime_pct = round(sum(uptimes) / len(uptimes), 2) if uptimes else None

            incident_count = sum(r.failure_count or 0 for r in proj_runs)

            score_trend = [
                {
                    "timestamp": (r.completed_at or r.started_at).isoformat(),
                    "score": r.overall_score,
                }
                for r in proj_runs
                if (r.completed_at or r.started_at)
            ]

            comparison.append({
                "project_id": pid,
                "project_name": proj.name if proj else pid,
                "project_color": proj.color if proj else "#30D158",
                "avg_health_score": avg_score,
                "availability_pct": availability,
                "sla_pct": sla,
                "uptime_pct": uptime_pct,
                "incident_count": incident_count,
                "total_runs": len(proj_runs),
                "score_trend": score_trend,
            })

        comparison.sort(key=lambda x: (x["avg_health_score"] or 0), reverse=True)

        return {
            "time_range": time_range,
            "hours": hours,
            "since": since.isoformat(),
            "until": until.isoformat(),
            "projects": comparison,
        }

    # -------------------------------------------------------------------------
    # Connector Performance Analytics
    # -------------------------------------------------------------------------

    async def get_connector_performance_history(
        self,
        db: AsyncSession,
        project_id: str,
        time_range: str = "7d",
        granularity: Optional[str] = None,
        custom_start: Optional[datetime] = None,
        custom_end: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        hours, since, until = _resolve_hours(time_range, custom_start, custom_end)
        if not granularity:
            granularity = _infer_granularity(hours)

        runs_result = await db.execute(
            select(HealthRun.id, HealthRun.started_at, HealthRun.completed_at)
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
                HealthRun.started_at <= until,
                HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
            )
            .order_by(HealthRun.started_at)
        )
        run_rows = runs_result.all()
        run_ids = [r[0] for r in run_rows]

        if not run_ids:
            return {
                "project_id": project_id,
                "time_range": time_range,
                "granularity": granularity,
                "hours": hours,
                "since": since.isoformat(),
                "until": until.isoformat(),
                "connectors": [],
            }

        cr_result = await db.execute(
            select(HealthRunConnectorResult)
            .where(HealthRunConnectorResult.health_run_id.in_(run_ids))
            .order_by(HealthRunConnectorResult.started_at)
        )
        connector_results = cr_result.scalars().all()

        run_ts_map = {r[0]: r[2] or r[1] for r in run_rows}

        by_connector: Dict[str, List[HealthRunConnectorResult]] = {}
        for cr in connector_results:
            cname = cr.connector_name
            if cname not in by_connector:
                by_connector[cname] = []
            by_connector[cname].append(cr)

        connector_metrics = []
        for cname, results in by_connector.items():
            total = len(results)
            successes = sum(1 for r in results if r.outcome and r.outcome.value == "success")
            failures = total - successes
            success_rate = round(successes / total * 100, 2) if total > 0 else 0

            response_times = [r.response_time_ms for r in results if r.response_time_ms is not None]
            avg_rt = round(sum(response_times) / len(response_times), 1) if response_times else None
            min_rt = min(response_times) if response_times else None
            max_rt = max(response_times) if response_times else None
            p95_rt = None
            if response_times:
                sorted_rt = sorted(response_times)
                idx = int(len(sorted_rt) * 0.95)
                p95_rt = sorted_rt[min(idx, len(sorted_rt) - 1)]

            scores = [r.health_score for r in results if r.health_score is not None]
            avg_score = round(sum(scores) / len(scores), 2) if scores else None

            # Error analysis
            error_counts: Dict[str, int] = {}
            for r in results:
                if r.error_message:
                    key = r.error_message[:80]
                    error_counts[key] = error_counts.get(key, 0) + 1
            top_errors = sorted(error_counts.items(), key=lambda x: -x[1])[:5]

            # Time-bucketed trend
            bucket_data: Dict[str, Dict[str, Any]] = {}
            for cr in results:
                ts = cr.started_at or run_ts_map.get(cr.health_run_id)
                if not ts:
                    continue
                label = _bucket_label(ts, granularity)
                if label not in bucket_data:
                    bucket_data[label] = {"response_times": [], "outcomes": [], "scores": []}
                if cr.response_time_ms is not None:
                    bucket_data[label]["response_times"].append(cr.response_time_ms)
                if cr.outcome:
                    bucket_data[label]["outcomes"].append(cr.outcome.value)
                if cr.health_score is not None:
                    bucket_data[label]["scores"].append(cr.health_score)

            trend = []
            for label in sorted(bucket_data.keys()):
                bd = bucket_data[label]
                outs = bd["outcomes"]
                suc = outs.count("success")
                sr = round(suc / len(outs) * 100, 2) if outs else None
                avg_r = round(sum(bd["response_times"]) / len(bd["response_times"]), 1) if bd["response_times"] else None
                avg_s = round(sum(bd["scores"]) / len(bd["scores"]), 2) if bd["scores"] else None
                trend.append({
                    "timestamp": label,
                    "success_rate": sr,
                    "avg_response_time_ms": avg_r,
                    "avg_score": avg_s,
                    "total": len(outs),
                })

            pc_id = results[0].project_connector_id if results else None
            connector_metrics.append({
                "connector_id": pc_id,
                "connector_name": cname,
                "connector_slug": results[0].connector_slug if results else None,
                "connector_category": results[0].connector_category if results else None,
                "total_executions": total,
                "success_count": successes,
                "failure_count": failures,
                "success_rate": success_rate,
                "avg_response_time_ms": avg_rt,
                "min_response_time_ms": min_rt,
                "max_response_time_ms": max_rt,
                "p95_response_time_ms": p95_rt,
                "avg_health_score": avg_score,
                "top_errors": [{"message": e[0], "count": e[1]} for e in top_errors],
                "trend": trend,
            })

        connector_metrics.sort(key=lambda x: x["success_rate"], reverse=True)

        return {
            "project_id": project_id,
            "time_range": time_range,
            "granularity": granularity,
            "hours": hours,
            "since": since.isoformat(),
            "until": until.isoformat(),
            "connectors": connector_metrics,
        }

    # -------------------------------------------------------------------------
    # SLA / Uptime Engine
    # -------------------------------------------------------------------------

    async def get_sla_metrics(
        self,
        db: AsyncSession,
        project_id: str,
        time_range: str = "30d",
        sla_threshold: float = 99.0,
        custom_start: Optional[datetime] = None,
        custom_end: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        hours, since, until = _resolve_hours(time_range, custom_start, custom_end)

        runs_result = await db.execute(
            select(HealthRun)
            .options(selectinload(HealthRun.connector_results))
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
                HealthRun.started_at <= until,
                HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
            )
            .order_by(HealthRun.started_at)
        )
        runs = runs_result.scalars().all()

        if not runs:
            return {
                "project_id": project_id,
                "time_range": time_range,
                "hours": hours,
                "since": since.isoformat(),
                "until": until.isoformat(),
                "sla_threshold": sla_threshold,
                "uptime_pct": None,
                "sla_pct": None,
                "breach_count": 0,
                "downtime_periods": [],
                "mttr_minutes": None,
                "mtbf_minutes": None,
                "total_runs": 0,
                "connector_sla": [],
                "sla_trend": [],
            }

        total_runs = len(runs)
        total_connectors_sum = sum(r.connector_count or 0 for r in runs)
        total_success_sum = sum(r.success_count or 0 for r in runs)
        total_failure_sum = sum(r.failure_count or 0 for r in runs)

        uptime_pct = round(total_success_sum / total_connectors_sum * 100, 4) if total_connectors_sum > 0 else None
        sla_pct = round(max(0, (1 - total_failure_sum / total_connectors_sum) * 100), 4) if total_connectors_sum > 0 else None

        # Breach detection: run-level SLA breach
        breach_count = 0
        downtime_periods = []
        for run in runs:
            total_c = run.connector_count or 0
            failures = run.failure_count or 0
            run_sla = (1 - failures / total_c) * 100 if total_c > 0 else 100
            if run_sla < sla_threshold:
                breach_count += 1
                ts = (run.completed_at or run.started_at)
                downtime_periods.append({
                    "timestamp": ts.isoformat() if ts else None,
                    "run_id": run.id,
                    "sla_pct": round(run_sla, 2),
                    "failure_count": failures,
                    "duration_ms": run.total_duration_ms,
                })

        # MTTR / MTBF estimation from failure sequences
        failure_timestamps = [
            r.started_at for r in runs if (r.failure_count or 0) > 0 and r.started_at
        ]
        recovery_timestamps = [
            r.started_at for r in runs if (r.failure_count or 0) == 0 and r.started_at
        ]

        mttr_minutes = None
        mtbf_minutes = None

        if len(failure_timestamps) >= 2:
            failure_gaps = [
                (failure_timestamps[i + 1] - failure_timestamps[i]).total_seconds() / 60
                for i in range(len(failure_timestamps) - 1)
            ]
            if failure_gaps:
                mttr_minutes = round(sum(failure_gaps) / len(failure_gaps), 1)

        if len(recovery_timestamps) >= 2:
            recovery_gaps = [
                (recovery_timestamps[i + 1] - recovery_timestamps[i]).total_seconds() / 60
                for i in range(len(recovery_timestamps) - 1)
            ]
            if recovery_gaps:
                mtbf_minutes = round(sum(recovery_gaps) / len(recovery_gaps), 1)

        # Per-connector SLA
        all_connector_results = [cr for run in runs for cr in (run.connector_results or [])]
        by_connector: Dict[str, List] = {}
        for cr in all_connector_results:
            if cr.connector_name not in by_connector:
                by_connector[cr.connector_name] = []
            by_connector[cr.connector_name].append(cr)

        connector_sla = []
        for cname, results in by_connector.items():
            total = len(results)
            successes = sum(1 for r in results if r.outcome and r.outcome.value == "success")
            c_uptime = round(successes / total * 100, 4) if total > 0 else None
            c_sla = c_uptime
            c_breach = 1 if c_uptime is not None and c_uptime < sla_threshold else 0
            connector_sla.append({
                "connector_name": cname,
                "connector_id": results[0].project_connector_id if results else None,
                "uptime_pct": c_uptime,
                "sla_pct": c_sla,
                "breach": c_breach,
                "total_executions": total,
                "success_count": successes,
                "failure_count": total - successes,
            })

        connector_sla.sort(key=lambda x: (x["uptime_pct"] or 0))

        # Weekly SLA trend
        sla_by_week: Dict[str, Dict[str, int]] = {}
        for run in runs:
            ts = run.completed_at or run.started_at
            if not ts:
                continue
            label = _bucket_label(ts, "daily")
            if label not in sla_by_week:
                sla_by_week[label] = {"success": 0, "total": 0}
            sla_by_week[label]["total"] += run.connector_count or 0
            sla_by_week[label]["success"] += run.success_count or 0

        sla_trend = [
            {
                "timestamp": label,
                "sla_pct": round(d["success"] / d["total"] * 100, 2) if d["total"] > 0 else None,
            }
            for label, d in sorted(sla_by_week.items())
        ]

        return {
            "project_id": project_id,
            "time_range": time_range,
            "hours": hours,
            "since": since.isoformat(),
            "until": until.isoformat(),
            "sla_threshold": sla_threshold,
            "uptime_pct": uptime_pct,
            "sla_pct": sla_pct,
            "breach_count": breach_count,
            "downtime_periods": downtime_periods[-20:],
            "mttr_minutes": mttr_minutes,
            "mtbf_minutes": mtbf_minutes,
            "total_runs": total_runs,
            "connector_sla": connector_sla,
            "sla_trend": sla_trend,
        }

    # -------------------------------------------------------------------------
    # Export / Report
    # -------------------------------------------------------------------------

    async def export_project_analytics(
        self,
        db: AsyncSession,
        project_id: str,
        export_format: str = "json",
        time_range: str = "30d",
        custom_start: Optional[datetime] = None,
        custom_end: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        hours, since, until = _resolve_hours(time_range, custom_start, custom_end)

        project_result = await db.execute(
            select(Project).where(Project.id == project_id)
        )
        project = project_result.scalar_one_or_none()

        runs_result = await db.execute(
            select(HealthRun)
            .options(selectinload(HealthRun.connector_results))
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
                HealthRun.started_at <= until,
            )
            .order_by(HealthRun.started_at)
        )
        runs = runs_result.scalars().all()

        rows = []
        for run in runs:
            for cr in (run.connector_results or []):
                rows.append({
                    "run_id": run.id,
                    "execution_id": run.execution_id,
                    "project_id": project_id,
                    "project_name": project.name if project else "",
                    "started_at": run.started_at.isoformat() if run.started_at else "",
                    "completed_at": run.completed_at.isoformat() if run.completed_at else "",
                    "overall_score": run.overall_score,
                    "overall_health_status": run.overall_health_status.value if run.overall_health_status else "",
                    "run_status": run.status.value if run.status else "",
                    "connector_name": cr.connector_name,
                    "connector_slug": cr.connector_slug or "",
                    "connector_category": cr.connector_category or "",
                    "connector_outcome": cr.outcome.value if cr.outcome else "",
                    "connector_health_status": cr.health_status.value if cr.health_status else "",
                    "connector_health_score": cr.health_score,
                    "connector_response_time_ms": cr.response_time_ms,
                    "connector_error_message": cr.error_message or "",
                    "connector_weight": cr.weight,
                    "connector_priority": cr.priority,
                })

        if export_format == "csv":
            output = io.StringIO()
            if rows:
                writer = csv.DictWriter(output, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)
            csv_content = output.getvalue()
            return {
                "format": "csv",
                "content": csv_content,
                "row_count": len(rows),
                "filename": f"analytics_{project_id}_{time_range}.csv",
            }
        else:
            summary = {
                "project_id": project_id,
                "project_name": project.name if project else "",
                "time_range": time_range,
                "since": since.isoformat(),
                "until": until.isoformat(),
                "total_runs": len(runs),
                "total_connector_executions": len(rows),
                "generated_at": datetime.utcnow().isoformat(),
            }
            return {
                "format": "json",
                "summary": summary,
                "data": rows,
                "row_count": len(rows),
                "filename": f"analytics_{project_id}_{time_range}.json",
            }

    # -------------------------------------------------------------------------
    # All-Projects Comparison (for global analytics view)
    # -------------------------------------------------------------------------

    async def get_all_projects_comparison(
        self,
        db: AsyncSession,
        lob_id: Optional[str] = None,
        time_range: str = "7d",
        custom_start: Optional[datetime] = None,
        custom_end: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        hours, since, until = _resolve_hours(time_range, custom_start, custom_end)

        project_query = select(Project)
        if lob_id:
            project_query = project_query.where(Project.lob_id == lob_id)
        project_result = await db.execute(project_query)
        all_projects = project_result.scalars().all()
        project_ids = [p.id for p in all_projects]

        if not project_ids:
            return {
                "time_range": time_range,
                "hours": hours,
                "projects": [],
            }

        return await self.get_project_comparison(
            db, project_ids, time_range, custom_start, custom_end
        )


analytics_service = AnalyticsService()
