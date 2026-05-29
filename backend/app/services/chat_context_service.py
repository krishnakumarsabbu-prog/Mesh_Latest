"""
Health context retrieval service.
Gathers structured health data from the database to ground LLM responses
in real system state. Never dumps raw DB objects — everything is
summarized into compact, token-efficient structures.
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus
from app.models.lob import Lob
from app.models.project import Project
from app.models.runtime import RuntimeAsset, ApplicationIntent, DataSourceImport

logger = logging.getLogger(__name__)


@dataclass
class ConnectorSnapshot:
    name: str
    status: str
    last_checked: Optional[str] = None
    avg_response_ms: Optional[float] = None
    uptime_pct: Optional[float] = None
    error_count: int = 0


@dataclass
class ProjectSnapshot:
    id: str
    name: str
    environment: str
    total_connectors: int = 0
    healthy: int = 0
    degraded: int = 0
    down: int = 0
    unknown: int = 0
    health_pct: float = 100.0
    connectors: list[ConnectorSnapshot] = field(default_factory=list)


@dataclass
class LobSnapshot:
    id: str
    name: str
    project_count: int = 0
    projects: list[ProjectSnapshot] = field(default_factory=list)


@dataclass
class RuntimeLocationContext:
    applications: list[dict]
    total_assets: int
    missing_sources: list[str]
    stale_sources: list[str]
    drift_events_24h: int
    data_quality: str


@dataclass
class HealthContext:
    tenant_id: str
    as_of: str
    overall_health_pct: float
    total_connectors: int
    healthy_connectors: int
    degraded_connectors: int
    down_connectors: int
    unknown_connectors: int
    incident_connectors: list[ConnectorSnapshot]
    slowest_connectors: list[ConnectorSnapshot]
    recent_errors: list[dict]
    lobs: list[LobSnapshot]
    project_context: Optional[ProjectSnapshot] = None
    runtime_location: Optional[RuntimeLocationContext] = None


_EXPECTED_SOURCES = ["ibm_mq", "mongodb", "oracle_oem", "cmdb", "scom", "ocp", "avi_loadbalancer"]


async def _build_runtime_location_context(db: AsyncSession) -> Optional[RuntimeLocationContext]:
    """Build a compact runtime location summary for LLM context injection."""
    try:
        asset_res = await db.execute(select(RuntimeAsset))
        assets = asset_res.scalars().all()
        if not assets:
            return RuntimeLocationContext(
                applications=[],
                total_assets=0,
                missing_sources=_EXPECTED_SOURCES,
                stale_sources=[],
                drift_events_24h=0,
                data_quality="UNKNOWN",
            )

        intent_res = await db.execute(select(ApplicationIntent))
        intents = intent_res.scalars().all()
        intent_map = {i.application_id: i for i in intents}

        import_res = await db.execute(
            select(DataSourceImport).order_by(DataSourceImport.imported_at.desc())
        )
        imports = import_res.scalars().all()
        latest_import: dict[str, DataSourceImport] = {}
        for imp in imports:
            if imp.source_name not in latest_import:
                latest_import[imp.source_name] = imp

        now = datetime.utcnow()
        threshold = now - timedelta(hours=24)
        missing_sources = [s for s in _EXPECTED_SOURCES if s not in latest_import]
        stale_sources = [
            s for s, imp in latest_import.items()
            if imp.imported_at and imp.imported_at < threshold
        ]

        # Group assets by application
        app_groups: dict[str, list] = {}
        for a in assets:
            app_id = (a.metadata_json or {}).get("application_id", "INFRASTRUCTURE")
            app_groups.setdefault(app_id, []).append(a)

        app_summaries = []
        for app_id, app_assets in list(app_groups.items())[:10]:
            primary = next(
                (a for a in app_assets if a.write_authority and a.latest_operational_state == "ACTIVE"),
                None,
            )
            primary_dc = primary.data_center_short if primary else "UNKNOWN"
            intent = intent_map.get(app_id)
            intended_dc = intent.intended_primary_dc if intent else "NO_INTENT"
            dcs = list({a.data_center_short for a in app_assets if a.data_center_short})

            drift_status = "UNKNOWN"
            if primary_dc != "UNKNOWN" and intended_dc not in ("UNKNOWN", "NO_INTENT"):
                drift_status = "ALIGNED" if primary_dc == intended_dc else "DRIFTED"
            elif primary_dc == "UNKNOWN":
                drift_status = "UNKNOWN"

            app_summaries.append({
                "application_id": app_id,
                "primary_write_dc": primary_dc,
                "intended_primary_dc": intended_dc,
                "active_dcs": dcs,
                "drift_status": drift_status,
            })

        # Count recent drift audit events
        from app.models.runtime import RuntimeAuditLog
        drift_res = await db.execute(
            select(func.count(RuntimeAuditLog.id)).where(
                RuntimeAuditLog.event_type == "DRIFT_DETECTED",
                RuntimeAuditLog.occurred_at >= threshold,
            )
        )
        drift_count = drift_res.scalar() or 0

        data_quality = (
            "UNKNOWN" if missing_sources and len(missing_sources) > 3
            else "DEGRADED" if (stale_sources or missing_sources)
            else "GOOD"
        )

        return RuntimeLocationContext(
            applications=app_summaries,
            total_assets=len(assets),
            missing_sources=missing_sources,
            stale_sources=stale_sources,
            drift_events_24h=drift_count,
            data_quality=data_quality,
        )
    except Exception as exc:
        logger.warning("Failed to build runtime location context: %s", exc)
        return None


async def build_health_context(
    db: AsyncSession,
    tenant_id: str,
    project_id: Optional[str] = None,
    hours_back: int = 24,
) -> HealthContext:
    since = datetime.utcnow() - timedelta(hours=hours_back)

    lob_rows = await db.execute(
        select(Lob).where(Lob.tenant_id == tenant_id, Lob.is_active == True)
    )
    lobs = lob_rows.scalars().all()

    project_rows = await db.execute(
        select(Project)
        .join(Lob, Project.lob_id == Lob.id)
        .where(Lob.tenant_id == tenant_id)
    )
    projects = project_rows.scalars().all()

    project_ids = [p.id for p in projects]
    if not project_ids:
        return HealthContext(
            tenant_id=tenant_id,
            as_of=datetime.utcnow().isoformat(),
            overall_health_pct=100.0,
            total_connectors=0,
            healthy_connectors=0,
            degraded_connectors=0,
            down_connectors=0,
            unknown_connectors=0,
            incident_connectors=[],
            slowest_connectors=[],
            recent_errors=[],
            lobs=[
                LobSnapshot(id=lob.id, name=lob.name, project_count=0, projects=[])
                for lob in lobs
            ],
        )

    connector_rows = await db.execute(
        select(Connector).where(
            Connector.project_id.in_(project_ids),
            Connector.is_active == True,
        )
    )
    connectors = connector_rows.scalars().all()
    connector_ids = [c.id for c in connectors]

    perf_map: dict[str, dict] = {}
    if connector_ids:
        avg_rt_rows = await db.execute(
            select(
                HealthCheck.connector_id,
                func.avg(HealthCheck.response_time_ms).label("avg_rt"),
                func.count(HealthCheck.id).label("check_count"),
            )
            .where(
                HealthCheck.connector_id.in_(connector_ids),
                HealthCheck.checked_at >= since,
            )
            .group_by(HealthCheck.connector_id)
        )
        for row in avg_rt_rows:
            perf_map[row.connector_id] = {
                "avg_rt": row.avg_rt,
                "check_count": row.check_count,
            }

        err_rows = await db.execute(
            select(
                HealthCheck.connector_id,
                func.count(HealthCheck.id).label("err_count"),
            )
            .where(
                HealthCheck.connector_id.in_(connector_ids),
                HealthCheck.status.in_([HealthStatus.DOWN, HealthStatus.ERROR, HealthStatus.TIMEOUT]),
                HealthCheck.checked_at >= since,
            )
            .group_by(HealthCheck.connector_id)
        )
        for row in err_rows:
            if row.connector_id in perf_map:
                perf_map[row.connector_id]["err_count"] = row.err_count
            else:
                perf_map[row.connector_id] = {"err_count": row.err_count}

    recent_error_rows = await db.execute(
        select(HealthCheck)
        .where(
            HealthCheck.connector_id.in_(connector_ids) if connector_ids else False,
            HealthCheck.status.in_([HealthStatus.DOWN, HealthStatus.ERROR, HealthStatus.TIMEOUT]),
            HealthCheck.checked_at >= since,
        )
        .order_by(HealthCheck.checked_at.desc())
        .limit(10)
    ) if connector_ids else None

    recent_error_checks = list(recent_error_rows.scalars().all()) if recent_error_rows else []
    connector_name_map = {c.id: c.name for c in connectors}
    recent_errors = [
        {
            "connector": connector_name_map.get(hc.connector_id, "unknown"),
            "status": hc.status.value,
            "error": hc.error_message or "",
            "at": hc.checked_at.isoformat() if hc.checked_at else "",
        }
        for hc in recent_error_checks[:5]
    ]

    status_counts: dict[ConnectorStatus, int] = {
        ConnectorStatus.HEALTHY: 0,
        ConnectorStatus.DEGRADED: 0,
        ConnectorStatus.DOWN: 0,
        ConnectorStatus.UNKNOWN: 0,
    }
    for c in connectors:
        status_counts[c.status] = status_counts.get(c.status, 0) + 1

    total = len(connectors)
    healthy = status_counts[ConnectorStatus.HEALTHY]
    overall_pct = round(healthy / total * 100, 1) if total > 0 else 100.0

    incident_connectors = [
        ConnectorSnapshot(
            name=c.name,
            status=c.status.value,
            last_checked=c.last_checked.isoformat() if c.last_checked else None,
            error_count=perf_map.get(c.id, {}).get("err_count", 0),
        )
        for c in connectors
        if c.status in (ConnectorStatus.DOWN, ConnectorStatus.DEGRADED)
    ][:10]

    slowest_connectors = sorted(
        [
            ConnectorSnapshot(
                name=c.name,
                status=c.status.value,
                avg_response_ms=round(float(perf_map[c.id]["avg_rt"]), 1) if perf_map.get(c.id, {}).get("avg_rt") else None,
            )
            for c in connectors
            if c.id in perf_map and perf_map[c.id].get("avg_rt")
        ],
        key=lambda x: x.avg_response_ms or 0,
        reverse=True,
    )[:5]

    project_map: dict[str, Project] = {p.id: p for p in projects}

    def _build_project_snapshot(proj: Project) -> ProjectSnapshot:
        proj_connectors = [c for c in connectors if c.project_id == proj.id]
        h = sum(1 for c in proj_connectors if c.status == ConnectorStatus.HEALTHY)
        d = sum(1 for c in proj_connectors if c.status == ConnectorStatus.DEGRADED)
        dn = sum(1 for c in proj_connectors if c.status == ConnectorStatus.DOWN)
        u = sum(1 for c in proj_connectors if c.status == ConnectorStatus.UNKNOWN)
        tc = len(proj_connectors)
        pct = round(h / tc * 100, 1) if tc > 0 else 100.0
        conn_snaps = [
            ConnectorSnapshot(
                name=c.name,
                status=c.status.value,
                last_checked=c.last_checked.isoformat() if c.last_checked else None,
                avg_response_ms=round(float(perf_map[c.id]["avg_rt"]), 1) if perf_map.get(c.id, {}).get("avg_rt") else None,
                error_count=perf_map.get(c.id, {}).get("err_count", 0),
            )
            for c in proj_connectors
        ]
        return ProjectSnapshot(
            id=proj.id,
            name=proj.name,
            environment=proj.environment or "production",
            total_connectors=tc,
            healthy=h,
            degraded=d,
            down=dn,
            unknown=u,
            health_pct=pct,
            connectors=conn_snaps,
        )

    lob_snapshots = []
    for lob in lobs:
        lob_projects = [p for p in projects if p.lob_id == lob.id]
        proj_snapshots = [_build_project_snapshot(p) for p in lob_projects]
        lob_snapshots.append(
            LobSnapshot(id=lob.id, name=lob.name, project_count=len(lob_projects), projects=proj_snapshots)
        )

    project_context: Optional[ProjectSnapshot] = None
    if project_id and project_id in project_map:
        project_context = _build_project_snapshot(project_map[project_id])

    runtime_location = await _build_runtime_location_context(db)

    return HealthContext(
        tenant_id=tenant_id,
        as_of=datetime.utcnow().isoformat(),
        overall_health_pct=overall_pct,
        total_connectors=total,
        healthy_connectors=healthy,
        degraded_connectors=status_counts[ConnectorStatus.DEGRADED],
        down_connectors=status_counts[ConnectorStatus.DOWN],
        unknown_connectors=status_counts[ConnectorStatus.UNKNOWN],
        incident_connectors=incident_connectors,
        slowest_connectors=slowest_connectors,
        recent_errors=recent_errors,
        lobs=lob_snapshots,
        project_context=project_context,
        runtime_location=runtime_location,
    )
