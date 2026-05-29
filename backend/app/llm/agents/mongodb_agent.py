"""MongoDB agent — replica set health, connection pool status."""
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus

logger = logging.getLogger(__name__)


class MongoDbAgent(BaseHealthMeshAgent):
    connector_slug = "mongodb"
    display_name = "MongoDB"
    system_prompt = (
        "You are a MongoDB expert. Analyze replica set health, replication lag, "
        "connection pool utilization, and oplog status."
    )

    def _register_tools(self) -> None:
        self.register_tool("get_replica_status", "Get MongoDB replica set connector status", self._get_replica_status)
        self.register_tool("get_connection_pool", "Get connection health metrics", self._get_connection_pool)

    async def _get_replica_status(self, db: AsyncSession, **_) -> list[dict]:
        rows = await db.execute(
            select(Connector).where(
                Connector.connector_type.ilike("%mongo%"),
                Connector.is_active == True,
            )
        )
        connectors = rows.scalars().all()
        return [
            {"name": c.name, "status": c.status.value, "last_checked": str(c.last_checked)}
            for c in connectors
        ]

    async def _get_connection_pool(self, db: AsyncSession, **_) -> dict:
        rows = await db.execute(
            select(
                func.count(HealthCheck.id).label("total"),
                func.avg(HealthCheck.response_time_ms).label("avg_rt"),
            )
            .join(Connector, Connector.id == HealthCheck.connector_id)
            .where(Connector.connector_type.ilike("%mongo%"))
        )
        row = rows.one()
        return {
            "total_health_checks": int(row.total or 0),
            "avg_response_ms": round(float(row.avg_rt), 1) if row.avg_rt else None,
        }

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = ["get_replica_status"]
        if any(w in q for w in ["connection", "pool", "latency", "response"]):
            tools.append("get_connection_pool")
        return tools

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## MongoDB"]
        if "get_replica_status" in data:
            replicas = data["get_replica_status"]
            issues = [r for r in replicas if r["status"] != "healthy"]
            parts.append(f"- Replica sets: {len(replicas)}, Issues: {len(issues)}")
            for r in issues[:3]:
                parts.append(f"  - {r['name']}: {r['status']}")
        if "get_connection_pool" in data:
            cp = data["get_connection_pool"]
            parts.append(f"- Avg response: {cp['avg_response_ms']}ms, Checks: {cp['total_health_checks']}")
        return "\n".join(parts)
