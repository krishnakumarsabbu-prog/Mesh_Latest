from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from app.db.base import get_db
from app.services.dashboard_service import dashboard_service
from app.api.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/stats")
async def get_stats(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await dashboard_service.get_stats(db, tenant_id=current_user.tenant_id or "default")


@router.get("/trends")
async def get_trends(
    hours: int = Query(default=24, ge=1, le=168),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await dashboard_service.get_health_trends(db, hours=hours)
