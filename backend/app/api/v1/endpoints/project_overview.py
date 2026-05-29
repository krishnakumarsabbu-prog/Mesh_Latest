"""
Project Overview API endpoints.

Provides aggregated overview data combining summary stats, connector health,
active alerts (derived from rule violations and connector failures), and
key performance metrics — all in a single pass for the Overview tab.

Routes:
  GET /projects/{project_id}/overview          — full overview payload
  GET /projects/{project_id}/alerts            — derived alert list
  GET /projects/{project_id}/kpi-metrics       — KPI metric cards
  GET /projects/{project_id}/activity-summary  — weekly run activity
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.audit import AuditLog
from app.models.connector_execution_log import ConnectorAgentStatus, AgentHealthStatus
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunStatus,
    RunHealthStatus,
)
from app.models.health_rule import HealthRule, HealthRuleAssignment, RuleStatus, RuleSeverity
from app.models.project import Project
from app.models.project_connector import ProjectConnector
from app.models.user import User

logger = logging.getLogger("healthmesh.project_overview")

router = APIRouter(prefix="/projects", tags=["project-overview"])


# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────

def _format_relative(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    now = datetime.utcnow()
    diff = now - dt
    secs = int(diff.total_seconds())
    if secs < 60:
        return f"{secs}s ago"
    if secs < 3600:
        return f"{secs // 60}m ago"
    if secs < 86400:
        return f"{secs // 3600}h ago"
    return f"{secs // 86400}d ago"


# ─────────────────────────────────────────────────────────────────────────────
# /projects/{project_id}/alerts
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/alerts",
    response_model=dict,
    summary="Get active and recent alerts derived from health run failures and rule violations",
)
async def get_project_alerts(
    project_id: str,
    limit: int = Query(50, ge=1, le=200),
    include_resolved: bool = Query(True),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Derives alerts from:
    1. Connector agent statuses that are degraded / down / error
    2. Latest health run connector results that failed
    3. Active health rules with assignments for this project
    """

    # --- fetch project connectors + agent statuses ---
    pc_result = await db.execute(
        select(ProjectConnector)
        .options(selectinload(ProjectConnector.catalog_entry))
        .where(ProjectConnector.project_id == project_id)
    )
    project_connectors = pc_result.scalars().all()
    pc_map = {pc.id: pc for pc in project_connectors}

    agent_status_result = await db.execute(
        select(ConnectorAgentStatus).where(
            ConnectorAgentStatus.project_connector_id.in_(list(pc_map.keys()))
        )
    )
    agent_statuses = agent_status_result.scalars().all()

    # --- fetch latest health run connector results ---
    latest_run_result = await db.execute(
        select(HealthRun)
        .options(selectinload(HealthRun.connector_results))
        .where(HealthRun.project_id == project_id)
        .order_by(desc(HealthRun.started_at))
        .limit(1)
    )
    latest_run = latest_run_result.scalar_one_or_none()

    # --- fetch health rules for this project ---
    rule_assignment_result = await db.execute(
        select(HealthRuleAssignment)
        .options(selectinload(HealthRuleAssignment.rule))
        .where(
            HealthRuleAssignment.project_id == project_id,
            HealthRuleAssignment.is_active == True,
        )
    )
    rule_assignments = rule_assignment_result.scalars().all()

    # Also fetch global active rules
    global_rules_result = await db.execute(
        select(HealthRule).where(
            HealthRule.status == RuleStatus.ACTIVE,
            HealthRule.scope == "global",
        )
    )
    global_rules = global_rules_result.scalars().all()

    alerts: List[Dict[str, Any]] = []
    alert_id_counter = 0

    # Build alerts from agent statuses
    bad_statuses = {
        AgentHealthStatus.DOWN, AgentHealthStatus.ERROR,
        AgentHealthStatus.TIMEOUT, AgentHealthStatus.DEGRADED,
    }

    for st in agent_statuses:
        if st.health_status not in bad_statuses:
            continue
        pc = pc_map.get(st.project_connector_id)
        if not pc:
            continue

        is_resolved = st.health_status == AgentHealthStatus.DEGRADED and st.consecutive_failures == 0
        if is_resolved and not include_resolved:
            continue

        sev = "critical" if st.health_status in (AgentHealthStatus.DOWN, AgentHealthStatus.ERROR, AgentHealthStatus.TIMEOUT) else "warning"
        alert_id_counter += 1
        alerts.append({
            "id": f"agent-{st.project_connector_id}",
            "title": _alert_title(st.health_status.value, pc.name),
            "severity": sev,
            "status": "resolved" if is_resolved else "active",
            "service": pc.name,
            "rule": f"Connector {st.health_status.value.replace('_', ' ').title()}",
            "current": f"{st.consecutive_failures} consecutive failures" if st.consecutive_failures else st.health_status.value,
            "threshold": "0 failures",
            "time": _format_relative(st.last_error_at or st.last_sync_at),
            "duration": _format_relative(st.last_error_at) if st.last_error_at else None,
            "error": st.last_error,
            "uptime": st.uptime_percentage,
            "connector_id": pc.id,
            "connector_color": pc.catalog_entry.color if pc.catalog_entry else None,
            "connector_icon": pc.catalog_entry.icon if pc.catalog_entry else None,
            "source": "connector_agent",
        })

    # Build alerts from latest health run failures
    if latest_run:
        for cr in (latest_run.connector_results or []):
            if cr.health_status not in (RunHealthStatus.DOWN, RunHealthStatus.ERROR, RunHealthStatus.TIMEOUT, RunHealthStatus.DEGRADED):
                continue
            sev = "critical" if cr.health_status in (RunHealthStatus.DOWN, RunHealthStatus.ERROR, RunHealthStatus.TIMEOUT) else "warning"
            # Avoid duplicating agent-status alerts for same connector
            existing_ids = {a["connector_id"] for a in alerts if "connector_id" in a}
            if cr.project_connector_id and cr.project_connector_id in existing_ids:
                continue

            run_ts = latest_run.completed_at or latest_run.started_at
            alerts.append({
                "id": f"run-{cr.id}",
                "title": _alert_title(cr.health_status.value, cr.connector_name),
                "severity": sev,
                "status": "active",
                "service": cr.connector_name,
                "rule": f"Health Run: {cr.outcome.value.replace('_', ' ').title() if cr.outcome else 'Failed'}",
                "current": f"Score: {cr.health_score}" if cr.health_score is not None else "Failed",
                "threshold": "Score >= 70",
                "time": _format_relative(run_ts),
                "duration": f"{cr.duration_ms}ms" if cr.duration_ms else None,
                "error": cr.error_message,
                "uptime": None,
                "connector_id": cr.project_connector_id,
                "connector_color": None,
                "connector_icon": None,
                "source": "health_run",
            })

    # Build alerts from rule assignments (active rules that could be triggered)
    for assignment in rule_assignments:
        rule = assignment.rule
        if not rule or rule.status != RuleStatus.ACTIVE:
            continue
        sev = rule.severity.value if rule.severity else "medium"
        # Map rule severity to alert severity
        alert_sev = "critical" if sev in ("critical", "high") else "warning"
        alerts.append({
            "id": f"rule-{rule.id}",
            "title": rule.name,
            "severity": alert_sev,
            "status": "active",
            "service": "health-rules",
            "rule": rule.description or rule.name,
            "current": "Rule active",
            "threshold": f"Severity: {sev}",
            "time": _format_relative(rule.updated_at),
            "duration": None,
            "error": None,
            "uptime": None,
            "connector_id": None,
            "connector_color": None,
            "connector_icon": None,
            "source": "health_rule",
        })

    # Sort: critical first, then by time
    def _sort_key(a: Dict[str, Any]):
        sev_order = {"critical": 0, "warning": 1, "info": 2}
        status_order = {"active": 0, "resolved": 1}
        return (status_order.get(a.get("status", "active"), 2), sev_order.get(a.get("severity", "info"), 2))

    alerts.sort(key=_sort_key)

    active_count = sum(1 for a in alerts if a["status"] == "active")
    critical_count = sum(1 for a in alerts if a["severity"] == "critical" and a["status"] == "active")
    warning_count = sum(1 for a in alerts if a["severity"] == "warning" and a["status"] == "active")

    # Count resolved in last 24h (approximate via resolved alerts)
    resolved_24h = sum(1 for a in alerts if a["status"] == "resolved")

    return {
        "project_id": project_id,
        "alerts": alerts[:limit],
        "total": len(alerts),
        "active_count": active_count,
        "critical_count": critical_count,
        "warning_count": warning_count,
        "resolved_24h": resolved_24h,
    }


