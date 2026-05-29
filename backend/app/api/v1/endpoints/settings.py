from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.db.base import get_db
from app.models.user import User
from app.schemas.settings import (
    NotificationPreferencesUpdate,
    AppearanceSettingsUpdate,
    UserSettingsResponse,
    ChangePasswordRequest,
    ProfileUpdateRequest,
    UserSessionResponse,
    IntegrationCreate,
    IntegrationUpdate,
    IntegrationResponse,
    IntegrationTestResult,
)
from app.services.settings_service import settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/me", response_model=UserSettingsResponse)
async def get_my_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await settings_service.get_or_create_user_settings(db, current_user.id)


@router.put("/notifications", response_model=UserSettingsResponse)
async def update_notifications(
    data: NotificationPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await settings_service.update_notification_preferences(db, current_user.id, data)


@router.put("/appearance", response_model=UserSettingsResponse)
async def update_appearance(
    data: AppearanceSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await settings_service.update_appearance_settings(db, current_user.id, data)


@router.post("/security/change-password")
async def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await settings_service.change_password(db, current_user.id, data)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.put("/profile", response_model=dict)
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user = await settings_service.update_profile(db, current_user.id, data)
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "role": user.role.value if hasattr(user.role, "value") else user.role,
    }


@router.get("/sessions", response_model=List[UserSessionResponse])
async def get_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    sessions = await settings_service.get_active_sessions(db, current_user.id)
    auth_header = request.headers.get("Authorization", "")
    current_token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
    import hashlib
    current_hash = hashlib.sha256(current_token.encode()).hexdigest() if current_token else ""

    result = []
    for s in sessions:
        result.append(UserSessionResponse(
            id=s.id,
            device_info=s.device_info,
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            last_active=s.last_active,
            created_at=s.created_at,
            is_active=s.is_active,
            is_current=(s.session_token_hash == current_hash),
        ))
    return result


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success = await settings_service.revoke_session(db, current_user.id, session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "message": "Session revoked"}


@router.post("/sessions/revoke-all-others")
async def revoke_all_other_sessions(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    auth_header = request.headers.get("Authorization", "")
    current_token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else ""
    count = await settings_service.revoke_all_other_sessions(db, current_user.id, current_token)
    return {"success": True, "message": f"Revoked {count} session(s)"}


@router.get("/integrations", response_model=List[IntegrationResponse])
async def list_integrations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tenant_id = getattr(current_user, "tenant_id", "default") or "default"
    integrations = await settings_service.get_integrations(db, tenant_id)
    return [
        IntegrationResponse(
            id=i.id,
            name=i.name,
            integration_type=i.integration_type.value if hasattr(i.integration_type, "value") else i.integration_type,
            status=i.status.value if hasattr(i.status, "value") else i.status,
            description=i.description,
            config=i.config or {},
            is_enabled=i.is_enabled,
            last_tested_at=i.last_tested_at,
            last_test_result=i.last_test_result,
            created_at=i.created_at,
            updated_at=i.updated_at,
            tenant_id=i.tenant_id,
        )
        for i in integrations
    ]


@router.post("/integrations", response_model=IntegrationResponse)
async def create_integration(
    data: IntegrationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    tenant_id = getattr(current_user, "tenant_id", "default") or "default"
    integration = await settings_service.create_integration(db, data, current_user.id, tenant_id)
    return IntegrationResponse(
        id=integration.id,
        name=integration.name,
        integration_type=integration.integration_type.value,
        status=integration.status.value,
        description=integration.description,
        config=integration.config or {},
        is_enabled=integration.is_enabled,
        last_tested_at=integration.last_tested_at,
        last_test_result=integration.last_test_result,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
        tenant_id=integration.tenant_id,
    )


@router.put("/integrations/{integration_id}", response_model=IntegrationResponse)
async def update_integration(
    integration_id: str,
    data: IntegrationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    integration = await settings_service.update_integration(db, integration_id, data)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    return IntegrationResponse(
        id=integration.id,
        name=integration.name,
        integration_type=integration.integration_type.value,
        status=integration.status.value,
        description=integration.description,
        config=integration.config or {},
        is_enabled=integration.is_enabled,
        last_tested_at=integration.last_tested_at,
        last_test_result=integration.last_test_result,
        created_at=integration.created_at,
        updated_at=integration.updated_at,
        tenant_id=integration.tenant_id,
    )


@router.delete("/integrations/{integration_id}")
async def delete_integration(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    success = await settings_service.delete_integration(db, integration_id)
    if not success:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"success": True}


@router.post("/integrations/{integration_id}/test", response_model=IntegrationTestResult)
async def test_integration(
    integration_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await settings_service.test_integration(db, integration_id)
    return IntegrationTestResult(
        success=result.get("success", False),
        message=result.get("message", ""),
        details=result.get("details"),
        tested_at=datetime.utcnow(),
    )
