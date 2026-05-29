from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List
from app.models.connector import Connector, ConnectorStatus
from app.models.project import Project
from app.models.lob import Lob
from app.models.health_check import HealthCheck, HealthStatus
from app.schemas.health import ChatRequest, ChatResponse
from datetime import datetime, timedelta
import re


class ChatbotService:
    async def process_message(self, db: AsyncSession, request: ChatRequest, tenant_id: str) -> ChatResponse:
        msg = request.message.lower().strip()

        if any(w in msg for w in ["health", "status", "how are", "overview"]):
            return await self._handle_health_query(db, tenant_id)

        if any(w in msg for w in ["down", "failing", "broken", "issue", "problem", "error"]):
            return await self._handle_incidents_query(db, tenant_id)

        if any(w in msg for w in ["slow", "response time", "latency", "performance"]):
            return await self._handle_performance_query(db, tenant_id)

        if any(w in msg for w in ["lob", "line of business", "department"]):
            return await self._handle_lob_query(db, tenant_id)

        return ChatResponse(
            message="I can help you with health status, incidents, performance metrics, and LOB overviews. What would you like to know?",
            suggestions=[
                "Show me the overall health status",
                "Are there any connectors down?",
                "What are the slowest connectors?",
                "Give me an LOB overview",
            ]
        )

    async def _handle_health_query(self, db: AsyncSession, tenant_id: str) -> ChatResponse:
        healthy = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(Lob.tenant_id == tenant_id, Connector.status == ConnectorStatus.HEALTHY)
        )
        total = await db.execute(
            select(func.count(Connector.id)).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id).where(Lob.tenant_id == tenant_id)
        )
        h = healthy.scalar() or 0
        t = total.scalar() or 0
        pct = round(h / t * 100, 1) if t > 0 else 100.0

        msg = f"Overall system health is **{pct}%**. {h} of {t} connectors are healthy."
        if pct >= 95:
            msg += " All systems are operating normally."
        elif pct >= 80:
            msg += " There are some minor degradations."
        else:
            msg += " Several services require attention."

        return ChatResponse(
            message=msg,
            suggestions=["Show me which connectors are down", "Give me a detailed breakdown"],
            data={"health_percentage": pct, "healthy": h, "total": t}
        )

    async def _handle_incidents_query(self, db: AsyncSession, tenant_id: str) -> ChatResponse:
        result = await db.execute(
            select(Connector).join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(Lob.tenant_id == tenant_id, Connector.status.in_([ConnectorStatus.DOWN, ConnectorStatus.DEGRADED]))
        )
        connectors = result.scalars().all()

        if not connectors:
            return ChatResponse(message="No incidents detected. All monitored connectors are healthy.")

        lines = [f"Found **{len(connectors)}** connector(s) with issues:"]
        for c in connectors[:5]:
            lines.append(f"- **{c.name}**: {c.status.value.upper()}")

        return ChatResponse(
            message="\n".join(lines),
            suggestions=["How long have these been down?", "Show me health history"],
            data={"incident_count": len(connectors)}
        )

    async def _handle_performance_query(self, db: AsyncSession, tenant_id: str) -> ChatResponse:
        result = await db.execute(
            select(Connector, func.avg(HealthCheck.response_time_ms).label("avg_rt"))
            .join(HealthCheck, Connector.id == HealthCheck.connector_id)
            .join(Project, Connector.project_id == Project.id)
            .join(Lob, Project.lob_id == Lob.id)
            .where(
                Lob.tenant_id == tenant_id,
                HealthCheck.checked_at >= datetime.utcnow() - timedelta(hours=1)
            )
            .group_by(Connector.id)
            .order_by(func.avg(HealthCheck.response_time_ms).desc())
            .limit(5)
        )
        rows = result.all()

        if not rows:
            return ChatResponse(message="No performance data available in the last hour.")

        lines = ["Top 5 slowest connectors in the last hour:"]
        for connector, avg_rt in rows:
            if avg_rt:
                lines.append(f"- **{connector.name}**: {round(avg_rt, 0)}ms avg response time")

        return ChatResponse(message="\n".join(lines), suggestions=["Show healthy connectors", "Check overall health"])

    async def _handle_lob_query(self, db: AsyncSession, tenant_id: str) -> ChatResponse:
        result = await db.execute(
            select(Lob, func.count(Project.id).label("proj_count"))
            .outerjoin(Project, Lob.id == Project.lob_id)
            .where(Lob.tenant_id == tenant_id, Lob.is_active == True)
            .group_by(Lob.id)
        )
        rows = result.all()

        if not rows:
            return ChatResponse(message="No Lines of Business found. Create your first LOB to get started.")

        lines = [f"You have **{len(rows)}** active Lines of Business:"]
        for lob, proj_count in rows:
            lines.append(f"- **{lob.name}**: {proj_count} project(s)")

        return ChatResponse(message="\n".join(lines), suggestions=["Show health per LOB", "Which LOB has issues?"])


chatbot_service = ChatbotService()
