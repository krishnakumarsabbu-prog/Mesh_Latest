import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project_connector import ProjectConnector, ProjectConnectorStatus
from app.models.connector_catalog import ConnectorCatalogEntry
from app.schemas.project_connector import (
    ProjectConnectorAssign,
    ProjectConnectorConfig,
    ProjectConnectorTestResult,
)


class ProjectConnectorService:
    async def list_for_project(
        self, db: AsyncSession, project_id: str
    ) -> List[ProjectConnector]:
        result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.project_id == project_id)
            .order_by(ProjectConnector.priority.asc(), ProjectConnector.created_at.asc())
        )
        return result.scalars().all()

    async def get_by_id(
        self, db: AsyncSession, pc_id: str
    ) -> Optional[ProjectConnector]:
        result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.id == pc_id)
        )
        return result.scalar_one_or_none()

    async def assign(
        self,
        db: AsyncSession,
        project_id: str,
        data: ProjectConnectorAssign,
        user_id: str,
    ) -> ProjectConnector:
        existing = await db.execute(
            select(ProjectConnector).where(
                ProjectConnector.project_id == project_id,
                ProjectConnector.catalog_entry_id == data.catalog_entry_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("This connector is already assigned to the project")

        pc = ProjectConnector(
            id=str(uuid.uuid4()),
            project_id=project_id,
            catalog_entry_id=data.catalog_entry_id,
            name=data.name,
            description=data.description,
            priority=data.priority,
            status=ProjectConnectorStatus.UNCONFIGURED,
            is_enabled=True,
            assigned_by=user_id,
        )
        db.add(pc)
        await db.flush()
        await db.refresh(pc)
        result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.id == pc.id)
        )
        return result.scalar_one()

    async def configure(
        self,
        db: AsyncSession,
        pc_id: str,
        data: ProjectConnectorConfig,
    ) -> Optional[ProjectConnector]:
        pc = await self.get_by_id(db, pc_id)
        if not pc:
            return None

        if data.name is not None:
            pc.name = data.name
        if data.description is not None:
            pc.description = data.description
        if data.priority is not None:
            pc.priority = data.priority
        if data.config is not None:
            config_merged = json.loads(pc.config) if pc.config else {}
            config_merged.update(data.config)
            pc.config = json.dumps(config_merged)
        if data.credentials is not None:
            cred_merged = json.loads(pc.credentials) if pc.credentials else {}
            cred_merged.update(data.credentials)
            pc.credentials = json.dumps(cred_merged)

        if pc.config or pc.credentials:
            if pc.status == ProjectConnectorStatus.UNCONFIGURED:
                pc.status = ProjectConnectorStatus.CONFIGURED

        pc.updated_at = datetime.utcnow()
        await db.flush()
        return pc

    async def toggle_enabled(
        self,
        db: AsyncSession,
        pc_id: str,
        is_enabled: bool,
    ) -> Optional[ProjectConnector]:
        pc = await self.get_by_id(db, pc_id)
        if not pc:
            return None
        pc.is_enabled = is_enabled
        pc.updated_at = datetime.utcnow()
        await db.flush()
        return pc

    async def update_priority(
        self,
        db: AsyncSession,
        pc_id: str,
        priority: int,
    ) -> Optional[ProjectConnector]:
        pc = await self.get_by_id(db, pc_id)
        if not pc:
            return None
        pc.priority = priority
        pc.updated_at = datetime.utcnow()
        await db.flush()
        return pc

    async def remove(self, db: AsyncSession, pc_id: str) -> bool:
        pc = await self.get_by_id(db, pc_id)
        if not pc:
            return False
        await db.delete(pc)
        await db.flush()
        return True

    async def test_connection(
        self,
        db: AsyncSession,
        pc_id: str,
        override_config: Optional[Dict[str, Any]] = None,
        override_credentials: Optional[Dict[str, Any]] = None,
    ) -> ProjectConnectorTestResult:
        pc = await self.get_by_id(db, pc_id)
        if not pc:
            return ProjectConnectorTestResult(success=False, error="Project connector not found")

        catalog: ConnectorCatalogEntry = pc.catalog_entry
        if not catalog:
            return ProjectConnectorTestResult(success=False, error="Catalog entry not found")

        config = json.loads(pc.config) if pc.config else {}
        credentials = json.loads(pc.credentials) if pc.credentials else {}
        if override_config:
            config.update(override_config)
        if override_credentials:
            credentials.update(override_credentials)

        merged = {**config, **credentials}

        test_def = catalog.test_definition
        if not test_def:
            return ProjectConnectorTestResult(
                success=False,
                error="No test definition found for this connector type",
            )

        base_url = (
            merged.get("base_url")
            or merged.get("controller_url")
            or merged.get("instance_url")
        )
        if not base_url:
            return ProjectConnectorTestResult(
                success=False,
                error="No base URL configured. Please configure the connector first.",
            )

        path = test_def.get("path", "/")
        for key, val in merged.items():
            path = path.replace("{" + key + "}", str(val))

        url = base_url.rstrip("/") + "/" + path.lstrip("/")

        headers: Dict[str, str] = {}
        auth_header = test_def.get("auth_header")
        if auth_header:
            for key, val in merged.items():
                auth_header = auth_header.replace("{" + key + "}", str(val))
            header_parts = auth_header.split(" ", 1)
            if len(header_parts) == 2:
                headers["Authorization"] = auth_header
            else:
                headers["Authorization"] = auth_header

        auth = None
        if test_def.get("auth") == "basic":
            username = merged.get("username", "")
            password = merged.get("password", "")
            auth = (username, password)

        method = test_def.get("method", "GET").upper()
        expected_statuses = test_def.get("expected_status", [200])

        try:
            start = datetime.utcnow()
            async with httpx.AsyncClient(timeout=15, verify=merged.get("verify_ssl", True)) as client:
                req_kwargs: Dict[str, Any] = {"headers": headers}
                if auth:
                    req_kwargs["auth"] = auth
                response = await client.request(method, url, **req_kwargs)
            elapsed = round((datetime.utcnow() - start).total_seconds() * 1000)

            success = response.status_code in expected_statuses
            error_msg = None if success else f"Unexpected status {response.status_code}"

            pc.last_test_at = datetime.utcnow()
            pc.last_test_success = success
            pc.last_test_error = error_msg
            pc.last_test_response_ms = elapsed
            if success:
                pc.status = ProjectConnectorStatus.CONFIGURED
            else:
                pc.status = ProjectConnectorStatus.ERROR
            await db.flush()

            return ProjectConnectorTestResult(
                success=success,
                response_time_ms=elapsed,
                error=error_msg,
                details={"url": url, "status_code": response.status_code},
            )
        except httpx.TimeoutException:
            pc.last_test_at = datetime.utcnow()
            pc.last_test_success = False
            pc.last_test_error = "Connection timed out"
            pc.status = ProjectConnectorStatus.ERROR
            await db.flush()
            return ProjectConnectorTestResult(success=False, error="Connection timed out")
        except Exception as exc:
            pc.last_test_at = datetime.utcnow()
            pc.last_test_success = False
            pc.last_test_error = str(exc)
            pc.status = ProjectConnectorStatus.ERROR
            await db.flush()
            return ProjectConnectorTestResult(success=False, error=str(exc))


project_connector_service = ProjectConnectorService()
