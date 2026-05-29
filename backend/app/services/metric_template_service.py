from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from datetime import datetime
import httpx
import uuid
import json

from app.models.metric_template import MetricTemplate, ParserType
from app.schemas.metric_template import (
    MetricTemplateCreate,
    MetricTemplateUpdate,
    MetricTemplateTestRequest,
    MetricTemplateTestResult,
)


def _extract_json_path(data: dict, path: str) -> Optional[object]:
    parts = path.lstrip("$.").split(".")
    current = data
    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return current


class MetricTemplateService:
    async def list_for_catalog(
        self,
        db: AsyncSession,
        catalog_entry_id: str,
        category: Optional[str] = None,
        enabled_only: bool = False,
    ) -> List[MetricTemplate]:
        q = select(MetricTemplate).where(MetricTemplate.catalog_entry_id == catalog_entry_id)
        if category:
            q = q.where(MetricTemplate.category == category)
        if enabled_only:
            q = q.where(MetricTemplate.is_enabled_by_default == True)
        q = q.order_by(MetricTemplate.display_order, MetricTemplate.name)
        result = await db.execute(q)
        return result.scalars().all()

    async def get_by_id(self, db: AsyncSession, template_id: str) -> Optional[MetricTemplate]:
        result = await db.execute(
            select(MetricTemplate).where(MetricTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def get_by_key(
        self, db: AsyncSession, catalog_entry_id: str, metric_key: str
    ) -> Optional[MetricTemplate]:
        result = await db.execute(
            select(MetricTemplate).where(
                MetricTemplate.catalog_entry_id == catalog_entry_id,
                MetricTemplate.metric_key == metric_key,
            )
        )
        return result.scalar_one_or_none()

    async def create(
        self,
        db: AsyncSession,
        catalog_entry_id: str,
        data: MetricTemplateCreate,
        user_id: str,
    ) -> MetricTemplate:
        existing = await self.get_by_key(db, catalog_entry_id, data.metric_key)
        if existing:
            raise ValueError(f"Metric key '{data.metric_key}' already exists for this connector")

        template = MetricTemplate(
            id=str(uuid.uuid4()),
            catalog_entry_id=catalog_entry_id,
            name=data.name,
            metric_key=data.metric_key,
            description=data.description,
            category=data.category,
            display_order=data.display_order,
            metric_type=data.metric_type,
            unit=data.unit,
            aggregation_type=data.aggregation_type,
            threshold_warning=data.threshold_warning,
            threshold_critical=data.threshold_critical,
            query_config=data.query_config,
            parser_type=data.parser_type,
            result_mapping=data.result_mapping,
            transformation_rules=data.transformation_rules,
            is_enabled_by_default=data.is_enabled_by_default,
            is_required=data.is_required,
            is_custom=data.is_custom,
            created_by=user_id,
        )
        db.add(template)
        await db.flush()
        return template

    async def update(
        self,
        db: AsyncSession,
        template_id: str,
        data: MetricTemplateUpdate,
    ) -> Optional[MetricTemplate]:
        template = await self.get_by_id(db, template_id)
        if not template:
            return None

        updates = data.model_dump(exclude_none=True)

        if "metric_key" in updates and updates["metric_key"] != template.metric_key:
            existing = await self.get_by_key(db, template.catalog_entry_id, updates["metric_key"])
            if existing:
                raise ValueError(f"Metric key '{updates['metric_key']}' already exists for this connector")

        for key, val in updates.items():
            setattr(template, key, val)
        template.updated_at = datetime.utcnow()
        await db.flush()
        return template

    async def delete(self, db: AsyncSession, template_id: str) -> bool:
        template = await self.get_by_id(db, template_id)
        if not template:
            return False
        await db.delete(template)
        await db.flush()
        return True

    async def clone(
        self,
        db: AsyncSession,
        template_id: str,
        new_name: Optional[str],
        new_metric_key: Optional[str],
        user_id: str,
    ) -> Optional[MetricTemplate]:
        source = await self.get_by_id(db, template_id)
        if not source:
            return None

        cloned_key = new_metric_key or f"{source.metric_key}_copy_{str(uuid.uuid4())[:6]}"
        cloned_name = new_name or f"{source.name} (Copy)"

        existing = await self.get_by_key(db, source.catalog_entry_id, cloned_key)
        if existing:
            cloned_key = f"{cloned_key}_{str(uuid.uuid4())[:6]}"

        clone = MetricTemplate(
            id=str(uuid.uuid4()),
            catalog_entry_id=source.catalog_entry_id,
            name=cloned_name,
            metric_key=cloned_key,
            description=source.description,
            category=source.category,
            display_order=source.display_order + 1,
            metric_type=source.metric_type,
            unit=source.unit,
            aggregation_type=source.aggregation_type,
            threshold_warning=source.threshold_warning,
            threshold_critical=source.threshold_critical,
            query_config=source.query_config,
            parser_type=source.parser_type,
            result_mapping=source.result_mapping,
            transformation_rules=source.transformation_rules,
            is_enabled_by_default=source.is_enabled_by_default,
            is_required=False,
            is_custom=True,
            created_by=user_id,
        )
        db.add(clone)
        await db.flush()
        return clone

    async def reorder(
        self,
        db: AsyncSession,
        catalog_entry_id: str,
        ordered_ids: List[str],
    ) -> List[MetricTemplate]:
        for idx, tid in enumerate(ordered_ids):
            result = await db.execute(
                select(MetricTemplate).where(
                    MetricTemplate.id == tid,
                    MetricTemplate.catalog_entry_id == catalog_entry_id,
                )
            )
            t = result.scalar_one_or_none()
            if t:
                t.display_order = idx
                t.updated_at = datetime.utcnow()
        await db.flush()
        return await self.list_for_catalog(db, catalog_entry_id)

    async def toggle_enabled(
        self,
        db: AsyncSession,
        template_id: str,
        enabled: bool,
    ) -> Optional[MetricTemplate]:
        template = await self.get_by_id(db, template_id)
        if not template:
            return None
        template.is_enabled_by_default = enabled
        template.updated_at = datetime.utcnow()
        await db.flush()
        return template

    async def test_metric(
        self,
        db: AsyncSession,
        template_id: str,
        test_req: MetricTemplateTestRequest,
    ) -> MetricTemplateTestResult:
        template = await self.get_by_id(db, template_id)
        if not template:
            return MetricTemplateTestResult(success=False, error="Metric template not found")

        try:
            timeout = test_req.timeout_seconds or 10
            headers = {}
            if test_req.auth_config:
                auth_type = test_req.auth_config.get("type")
                if auth_type == "bearer":
                    headers["Authorization"] = f"Bearer {test_req.auth_config.get('token', '')}"
                elif auth_type == "basic":
                    import base64
                    creds = f"{test_req.auth_config.get('username', '')}:{test_req.auth_config.get('password', '')}"
                    headers["Authorization"] = f"Basic {base64.b64encode(creds.encode()).decode()}"
                elif auth_type == "api_key":
                    header_name = test_req.auth_config.get("header", "X-API-Key")
                    headers[header_name] = test_req.auth_config.get("key", "")

            query_config = template.query_config or {}
            method = query_config.get("method", "GET").upper()
            url = test_req.endpoint_url

            if query_config.get("path"):
                url = url.rstrip("/") + "/" + query_config["path"].lstrip("/")

            start = datetime.utcnow()
            async with httpx.AsyncClient(timeout=timeout) as client:
                if method == "POST":
                    response = await client.post(url, headers=headers, json=query_config.get("body"))
                else:
                    response = await client.get(url, headers=headers, params=query_config.get("params"))
            elapsed = (datetime.utcnow() - start).total_seconds() * 1000

            raw_response = None
            try:
                raw_response = response.json()
            except Exception:
                raw_response = response.text

            parsed_value = None
            validation_errors = []

            if response.status_code < 400:
                result_mapping = template.result_mapping or {}
                value_path = result_mapping.get("value_path")

                if value_path and isinstance(raw_response, dict):
                    if template.parser_type == ParserType.JSON_PATH:
                        parsed_value = _extract_json_path(raw_response, value_path)
                    else:
                        parsed_value = raw_response.get(value_path)

                if template.threshold_warning is not None and parsed_value is not None:
                    try:
                        fv = float(parsed_value)
                        if template.threshold_critical is not None and fv >= template.threshold_critical:
                            validation_errors.append(f"Value {fv} exceeds critical threshold {template.threshold_critical}")
                        elif fv >= template.threshold_warning:
                            validation_errors.append(f"Value {fv} exceeds warning threshold {template.threshold_warning}")
                    except (TypeError, ValueError):
                        pass

            return MetricTemplateTestResult(
                success=response.status_code < 400,
                raw_response=raw_response,
                parsed_value=parsed_value,
                response_time_ms=round(elapsed, 2),
                status_code=response.status_code,
                validation_errors=validation_errors if validation_errors else None,
            )

        except httpx.TimeoutException:
            return MetricTemplateTestResult(success=False, error="Connection timed out")
        except Exception as e:
            return MetricTemplateTestResult(success=False, error=str(e))


metric_template_service = MetricTemplateService()
