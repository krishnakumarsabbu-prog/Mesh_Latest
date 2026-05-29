from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from datetime import datetime
import httpx
from app.models.connector import Connector, ConnectorStatus
from app.models.health_check import HealthCheck, HealthStatus
from app.schemas.connector import ConnectorCreate, ConnectorUpdate
import uuid


class ConnectorService:
    async def create(self, db: AsyncSession, data: ConnectorCreate, user_id: str) -> Connector:
        connector = Connector(
            id=str(uuid.uuid4()),
            name=data.name,
            description=data.description,
            type=data.type,
            project_id=data.project_id,
            endpoint_url=data.endpoint_url,
            config=data.config,
            check_interval_seconds=data.check_interval_seconds,
            timeout_seconds=data.timeout_seconds,
            created_by=user_id,
        )
        db.add(connector)
        await db.flush()
        return connector

    async def get_all(self, db: AsyncSession, project_id: Optional[str] = None) -> List[Connector]:
        q = select(Connector)
        if project_id:
            q = q.where(Connector.project_id == project_id)
        result = await db.execute(q)
        return result.scalars().all()

    async def get_by_id(self, db: AsyncSession, connector_id: str) -> Optional[Connector]:
        result = await db.execute(select(Connector).where(Connector.id == connector_id))
        return result.scalar_one_or_none()

    async def update(self, db: AsyncSession, connector_id: str, data: ConnectorUpdate) -> Optional[Connector]:
        connector = await self.get_by_id(db, connector_id)
        if not connector:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(connector, key, val)
        await db.flush()
        return connector

    async def delete(self, db: AsyncSession, connector_id: str) -> bool:
        connector = await self.get_by_id(db, connector_id)
        if not connector:
            return False
        await db.delete(connector)
        await db.flush()
        return True

    async def run_health_check(self, db: AsyncSession, connector_id: str) -> HealthCheck:
        connector = await self.get_by_id(db, connector_id)
        if not connector:
            raise ValueError("Connector not found")

        status = HealthStatus.UNKNOWN
        response_time_ms = None
        status_code = None
        error_message = None

        if connector.endpoint_url:
            try:
                timeout = float(connector.timeout_seconds or 30)
                start = datetime.utcnow()
                async with httpx.AsyncClient(timeout=timeout) as client:
                    response = await client.get(connector.endpoint_url)
                elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                response_time_ms = elapsed
                status_code = response.status_code

                if response.status_code < 400:
                    status = HealthStatus.HEALTHY if elapsed < 2000 else HealthStatus.DEGRADED
                else:
                    status = HealthStatus.DOWN
            except httpx.TimeoutException:
                status = HealthStatus.TIMEOUT
                error_message = "Request timed out"
            except Exception as e:
                status = HealthStatus.ERROR
                error_message = str(e)
        else:
            status = HealthStatus.HEALTHY

        health_check = HealthCheck(
            id=str(uuid.uuid4()),
            connector_id=connector_id,
            project_id=connector.project_id,
            status=status,
            response_time_ms=response_time_ms,
            status_code=status_code,
            error_message=error_message,
        )
        db.add(health_check)

        prev_status = connector.status
        connector.status = ConnectorStatus(status.value) if status.value in [s.value for s in ConnectorStatus] else ConnectorStatus.UNKNOWN
        connector.last_checked = datetime.utcnow()
        if prev_status != connector.status:
            connector.last_status_change = datetime.utcnow()

        await db.flush()
        return health_check


connector_service = ConnectorService()