def _alert_title(status: str, name: str) -> str:
    titles = {
        "down": f"{name} is Down",
        "error": f"{name} Error",
        "timeout": f"{name} Timeout",
        "degraded": f"{name} Degraded",
    }
    return titles.get(status, f"{name} Health Issue")


# ─────────────────────────────────────────────────────────────────────────────
# /projects/{project_id}/kpi-metrics
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/kpi-metrics",
    response_model=dict,
    summary="Get key performance metric cards for Overview tab",
)
async def get_kpi_metrics(
    project_id: str,
    time_range: str = Query("1h", description="1h, 6h, 24h, 7d"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Returns KPI metric cards aggregated from:
    - HealthRun data (scores, counts, durations)
    - ConnectorAgentStatus (uptime, response times)
    - HealthRunConnectorResult (per-connector metrics)
    """
    hours_map = {"1h": 1, "6h": 6, "24h": 24, "7d": 168}
    hours = hours_map.get(time_range, 1)
    since = datetime.utcnow() - timedelta(hours=hours)

    # Previous period for change calculation
    prev_since = since - timedelta(hours=hours)

    # Fetch runs in current and previous period
    current_runs_result = await db.execute(
        select(HealthRun)
        .where(
            HealthRun.project_id == project_id,
            HealthRun.started_at >= since,
            HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
        )
        .order_by(HealthRun.started_at)
    )
    current_runs = current_runs_result.scalars().all()

    prev_runs_result = await db.execute(
        select(HealthRun)
        .where(
            HealthRun.project_id == project_id,
            HealthRun.started_at >= prev_since,
            HealthRun.started_at < since,
            HealthRun.status.in_([HealthRunStatus.COMPLETED, HealthRunStatus.PARTIAL]),
        )
    )
    prev_runs = prev_runs_result.scalars().all()

    # Collect run IDs
    current_run_ids = [r.id for r in current_runs]
    prev_run_ids = [r.id for r in prev_runs]

    # Fetch connector results for both periods
    def _agg_runs(runs: list) -> Dict[str, Any]:
        if not runs:
            return {
                "avg_score": None,
                "total_runs": 0,
                "success_runs": 0,
                "failure_runs": 0,
                "avg_duration_ms": None,
            }
        scores = [r.overall_score for r in runs if r.overall_score is not None]
        durations = [r.total_duration_ms for r in runs if r.total_duration_ms is not None]
        return {
            "avg_score": round(sum(scores) / len(scores), 1) if scores else None,
            "total_runs": len(runs),
            "success_runs": sum(r.success_count or 0 for r in runs),
            "failure_runs": sum(r.failure_count or 0 for r in runs),
            "avg_duration_ms": round(sum(durations) / len(durations)) if durations else None,
        }

    curr_agg = _agg_runs(current_runs)
    prev_agg = _agg_runs(prev_runs)

    # Fetch connector agent statuses for availability & response time
    pc_result = await db.execute(
        select(ProjectConnector).where(ProjectConnector.project_id == project_id)
    )
    project_connectors = pc_result.scalars().all()
    pc_ids = [pc.id for pc in project_connectors]

    agent_statuses: List[ConnectorAgentStatus] = []
    if pc_ids:
        status_result = await db.execute(
            select(ConnectorAgentStatus).where(
                ConnectorAgentStatus.project_connector_id.in_(pc_ids)
            )
        )
        agent_statuses = status_result.scalars().all()

    # Availability from agent uptime
    uptime_values = [s.uptime_percentage for s in agent_statuses if s.uptime_percentage is not None]
    availability = round(sum(uptime_values) / len(uptime_values), 2) if uptime_values else None

    # Response times from agent statuses
    response_times = [s.last_sync_response_ms for s in agent_statuses if s.last_sync_response_ms is not None]
    avg_response_ms = round(sum(response_times) / len(response_times)) if response_times else None

    # Connector result response times from current runs
    if current_run_ids:
        cr_result = await db.execute(
            select(HealthRunConnectorResult).where(
                HealthRunConnectorResult.health_run_id.in_(current_run_ids),
                HealthRunConnectorResult.response_time_ms.isnot(None),
            )
        )
        connector_results = cr_result.scalars().all()
        run_response_times = [cr.response_time_ms for cr in connector_results]
        if run_response_times:
            avg_response_ms = round(sum(run_response_times) / len(run_response_times))

    # Error rate: failure_runs / (success_runs + failure_runs)
    total_executions = curr_agg["success_runs"] + curr_agg["failure_runs"]
    error_rate = (curr_agg["failure_runs"] / total_executions) if total_executions > 0 else 0.0
    prev_total = prev_agg["success_runs"] + prev_agg["failure_runs"]
    prev_error_rate = (prev_agg["failure_runs"] / prev_total) if prev_total > 0 else 0.0

    # Throughput: runs per hour
    throughput_rph = round(curr_agg["total_runs"] / hours, 2) if hours > 0 else 0

    # Calculate changes vs previous period
    def _pct_change(current: Optional[float], previous: Optional[float]) -> Optional[str]:
        if current is None or previous is None:
            return None
        if previous == 0:
            return None
        change = ((current - previous) / previous) * 100
        sign = "+" if change >= 0 else ""
        return f"{sign}{change:.1f}%"

    prev_score = prev_agg["avg_score"]
    curr_score = curr_agg["avg_score"]
    score_change = _pct_change(curr_score, prev_score)

    prev_avail = availability  # No historical agent uptime available easily
    avail_change = "+0.0%"  # Placeholder — would need time-series uptime data

    response_change = None
    if avg_response_ms and prev_agg["avg_duration_ms"]:
        response_change = _pct_change(float(avg_response_ms), float(prev_agg["avg_duration_ms"] or avg_response_ms))

    error_change = _pct_change(error_rate * 100, prev_error_rate * 100)

    # Active alerts count
    active_alert_count = sum(
        1 for s in agent_statuses
        if s.health_status and s.health_status.value in ("down", "error", "timeout", "degraded")
    )

    # Build sparkline-ready time-series data for each metric
    # Use run history to build series
    score_series = [{"timestamp": (r.completed_at or r.started_at).isoformat(), "value": r.overall_score} for r in current_runs if r.overall_score is not None]
    availability_series = [
        {
            "timestamp": (r.completed_at or r.started_at).isoformat(),
            "value": round((r.success_count / r.connector_count * 100), 2) if r.connector_count and r.connector_count > 0 else 100.0,
        }
        for r in current_runs
    ]
    error_series = [
        {
            "timestamp": (r.completed_at or r.started_at).isoformat(),
            "value": round((r.failure_count / (r.success_count + r.failure_count) * 100), 3) if (r.success_count + r.failure_count) > 0 else 0.0,
        }
        for r in current_runs
    ]

    return {
        "project_id": project_id,
        "time_range": time_range,
        "hours": hours,
        "health_score": {
            "value": curr_score,
            "change": score_change,
            "positive": True,
            "series": score_series,
        },
        "availability": {
            "value": availability,
            "change": avail_change,
            "positive": True,
            "series": availability_series,
        },
        "avg_response_time_ms": {
            "value": avg_response_ms,
            "change": response_change,
            "positive": False,
            "series": [],
        },
        "error_rate": {
            "value": round(error_rate * 100, 4) if error_rate is not None else None,
            "change": error_change,
            "positive": error_rate < prev_error_rate if error_rate is not None else True,
            "series": error_series,
        },
        "throughput": {
            "value": throughput_rph,
            "change": None,
            "positive": True,
            "series": [],
        },
        "active_alerts": {
            "value": active_alert_count,
            "change": None,
            "positive": active_alert_count == 0,
            "series": [],
        },
        "total_runs": curr_agg["total_runs"],
        "success_runs": curr_agg["success_runs"],
        "failure_runs": curr_agg["failure_runs"],
        "avg_duration_ms": curr_agg["avg_duration_ms"],
    }


# ─────────────────────────────────────────────────────────────────────────────
# /projects/{project_id}/activity-summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{project_id}/activity-summary",
    response_model=dict,
    summary="Get weekly health run activity counts for the Activity tab chart",
)
async def get_activity_summary(
    project_id: str,
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Returns per-day run counts and error counts for the last N days.
    """
    since = datetime.utcnow() - timedelta(days=days)

    runs_result = await db.execute(
        select(HealthRun).where(
            HealthRun.project_id == project_id,
            HealthRun.started_at >= since,
        ).order_by(HealthRun.started_at)
    )
    runs = runs_result.scalars().all()

    # Bucket by day
    day_buckets: Dict[str, Dict[str, int]] = {}
    for run in runs:
        day = (run.started_at or datetime.utcnow()).strftime("%a")
        date_key = (run.started_at or datetime.utcnow()).strftime("%Y-%m-%d")
        key = f"{date_key}|{day}"
        if key not in day_buckets:
            day_buckets[key] = {"day": day, "date": date_key, "runs": 0, "errors": 0}
        day_buckets[key]["runs"] += 1
        if run.failure_count and run.failure_count > 0:
            day_buckets[key]["errors"] += 1

    # Fill missing days in the range
    activity = list(day_buckets.values())
    activity.sort(key=lambda x: x["date"])

    # Compute totals
    total_runs = sum(d["runs"] for d in activity)
    total_errors = sum(d["errors"] for d in activity)
    avg_runs_per_day = round(total_runs / days, 1)

    # Recent health run history for the audit log section
    recent_runs_result = await db.execute(
        select(HealthRun)
        .where(HealthRun.project_id == project_id)
        .order_by(desc(HealthRun.started_at))
        .limit(20)
    )
    recent_runs = recent_runs_result.scalars().all()

    run_log = []
    for r in recent_runs:
        status_val = r.status.value if r.status else "unknown"
        is_ok = status_val in ("completed",)
        run_log.append({
            "id": r.id,
            "action": "Health Check " + ("Completed" if is_ok else ("Failed" if status_val == "failed" else status_val.title())),
            "resource": "Health Run",
            "status": "success" if is_ok else ("error" if status_val == "failed" else "warning"),
            "score": r.overall_score,
            "health_status": r.overall_health_status.value if r.overall_health_status else None,
            "triggered_by": r.triggered_by.value if r.triggered_by else "unknown",
            "time": _format_relative(r.completed_at or r.started_at),
            "timestamp": (r.completed_at or r.started_at).isoformat() if (r.completed_at or r.started_at) else None,
            "duration_ms": r.total_duration_ms,
        })

    return {
        "project_id": project_id,
        "days": days,
        "activity": activity,
        "total_runs": total_runs,
        "total_errors": total_errors,
        "avg_runs_per_day": avg_runs_per_day,
        "recent_run_log": run_log,
    }
