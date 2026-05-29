from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List, Tuple
from app.models.audit import AuditLog
import uuid
import json


class AuditService:
    async def log(
        self,
        db: AsyncSession,
        action: str,
        resource_type: str,
        resource_id: Optional[str] = None,
        user_id: Optional[str] = None,
        changes: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> AuditLog:
        entry = AuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            changes=json.dumps(changes) if changes else None,
            ip_address=ip_address,
            user_agent=user_agent,
            tenant_id=tenant_id,
        )
        db.add(entry)
        await db.flush()
        return entry

    async def get_logs(
        self,
        db: AsyncSession,
        tenant_id: Optional[str] = None,
        resource_type: Optional[str] = None,
        user_id: Optional[str] = None,
        action: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[AuditLog], int]:
        base_q = select(AuditLog)
        if tenant_id:
            base_q = base_q.where(AuditLog.tenant_id == tenant_id)
        if resource_type:
            base_q = base_q.where(AuditLog.resource_type == resource_type)
        if user_id:
            base_q = base_q.where(AuditLog.user_id == user_id)
        if action:
            base_q = base_q.where(AuditLog.action.contains(action))
        if search:
            base_q = base_q.where(
                (AuditLog.action.contains(search)) |
                (AuditLog.resource_type.contains(search)) |
                (AuditLog.resource_id.contains(search))
            )
        count_q = select(func.count()).select_from(base_q.subquery())
        total_result = await db.execute(count_q)
        total = total_result.scalar() or 0
        q = base_q.order_by(AuditLog.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(q)
        return result.scalars().all(), total


audit_service = AuditService()
