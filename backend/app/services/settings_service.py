import hashlib
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from app.models.user_settings import UserSettings, UserSession
from app.models.user import User
from app.models.platform_integration import PlatformIntegration, IntegrationStatus, IntegrationType
from app.core.security import verify_password, get_password_hash
from app.schemas.settings import (
    NotificationPreferencesUpdate,
    AppearanceSettingsUpdate,
    ChangePasswordRequest,
    ProfileUpdateRequest,
    IntegrationCreate,
    IntegrationUpdate,
)


class SettingsService:

    async def get_or_create_user_settings(self, db: AsyncSession, user_id: str) -> UserSettings:
        result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
        settings = result.scalar_one_or_none()
        if not settings:
            settings = UserSettings(
                id=str(uuid.uuid4()),
                user_id=user_id,
            )
            db.add(settings)
            await db.flush()
        return settings

    async def update_notification_preferences(
        self, db: AsyncSession, user_id: str, data: NotificationPreferencesUpdate
    ) -> UserSettings:
        settings = await self.get_or_create_user_settings(db, user_id)
        update_data = data.model_dump(exclude_none=True)
        for key, value in update_data.items():
            setattr(settings, key, value)
        settings.updated_at = datetime.utcnow()
        await db.flush()
        return settings

    async def update_appearance_settings(
        self, db: AsyncSession, user_id: str, data: AppearanceSettingsUpdate
    ) -> UserSettings:
        settings = await self.get_or_create_user_settings(db, user_id)
        update_data = data.model_dump(exclude_none=True)
        for key, value in update_data.items():
            setattr(settings, key, value)
        settings.updated_at = datetime.utcnow()
        await db.flush()
        return settings

    async def change_password(
        self, db: AsyncSession, user_id: str, data: ChangePasswordRequest
    ) -> dict:
        if data.new_password != data.confirm_password:
            return {"success": False, "message": "New password and confirmation do not match"}

        if len(data.new_password) < 8:
            return {"success": False, "message": "Password must be at least 8 characters"}

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            return {"success": False, "message": "User not found"}

        if not verify_password(data.current_password, user.hashed_password):
            return {"success": False, "message": "Current password is incorrect"}

        user.hashed_password = get_password_hash(data.new_password)
        await db.flush()
        return {"success": True, "message": "Password changed successfully"}

    async def update_profile(
        self, db: AsyncSession, user_id: str, data: ProfileUpdateRequest
    ) -> User:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError("User not found")

        update_data = data.model_dump(exclude_none=True)
        for key, value in update_data.items():
            setattr(user, key, value)
        await db.flush()
        return user

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    async def create_session(
        self,
        db: AsyncSession,
        user_id: str,
        token: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> UserSession:
        token_hash = self._hash_token(token)
        existing_result = await db.execute(
            select(UserSession).where(UserSession.session_token_hash == token_hash)
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            existing.last_active = datetime.utcnow()
            existing.is_active = True
            await db.flush()
            return existing

        device_info = None
        if user_agent:
            if "Mobile" in user_agent:
                device_info = "Mobile Browser"
            elif "Chrome" in user_agent:
                device_info = "Chrome Browser"
            elif "Firefox" in user_agent:
                device_info = "Firefox Browser"
            elif "Safari" in user_agent:
                device_info = "Safari Browser"
            else:
                device_info = "Web Browser"

        session = UserSession(
            id=str(uuid.uuid4()),
            user_id=user_id,
            session_token_hash=token_hash,
            device_info=device_info,
            ip_address=ip_address,
            user_agent=user_agent,
            last_active=datetime.utcnow(),
            created_at=datetime.utcnow(),
            is_active=True,
            expires_at=datetime.utcnow() + timedelta(days=30),
        )
        db.add(session)
        await db.flush()
        return session

    async def get_active_sessions(self, db: AsyncSession, user_id: str) -> List[UserSession]:
        result = await db.execute(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.is_active == True)
            .order_by(UserSession.last_active.desc())
        )
        return list(result.scalars().all())

    async def revoke_session(self, db: AsyncSession, user_id: str, session_id: str) -> bool:
        result = await db.execute(
            select(UserSession).where(
                UserSession.id == session_id, UserSession.user_id == user_id
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return False
        session.is_active = False
        await db.flush()
        return True

    async def revoke_all_other_sessions(
        self, db: AsyncSession, user_id: str, current_token: str
    ) -> int:
        current_hash = self._hash_token(current_token)
        result = await db.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.is_active == True,
                UserSession.session_token_hash != current_hash,
            )
        )
        sessions = result.scalars().all()
        count = 0
        for session in sessions:
            session.is_active = False
            count += 1
        await db.flush()
        return count

    async def get_integrations(
        self, db: AsyncSession, tenant_id: str = "default"
    ) -> List[PlatformIntegration]:
        result = await db.execute(
            select(PlatformIntegration)
            .where(PlatformIntegration.tenant_id == tenant_id)
            .order_by(PlatformIntegration.created_at.desc())
        )
        return list(result.scalars().all())

    async def create_integration(
        self, db: AsyncSession, data: IntegrationCreate, user_id: str, tenant_id: str = "default"
    ) -> PlatformIntegration:
        integration = PlatformIntegration(
            id=str(uuid.uuid4()),
            name=data.name,
            integration_type=IntegrationType(data.integration_type),
            description=data.description,
            config=data.config,
            encrypted_secrets=data.secrets,
            is_enabled=data.is_enabled,
            status=IntegrationStatus.PENDING,
            created_by=user_id,
            tenant_id=tenant_id,
        )
        db.add(integration)
        await db.flush()
        return integration

    async def update_integration(
        self, db: AsyncSession, integration_id: str, data: IntegrationUpdate
    ) -> Optional[PlatformIntegration]:
        result = await db.execute(
            select(PlatformIntegration).where(PlatformIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return None

        update_data = data.model_dump(exclude_none=True)
        if "secrets" in update_data:
            integration.encrypted_secrets = update_data.pop("secrets")
        for key, value in update_data.items():
            setattr(integration, key, value)
        integration.updated_at = datetime.utcnow()
        await db.flush()
        return integration

    async def delete_integration(self, db: AsyncSession, integration_id: str) -> bool:
        result = await db.execute(
            select(PlatformIntegration).where(PlatformIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return False
        await db.delete(integration)
        await db.flush()
        return True

    async def test_integration(
        self, db: AsyncSession, integration_id: str
    ) -> dict:
        result = await db.execute(
            select(PlatformIntegration).where(PlatformIntegration.id == integration_id)
        )
        integration = result.scalar_one_or_none()
        if not integration:
            return {"success": False, "message": "Integration not found"}

        test_result = await self._run_integration_test(integration)
        integration.last_tested_at = datetime.utcnow()
        integration.last_test_result = test_result
        integration.status = IntegrationStatus.ACTIVE if test_result["success"] else IntegrationStatus.ERROR
        await db.flush()
        return test_result

    async def _run_integration_test(self, integration: PlatformIntegration) -> dict:
        import aiohttp
        try:
            itype = integration.integration_type
            config = integration.config or {}
            secrets = integration.encrypted_secrets or {}

            if itype == IntegrationType.SLACK:
                webhook_url = config.get("webhook_url") or secrets.get("webhook_url")
                if not webhook_url:
                    return {"success": False, "message": "No webhook URL configured"}
                async with aiohttp.ClientSession() as session:
                    payload = {"text": "HealthMesh AI integration test - connection verified successfully"}
                    async with session.post(webhook_url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status == 200:
                            return {"success": True, "message": "Slack webhook test successful", "status_code": resp.status}
                        return {"success": False, "message": f"Slack webhook returned status {resp.status}", "status_code": resp.status}

            elif itype == IntegrationType.TEAMS:
                webhook_url = config.get("webhook_url") or secrets.get("webhook_url")
                if not webhook_url:
                    return {"success": False, "message": "No webhook URL configured"}
                async with aiohttp.ClientSession() as session:
                    payload = {
                        "@type": "MessageCard",
                        "@context": "http://schema.org/extensions",
                        "summary": "HealthMesh AI Test",
                        "text": "HealthMesh AI integration test - connection verified successfully"
                    }
                    async with session.post(webhook_url, json=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status in (200, 201):
                            return {"success": True, "message": "Teams webhook test successful"}
                        return {"success": False, "message": f"Teams webhook returned status {resp.status}"}

            elif itype == IntegrationType.EMAIL_SMTP:
                host = config.get("host", "")
                port = config.get("port", 587)
                if not host:
                    return {"success": False, "message": "SMTP host not configured"}
                import socket
                try:
                    sock = socket.create_connection((host, port), timeout=5)
                    sock.close()
                    return {"success": True, "message": f"SMTP server {host}:{port} is reachable"}
                except Exception as e:
                    return {"success": False, "message": f"Cannot reach SMTP server: {str(e)}"}

            elif itype == IntegrationType.WEBHOOK or itype == IntegrationType.GENERIC:
                url = config.get("url") or config.get("endpoint_url")
                if not url:
                    return {"success": False, "message": "No endpoint URL configured"}
                async with aiohttp.ClientSession() as session:
                    headers = config.get("headers", {})
                    token = secrets.get("token") or secrets.get("api_key")
                    if token:
                        headers["Authorization"] = f"Bearer {token}"
                    async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status < 500:
                            return {"success": True, "message": f"Webhook endpoint reachable (status {resp.status})"}
                        return {"success": False, "message": f"Endpoint returned server error {resp.status}"}

            elif itype == IntegrationType.PAGERDUTY:
                api_key = secrets.get("api_key") or secrets.get("token")
                if not api_key:
                    return {"success": False, "message": "PagerDuty API key not configured"}
                async with aiohttp.ClientSession() as session:
                    headers = {"Authorization": f"Token token={api_key}", "Accept": "application/vnd.pagerduty+json;version=2"}
                    async with session.get("https://api.pagerduty.com/abilities", headers=headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        if resp.status == 200:
                            return {"success": True, "message": "PagerDuty connection verified"}
                        return {"success": False, "message": f"PagerDuty returned status {resp.status}"}

            return {"success": True, "message": "Integration configuration saved (no test available for this type)"}

        except Exception as e:
            return {"success": False, "message": f"Test failed: {str(e)}"}


settings_service = SettingsService()
