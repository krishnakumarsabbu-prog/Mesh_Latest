"""IBM MQ agent — queue depth, backlog analysis, and channel status."""
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus

logger = logging.getLogger(__name__)


class IbmMqAgent(BaseHealthMeshAgent):
    connector_slug = "ibm-mq"
    display_name = "IBM MQ"
    system_prompt = (
        "You are an IBM MQ expert. Analyze queue depth, backlog trends, "
        "channel health, and message throughput."
    )

    def _register_tools(self) -> None:
        self.register_tool("get_queue_status", "Get IBM MQ queue manager connector statuses", self._get_queue_status)
        self.register_tool("get_queue_depth", "Get queue depth metrics from health checks", self._get_queue_depth)
        self.register_tool("get_backlog_trend", "Get error trend for MQ connectors", self._get_backlog_trend)

    async def _get_queue_status(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(Connector).where(
                Connector.connector_type.ilike("%mq%"),
                Connector.is_active == True,
            )
        )
        connectors = rows.scalars().all()
        return [
            {"name": c.name, "status": c.status.value, "last_checked": str(c.last_checked)}
            for c in connectors
        ]

    async def _get_queue_depth(self, db: AsyncSession, **_) -> dict:
        rows = await db.execute(
            select(
                func.count(HealthCheck.id).label("checks"),
                func.avg(HealthCheck.response_time_ms).label("avg_rt"),
            )
            .join(Connector, Connector.id == HealthCheck.connector_id)
            .where(Connector.connector_type.ilike("%mq%"))
        )
        row = rows.one()
        return {
            "total_checks": int(row.checks or 0),
            "avg_response_ms": round(float(row.avg_rt), 1) if row.avg_rt else None,
        }

    async def _get_backlog_trend(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(HealthCheck.status, func.count(HealthCheck.id).label("cnt"))
            .join(Connector, Connector.id == HealthCheck.connector_id)
            .where(Connector.connector_type.ilike("%mq%"))
            .group_by(HealthCheck.status)
        )
        return [{"status": r.status.value, "count": r.cnt} for r in rows]

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = ["get_queue_status"]
        if any(w in q for w in ["depth", "queue", "message", "backlog"]):
            tools.append("get_queue_depth")
        if any(w in q for w in ["trend", "history", "backlog", "over time"]):
            tools.append("get_backlog_trend")
        return tools

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## IBM MQ"]
        if "get_queue_status" in data:
            statuses = data["get_queue_status"]
            down = [s for s in statuses if s["status"] != "healthy"]
            parts.append(f"- Queue managers: {len(statuses)}, Issues: {len(down)}")
        if "get_queue_depth" in data:
            qd = data["get_queue_depth"]
            parts.append(f"- Total health checks: {qd['total_checks']}, Avg response: {qd['avg_response_ms']}ms")
        if "get_backlog_trend" in data:
            trend = data["get_backlog_trend"]
            for t in trend:
                parts.append(f"  - {t['status']}: {t['count']} checks")
        return "\n".join(parts)
