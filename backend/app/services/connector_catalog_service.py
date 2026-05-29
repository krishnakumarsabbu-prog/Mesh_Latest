from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import httpx
import uuid
import re

from app.models.connector_catalog import ConnectorCatalogEntry, CatalogConnectorCategory, CatalogConnectorStatus
from app.schemas.connector_catalog import (
    ConnectorCatalogCreate,
    ConnectorCatalogUpdate,
    ConnectorCatalogTestRequest,
    ConnectorCatalogTestResult,
)


def _slugify(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


class ConnectorCatalogService:
    async def get_all(
        self,
        db: AsyncSession,
        category: Optional[str] = None,
        enabled_only: bool = False,
    ) -> List[ConnectorCatalogEntry]:
        q = select(ConnectorCatalogEntry)
        if category:
            q = q.where(ConnectorCatalogEntry.category == category)
        if enabled_only:
            q = q.where(ConnectorCatalogEntry.is_enabled == True)
        q = q.order_by(ConnectorCatalogEntry.is_system.desc(), ConnectorCatalogEntry.name)
        result = await db.execute(q)
        return result.scalars().all()

    async def get_by_id(self, db: AsyncSession, entry_id: str) -> Optional[ConnectorCatalogEntry]:
        result = await db.execute(
            select(ConnectorCatalogEntry).where(ConnectorCatalogEntry.id == entry_id)
        )
        return result.scalar_one_or_none()

    async def get_by_slug(self, db: AsyncSession, slug: str) -> Optional[ConnectorCatalogEntry]:
        result = await db.execute(
            select(ConnectorCatalogEntry).where(ConnectorCatalogEntry.slug == slug)
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        db: AsyncSession,
        data: ConnectorCatalogCreate,
        user_id: str,
    ) -> ConnectorCatalogEntry:
        slug = data.slug or _slugify(data.name)
        existing = await self.get_by_slug(db, slug)
        if existing:
            slug = f"{slug}-{str(uuid.uuid4())[:8]}"

        entry = ConnectorCatalogEntry(
            id=str(uuid.uuid4()),
            slug=slug,
            name=data.name,
            description=data.description,
            vendor=data.vendor,
            category=data.category,
            icon=data.icon,
            color=data.color,
            tags=data.tags,
            config_schema=data.config_schema,
            default_config=data.default_config,
            test_definition=data.test_definition,
            docs_url=data.docs_url,
            version=data.version,
            is_system=False,
            is_enabled=True,
            created_by=user_id,
        )
        db.add(entry)
        await db.flush()
        return entry

    async def update(
        self,
        db: AsyncSession,
        entry_id: str,
        data: ConnectorCatalogUpdate,
    ) -> Optional[ConnectorCatalogEntry]:
        entry = await self.get_by_id(db, entry_id)
        if not entry:
            return None
        for key, val in data.model_dump(exclude_none=True).items():
            setattr(entry, key, val)
        entry.updated_at = datetime.utcnow()
        await db.flush()
        return entry

    async def toggle_enabled(
        self,
        db: AsyncSession,
        entry_id: str,
        enabled: bool,
    ) -> Optional[ConnectorCatalogEntry]:
        entry = await self.get_by_id(db, entry_id)
        if not entry:
            return None
        entry.is_enabled = enabled
        entry.updated_at = datetime.utcnow()
        await db.flush()
        return entry

    async def delete(self, db: AsyncSession, entry_id: str) -> bool:
        entry = await self.get_by_id(db, entry_id)
        if not entry or entry.is_system:
            return False
        await db.delete(entry)
        await db.flush()
        return True

    async def test_connector(
        self,
        db: AsyncSession,
        entry_id: str,
        test_req: ConnectorCatalogTestRequest,
    ) -> ConnectorCatalogTestResult:
        entry = await self.get_by_id(db, entry_id)
        if not entry:
            return ConnectorCatalogTestResult(success=False, error="Connector not found")

        try:
            timeout = test_req.timeout_seconds or 10
            config = test_req.config or {}
            creds = test_req.credentials or {}
            auth_type = (test_req.auth_type or config.get("auth_type") or "").lower()

            # Build auth headers
            headers: dict = {}
            auth_tuple = None

            if auth_type in ("bearer", "bearer_token"):
                token = creds.get("token") or config.get("token")
                if token:
                    headers["Authorization"] = f"Bearer {token}"
            elif auth_type in ("basic", "basic_auth"):
                username = creds.get("username") or config.get("username", "")
                password = creds.get("password") or config.get("password", "")
                auth_tuple = (username, password)
            elif auth_type in ("api_key", "api_key_header"):
                api_key = creds.get("api_key") or config.get("api_key")
                header_name = config.get("api_key_header_name", "X-API-Key")
                if api_key:
                    headers[header_name] = api_key
            elif auth_type == "splunk_token":
                token = creds.get("token") or config.get("token")
                if token:
                    headers["Authorization"] = f"Splunk {token}"
            elif auth_type in ("oauth2", "oauth2_client_credentials", "client_credentials"):
                token_url = creds.get("token_url") or config.get("token_url", "")
                client_id = creds.get("client_id") or config.get("client_id")
                client_secret = creds.get("client_secret") or config.get("client_secret")
                if token_url and client_id and client_secret:
                    async with httpx.AsyncClient(timeout=timeout) as token_client:
                        token_resp = await token_client.post(
                            token_url,
                            data={"grant_type": "client_credentials", "client_id": client_id, "client_secret": client_secret},
                        )
                    if token_resp.status_code == 200:
                        access_token = token_resp.json().get("access_token", "")
                        if access_token:
                            headers["Authorization"] = f"Bearer {access_token}"
                    else:
                        return ConnectorCatalogTestResult(
                            success=False,
                            error=f"OAuth2 token exchange failed: HTTP {token_resp.status_code}",
                        )

            # Load proxy settings
            proxy_mounts = None
            verify = True
            try:
                from app.models.platform_proxy import PlatformProxySettings
                from sqlalchemy import select as sa_select
                proxy_result = await db.execute(
                    sa_select(PlatformProxySettings).where(PlatformProxySettings.id == "default")
                )
                proxy_settings = proxy_result.scalar_one_or_none()
                if proxy_settings and proxy_settings.is_enabled and proxy_settings.proxy_url:
                    proxy = httpx.Proxy(url=proxy_settings.proxy_url)
                    proxy_mounts = {"http://": proxy, "https://": proxy}
                    verify = proxy_settings.proxy_strict_ssl
            except Exception:
                pass

            client_kwargs: dict = {"timeout": timeout, "verify": verify, "follow_redirects": True}
            if proxy_mounts:
                client_kwargs["mounts"] = proxy_mounts

            start = datetime.utcnow()
            async with httpx.AsyncClient(**client_kwargs) as client:
                req_kwargs: dict = {"headers": headers}
                if auth_tuple:
                    req_kwargs["auth"] = auth_tuple
                response = await client.get(test_req.endpoint_url, **req_kwargs)
            elapsed = (datetime.utcnow() - start).total_seconds() * 1000

            success = response.status_code < 400
            return ConnectorCatalogTestResult(
                success=success,
                status_code=response.status_code,
                response_time_ms=round(elapsed, 2),
                details={
                    "url": test_req.endpoint_url,
                    "content_type": response.headers.get("content-type"),
                    "authenticated": bool(headers.get("Authorization") or auth_tuple),
                },
            )
        except httpx.TimeoutException:
            return ConnectorCatalogTestResult(success=False, error="Connection timed out")
        except Exception as e:
            return ConnectorCatalogTestResult(success=False, error=str(e))


connector_catalog_service = ConnectorCatalogService()
