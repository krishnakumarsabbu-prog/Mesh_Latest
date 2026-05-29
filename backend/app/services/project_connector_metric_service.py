import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project_connector_metric import ProjectConnectorMetric
from app.models.metric_template import MetricTemplate
from app.schemas.project_connector_metric import ProjectConnectorMetricUpsert, ProjectConnectorMetricBulkSave


class ProjectConnectorMetricService:
    async def list_for_connector(
        self, db: AsyncSession, project_connector_id: str
    ) -> List[ProjectConnectorMetric]:
        result = await db.execute(
            select(ProjectConnectorMetric)
            .options(selectinload(ProjectConnectorMetric.metric_template))
            .where(ProjectConnectorMetric.project_connector_id == project_connector_id)
        )
        return result.scalars().all()

    async def get_by_id(
        self, db: AsyncSession, binding_id: str
    ) -> Optional[ProjectConnectorMetric]:
        result = await db.execute(
            select(ProjectConnectorMetric)
            .options(selectinload(ProjectConnectorMetric.metric_template))
            .where(ProjectConnectorMetric.id == binding_id)
        )
        return result.scalar_one_or_none()

    async def upsert(
        self,
        db: AsyncSession,
        project_connector_id: str,
        data: ProjectConnectorMetricUpsert,
        user_id: str,
    ) -> ProjectConnectorMetric:
        existing_result = await db.execute(
            select(ProjectConnectorMetric).where(
                ProjectConnectorMetric.project_connector_id == project_connector_id,
                ProjectConnectorMetric.metric_template_id == data.metric_template_id,
            )
        )
        binding = existing_result.scalar_one_or_none()

        if binding:
            binding.is_enabled = data.is_enabled
            binding.is_critical = data.is_critical
            binding.threshold_warning = data.threshold_warning
            binding.threshold_critical = data.threshold_critical
            binding.label_override = data.label_override
            binding.query_config_override = data.query_config_override
            binding.updated_at = datetime.utcnow()
        else:
            binding = ProjectConnectorMetric(
                id=str(uuid.uuid4()),
                project_connector_id=project_connector_id,
                metric_template_id=data.metric_template_id,
                is_enabled=data.is_enabled,
                is_critical=data.is_critical,
                threshold_warning=data.threshold_warning,
                threshold_critical=data.threshold_critical,
                label_override=data.label_override,
                query_config_override=data.query_config_override,
                created_by=user_id,
            )
            db.add(binding)

        await db.flush()

        result = await db.execute(
            select(ProjectConnectorMetric)
            .options(selectinload(ProjectConnectorMetric.metric_template))
            .where(ProjectConnectorMetric.id == binding.id)
        )
        refreshed = result.scalar_one()

        try:
            from app.models.project_connector import ProjectConnector
            from sqlalchemy import select as _select
            pc_result = await db.execute(
                _select(ProjectConnector.project_id).where(
                    ProjectConnector.id == project_connector_id
                )
            )
            pc_row = pc_result.scalar_one_or_none()
            if pc_row:
                from app.services.aggregation_scheduler import aggregation_scheduler
                await aggregation_scheduler.after_metric_update(pc_row)
        except Exception:
            pass

        return refreshed

    async def bulk_save(
        self,
        db: AsyncSession,
        project_connector_id: str,
        data: ProjectConnectorMetricBulkSave,
        user_id: str,
    ) -> List[ProjectConnectorMetric]:
        saved = []
        for item in data.bindings:
            binding = await self.upsert(db, project_connector_id, item, user_id)
            saved.append(binding)
        await db.flush()

        try:
            from app.models.project_connector import ProjectConnector
            from sqlalchemy import select as _select
            pc_result = await db.execute(
                _select(ProjectConnector.project_id).where(
                    ProjectConnector.id == project_connector_id
                )
            )
            pc_row = pc_result.scalar_one_or_none()
            if pc_row:
                from app.services.aggregation_scheduler import aggregation_scheduler
                await aggregation_scheduler.after_metric_update(pc_row)
        except Exception:
            pass

        return saved

    async def delete_binding(
        self, db: AsyncSession, binding_id: str
    ) -> bool:
        result = await db.execute(
            select(ProjectConnectorMetric).where(ProjectConnectorMetric.id == binding_id)
        )
        binding = result.scalar_one_or_none()
        if not binding:
            return False
        await db.delete(binding)
        await db.flush()
        return True

    async def initialize_defaults(
        self,
        db: AsyncSession,
        project_connector_id: str,
        catalog_entry_id: str,
        user_id: str,
    ) -> List[ProjectConnectorMetric]:
        existing = await self.list_for_connector(db, project_connector_id)
        if existing:
            return existing

        templates_result = await db.execute(
            select(MetricTemplate).where(MetricTemplate.catalog_entry_id == catalog_entry_id)
        )
        templates = templates_result.scalars().all()

        bindings = []
        for tmpl in templates:
            binding = ProjectConnectorMetric(
                id=str(uuid.uuid4()),
                project_connector_id=project_connector_id,
                metric_template_id=tmpl.id,
                is_enabled=tmpl.is_enabled_by_default,
                is_critical=tmpl.is_required,
                threshold_warning=tmpl.threshold_warning,
                threshold_critical=tmpl.threshold_critical,
                label_override=None,
                query_config_override=None,
                created_by=user_id,
            )
            db.add(binding)
            bindings.append(binding)

        await db.flush()
        return await self.list_for_connector(db, project_connector_id)


project_connector_metric_service = ProjectConnectorMetricService()
