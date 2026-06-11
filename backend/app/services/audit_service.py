import logging
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

class AuditService:
    async def log(
        self,
        db: AsyncSession,
        action: str,
        resource_type: str,
        resource_id: str,
        user_id: str,
        tenant_id: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        changes: Optional[Dict[str, Any]] = None,
    ) -> None:
        logger.info(
            f"AUDIT LOG: action={action} | resource_type={resource_type} | "
            f"resource_id={resource_id} | user_id={user_id} | changes={changes}"
        )

audit_service = AuditService()
