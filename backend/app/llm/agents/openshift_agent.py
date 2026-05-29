"""OpenShift / OCP agent — pod health, container status, namespace health."""
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus

logger = logging.getLogger(__name__)


class OpenShiftAgent(BaseHealthMeshAgent):
    connector_slug = "openshift"
    display_name = "OpenShift"
    system_prompt = (
        "You are a Kubernetes/OpenShift expert. Analyze pod restarts, "
        "container health, namespace availability, and deployment status."
    )

    def _register_tools(self) -> None:
        self.register_tool("get_pod_status", "Get OpenShift connector health overview", self._get_pod_status)
        self.register_tool("get_namespace_health", "Get health breakdown by namespace/connector", self._get_namespace_health)

    async def _get_pod_status(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(Connector).where(
                Connector.connector_type.ilike("%openshift%") | Connector.connector_type.ilike("%ocp%") | Connector.connector_type.ilike("%kubernetes%"),
                Connector.is_active == True,
            )
        )
        connectors = rows.scalars().all()
        return [
            {"name": c.name, "status": c.status.value, "last_checked": str(c.last_checked)}
            for c in connectors
        ]

    async def _get_namespace_health(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(
                Connector.name,
                Connector.status,
                func.count(HealthCheck.id).label("check_count"),
                func.sum(
                    (HealthCheck.status == HealthStatus.DOWN).cast(func.count.__class__)
                ).label("down_count"),
            )
            .outerjoin(HealthCheck, HealthCheck.connector_id == Connector.id)
            .where(
                Connector.connector_type.ilike("%openshift%") | Connector.connector_type.ilike("%ocp%")
            )
            .group_by(Connector.id, Connector.name, Connector.status)
            .limit(10)
        )
        return [
            {"name": r.name, "status": r.status.value, "total_checks": r.check_count}
            for r in rows
        ]

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = ["get_pod_status"]
        if any(w in q for w in ["namespace", "deployment", "pod", "container", "restart"]):
            tools.append("get_namespace_health")
        return tools

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## OpenShift / OCP"]
        if "get_pod_status" in data:
            pods = data["get_pod_status"]
            issues = [p for p in pods if p["status"] != "healthy"]
            parts.append(f"- OCP connectors: {len(pods)}, Issues: {len(issues)}")
            for p in issues[:3]:
                parts.append(f"  - {p['name']}: {p['status']}")
        if "get_namespace_health" in data:
            ns = data["get_namespace_health"]
            parts.append(f"- Namespaces monitored: {len(ns)}")
        return "\n".join(parts)
