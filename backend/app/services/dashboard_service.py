from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from datetime import datetime, timedelta
from app.models.lob import Lob
from app.models.project import Project
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus
from app.schemas.health import DashboardStats, HealthTrend


class DashboardService:
    async def get_stats(self, db: AsyncSession, tenant_id: str) -> DashboardStats:
        total_lobs = await db.execute(select(func.count(Lob.id)).where(Lob.tenant_id == tenant_id, Lob.is_active == True))
        total_projects = await db.execute(
            select(func.count(Project.id)).join(Lob, Project.lob_id == Lob.id).where(Lob.tenant_id == tenant_id)
        )
        total_connectors = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id).where(Lob.tenant_id == tenant_id)
        )
        healthy = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(Lob.tenant_id == tenant_id, Connector.status == ConnectorStatus.HEALTHY)
        )
        degraded = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(Lob.tenant_id == tenant_id, Connector.status == ConnectorStatus.DEGRADED)
        )
        down = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(Lob.tenant_id == tenant_id, Connector.status == ConnectorStatus.DOWN)
        )
        unknown = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(Lob.tenant_id == tenant_id, Connector.status == ConnectorStatus.UNKNOWN)
        )
        avg_rt = await db.execute(
            select(func.avg(HealthCheck.response_time_ms))
            .where(HealthCheck.checked_at >= datetime.utcnow() - timedelta(hours=1))
        )

        total_c = total_connectors.scalar() or 0
        healthy_c = healthy.scalar() or 0
        health_pct = (healthy_c / total_c * 100) if total_c > 0 else 100.0

        return DashboardStats(
            total_lobs=total_lobs.scalar() or 0,
            total_projects=total_projects.scalar() or 0,
            total_connectors=total_c,
            healthy_connectors=healthy_c,
            degraded_connectors=degraded.scalar() or 0,
            down_connectors=down.scalar() or 0,
            unknown_connectors=unknown.scalar() or 0,
            overall_health_percentage=round(health_pct, 2),
            avg_response_time_ms=avg_rt.scalar(),
        )

    async def get_health_trends(self, db: AsyncSession, hours: int = 24) -> List[dict]:
        since = datetime.utcnow() - timedelta(hours=hours)
        result = await db.execute(
            select(HealthCheck).where(HealthCheck.checked_at >= since).order_by(HealthCheck.checked_at)
        )
        checks = result.scalars().all()

        buckets = {}
        for check in checks:
            bucket = check.checked_at.replace(minute=0, second=0, microsecond=0)
            key = bucket.isoformat()
            if key not in buckets:
                buckets[key] = {"timestamp": bucket, "healthy": 0, "degraded": 0, "down": 0, "total": 0}
            buckets[key]["total"] += 1
            if check.status == HealthStatus.HEALTHY:
                buckets[key]["healthy"] += 1
            elif check.status == HealthStatus.DEGRADED:
                buckets[key]["degraded"] += 1
            elif check.status in [HealthStatus.DOWN, HealthStatus.ERROR, HealthStatus.TIMEOUT]:
                buckets[key]["down"] += 1

        return list(buckets.values())


dashboard_service = DashboardService()
