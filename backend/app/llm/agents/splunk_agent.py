"""Splunk agent — log volume, error rate, search performance."""
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus

logger = logging.getLogger(__name__)


class SplunkAgent(BaseHealthMeshAgent):
    connector_slug = "splunk"
    display_name = "Splunk"
    system_prompt = (
        "You are a Splunk expert. Analyze log ingestion rates, error volumes, "
        "search performance, and index health."
    )

    def _register_tools(self) -> None:
        self.register_tool("get_splunk_status", "Get Splunk connector statuses", self._get_splunk_status)
        self.register_tool("get_error_volume", "Get error/warning counts from health checks", self._get_error_volume)

    async def _get_splunk_status(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(Connector).where(
                Connector.connector_type.ilike("%splunk%"),
                Connector.is_active == True,
            )
        )
        connectors = rows.scalars().all()
        return [
            {"name": c.name, "status": c.status.value, "last_checked": str(c.last_checked)}
            for c in connectors
        ]

    async def _get_error_volume(self, db: AsyncSession, **_) -> dict:
        rows = await db.execute(
            select(HealthCheck.status, func.count(HealthCheck.id).label("cnt"))
            .join(Connector, Connector.id == HealthCheck.connector_id)
            .where(Connector.connector_type.ilike("%splunk%"))
            .group_by(HealthCheck.status)
        )
        result = {r.status.value: r.cnt for r in rows}
        total = sum(result.values())
        errors = result.get("down", 0) + result.get("error", 0) + result.get("timeout", 0)
        return {
            "by_status": result,
            "total": total,
            "error_count": errors,
            "error_rate_pct": round(errors / total * 100, 2) if total > 0 else 0.0,
        }

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = ["get_splunk_status"]
        if any(w in q for w in ["error", "log", "volume", "rate", "incident"]):
            tools.append("get_error_volume")
        return tools

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## Splunk"]
        if "get_splunk_status" in data:
            statuses = data["get_splunk_status"]
            issues = [s for s in statuses if s["status"] != "healthy"]
            parts.append(f"- Splunk connectors: {len(statuses)}, Issues: {len(issues)}")
        if "get_error_volume" in data:
            ev = data["get_error_volume"]
            parts.append(f"- Error rate: {ev['error_rate_pct']}% ({ev['error_count']}/{ev['total']} checks)")
        return "\n".join(parts)
