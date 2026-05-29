from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_user, require_admin
from app.db.base import get_db
from app.models.user import User
from app.models.platform_proxy import PlatformProxySettings

router = APIRouter(prefix="/proxy-settings", tags=["proxy-settings"])


class ProxySettingsResponse(BaseModel):
    proxy_url: Optional[str]
    proxy_strict_ssl: bool
    no_proxy: Optional[str]
    is_enabled: bool
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True


class ProxySettingsUpdate(BaseModel):
    proxy_url: Optional[str] = None
    proxy_strict_ssl: Optional[bool] = None
    no_proxy: Optional[str] = None
    is_enabled: Optional[bool] = None


@router.get("", response_model=ProxySettingsResponse)
async def get_proxy_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlatformProxySettings).where(PlatformProxySettings.id == "default")
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = PlatformProxySettings(
            id="default",
            proxy_url=None,
            proxy_strict_ssl=True,
            no_proxy=None,
            is_enabled=False,
        )
        db.add(settings)
        await db.flush()
    return settings


@router.put("", response_model=ProxySettingsResponse)
async def update_proxy_settings(
    data: ProxySettingsUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlatformProxySettings).where(PlatformProxySettings.id == "default")
    )
    settings = result.scalar_one_or_none()
    if not settings:
        settings = PlatformProxySettings(id="default")
        db.add(settings)

    update_data = data.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    settings.updated_by = current_user.id
    settings.updated_at = datetime.utcnow()
    await db.flush()
    return settings
