"""AppDynamics APM agent — queries connector health and response time metrics."""
import logging
from typing import Any, Optional

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus

logger = logging.getLogger(__name__)


class AppDynamicsAgent(BaseHealthMeshAgent):
    connector_slug = "appdynamics"
    display_name = "AppDynamics APM"
    system_prompt = (
        "You are an APM expert analyzing AppDynamics application performance data. "
        "Focus on response times, error rates, transaction health, and node inventory."
    )

    def _register_tools(self) -> None:
        self.register_tool("get_apm_status", "Get current APM connector statuses", self._get_apm_status)
        self.register_tool("get_slow_nodes", "Get nodes with highest avg response time", self._get_slow_nodes)
        self.register_tool("get_error_rate", "Get error rate for APM connectors in last 24h", self._get_error_rate)

    async def _get_apm_status(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(Connector).where(
                Connector.connector_type.ilike("%appdynamics%"),
                Connector.is_active == True,
            )
        )
        connectors = rows.scalars().all()
        return [
            {"name": c.name, "status": c.status.value, "last_checked": str(c.last_checked)}
            for c in connectors
        ]

    async def _get_slow_nodes(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(
                Connector.name,
                func.avg(HealthCheck.response_time_ms).label("avg_ms"),
            )
            .join(HealthCheck, HealthCheck.connector_id == Connector.id)
            .where(Connector.connector_type.ilike("%appdynamics%"))
            .group_by(Connector.id, Connector.name)
            .order_by(func.avg(HealthCheck.response_time_ms).desc())
            .limit(5)
        )
        return [{"name": r.name, "avg_response_ms": round(float(r.avg_ms), 1)} for r in rows]

    async def _get_error_rate(self, db: AsyncSession, **_) -> dict:
        total_row = await db.execute(
            select(func.count(HealthCheck.id))
            .join(Connector, Connector.id == HealthCheck.connector_id)
            .where(Connector.connector_type.ilike("%appdynamics%"))
        )
        total = total_row.scalar() or 0

        error_row = await db.execute(
            select(func.count(HealthCheck.id))
            .join(Connector, Connector.id == HealthCheck.connector_id)
            .where(
                Connector.connector_type.ilike("%appdynamics%"),
                HealthCheck.status.in_([HealthStatus.DOWN, HealthStatus.ERROR, HealthStatus.TIMEOUT]),
            )
        )
        errors = error_row.scalar() or 0
        rate = round(errors / total * 100, 2) if total > 0 else 0.0
        return {"total_checks": total, "error_checks": errors, "error_rate_pct": rate}

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = ["get_apm_status"]
        if any(w in q for w in ["slow", "response", "latency", "performance"]):
            tools.append("get_slow_nodes")
        if any(w in q for w in ["error", "fail", "rate", "incident"]):
            tools.append("get_error_rate")
        return tools

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## AppDynamics APM"]
        if "get_apm_status" in data:
            statuses = data["get_apm_status"]
            down = [s for s in statuses if s["status"] != "healthy"]
            parts.append(f"- Total APM connectors: {len(statuses)}, Issues: {len(down)}")
            for d in down[:3]:
                parts.append(f"  - {d['name']}: {d['status']}")
        if "get_slow_nodes" in data:
            nodes = data["get_slow_nodes"]
            if nodes:
                parts.append(f"- Slowest node: {nodes[0]['name']} ({nodes[0]['avg_response_ms']}ms avg)")
        if "get_error_rate" in data:
            er = data["get_error_rate"]
            parts.append(f"- Error rate: {er['error_rate_pct']}% ({er['error_checks']}/{er['total_checks']} checks)")
        return "\n".join(parts)
