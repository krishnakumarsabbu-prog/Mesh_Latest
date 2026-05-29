import uuid
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.dashboard_template import (
    DashboardTemplate, DashboardWidget, WidgetMetricBinding,
    DashboardScope, DashboardVisibility, WidgetType, MetricSourceScope, AggregationMode,
)
from app.schemas.dashboard_template import (
    DashboardTemplateCreate, DashboardTemplateUpdate,
    DashboardWidgetCreate, DashboardWidgetUpdate,
    DashboardTemplateSaveLayout,
)


def _load_opts():
    return selectinload(DashboardTemplate.widgets).selectinload(DashboardWidget.metric_bindings)


class DashboardTemplateService:

    async def list_all(
        self,
        db: AsyncSession,
        scope: Optional[str] = None,
        visibility: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> List[DashboardTemplate]:
        q = select(DashboardTemplate).options(_load_opts())
        if scope:
            q = q.where(DashboardTemplate.scope == DashboardScope(scope))
        if visibility:
            q = q.where(DashboardTemplate.visibility == DashboardVisibility(visibility))
        if created_by:
            q = q.where(DashboardTemplate.created_by == created_by)
        q = q.order_by(DashboardTemplate.created_at.desc())
        result = await db.execute(q)
        return result.scalars().all()

    async def get_by_id(self, db: AsyncSession, template_id: str) -> Optional[DashboardTemplate]:
        result = await db.execute(
            select(DashboardTemplate).options(_load_opts()).where(DashboardTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def create(
        self, db: AsyncSession, data: DashboardTemplateCreate, user_id: str
    ) -> DashboardTemplate:
        template = DashboardTemplate(
            id=str(uuid.uuid4()),
            name=data.name,
            description=data.description,
            scope=DashboardScope(data.scope),
            category=data.category,
            tags=data.tags,
            visibility=DashboardVisibility(data.visibility),
            version=1,
            created_by=user_id,
        )
        db.add(template)
        await db.flush()

        sort = 0
        for w_data in data.widgets:
            await self._create_widget(db, template.id, w_data, sort)
            sort += 1

        await db.flush()
        result = await db.execute(
            select(DashboardTemplate).options(_load_opts()).where(DashboardTemplate.id == template.id)
        )
        return result.scalar_one()

    async def update(
        self, db: AsyncSession, template_id: str, data: DashboardTemplateUpdate
    ) -> Optional[DashboardTemplate]:
        template = await self.get_by_id(db, template_id)
        if not template:
            return None
        if data.name is not None:
            template.name = data.name
        if data.description is not None:
            template.description = data.description
        if data.scope is not None:
            template.scope = DashboardScope(data.scope)
        if data.category is not None:
            template.category = data.category
        if data.tags is not None:
            template.tags = data.tags
        if data.visibility is not None:
            template.visibility = DashboardVisibility(data.visibility)
        template.updated_at = datetime.utcnow()
        template.version += 1
        await db.flush()
        return await self.get_by_id(db, template_id)

    async def delete(self, db: AsyncSession, template_id: str) -> bool:
        template = await self.get_by_id(db, template_id)
        if not template:
            return False
        await db.delete(template)
        await db.flush()
        return True

    async def save_layout(
        self, db: AsyncSession, template_id: str, data: DashboardTemplateSaveLayout
    ) -> Optional[DashboardTemplate]:
        template = await self.get_by_id(db, template_id)
        if not template:
            return None

        existing_ids = {w.id for w in template.widgets}
        incoming_ids = {w_data.id for w_data in data.widgets if hasattr(w_data, 'id') and getattr(w_data, 'id', None)}

        for widget in list(template.widgets):
            if widget.id not in incoming_ids:
                await db.delete(widget)

        await db.flush()

        for sort, w_data in enumerate(data.widgets):
            widget_id = getattr(w_data, 'id', None)
            if widget_id and widget_id in existing_ids:
                result = await db.execute(
                    select(DashboardWidget).options(selectinload(DashboardWidget.metric_bindings)).where(DashboardWidget.id == widget_id)
                )
                widget = result.scalar_one_or_none()
                if widget:
                    widget.layout_x = w_data.layout_x
                    widget.layout_y = w_data.layout_y
                    widget.width = w_data.width
                    widget.height = w_data.height
                    widget.sort_order = sort
                    widget.title = w_data.title
                    widget.subtitle = w_data.subtitle
                    widget.widget_type = WidgetType(w_data.widget_type)
                    widget.chart_config = w_data.chart_config
                    widget.threshold_config = w_data.threshold_config
                    widget.display_config = w_data.display_config
                    widget.updated_at = datetime.utcnow()

                    for mb in list(widget.metric_bindings):
                        await db.delete(mb)
                    await db.flush()

                    for mb_sort, mb_data in enumerate(w_data.metric_bindings):
                        mb = WidgetMetricBinding(
                            id=str(uuid.uuid4()),
                            widget_id=widget.id,
                            metric_source_scope=MetricSourceScope(mb_data.metric_source_scope),
                            metric_key=mb_data.metric_key,
                            connector_type=mb_data.connector_type,
                            aggregation_mode=AggregationMode(mb_data.aggregation_mode),
                            display_label=mb_data.display_label,
                            color_override=mb_data.color_override,
                            sort_order=mb_sort,
                        )
                        db.add(mb)
            else:
                await self._create_widget(db, template_id, w_data, sort)

        template.version += 1
        template.updated_at = datetime.utcnow()
        await db.flush()
        return await self.get_by_id(db, template_id)

    async def _create_widget(
        self, db: AsyncSession, template_id: str, w_data: DashboardWidgetCreate, sort: int
    ) -> DashboardWidget:
        widget = DashboardWidget(
            id=str(uuid.uuid4()),
            dashboard_template_id=template_id,
            widget_type=WidgetType(w_data.widget_type),
            title=w_data.title,
            subtitle=w_data.subtitle,
            layout_x=w_data.layout_x,
            layout_y=w_data.layout_y,
            width=w_data.width,
            height=w_data.height,
            chart_config=w_data.chart_config,
            threshold_config=w_data.threshold_config,
            display_config=w_data.display_config,
            sort_order=sort,
        )
        db.add(widget)
        await db.flush()

        for mb_sort, mb_data in enumerate(w_data.metric_bindings):
            mb = WidgetMetricBinding(
                id=str(uuid.uuid4()),
                widget_id=widget.id,
                metric_source_scope=MetricSourceScope(mb_data.metric_source_scope),
                metric_key=mb_data.metric_key,
                connector_type=mb_data.connector_type,
                aggregation_mode=AggregationMode(mb_data.aggregation_mode),
                display_label=mb_data.display_label,
                color_override=mb_data.color_override,
                sort_order=mb_sort,
            )
            db.add(mb)

        return widget

    async def clone(
        self, db: AsyncSession, template_id: str, new_name: str, user_id: str
    ) -> Optional[DashboardTemplate]:
        source = await self.get_by_id(db, template_id)
        if not source:
            return None

        new_template = DashboardTemplate(
            id=str(uuid.uuid4()),
            name=new_name,
            description=source.description,
            scope=source.scope,
            category=source.category,
            tags=source.tags,
            visibility=DashboardVisibility.PRIVATE,
            version=1,
            created_by=user_id,
        )
        db.add(new_template)
        await db.flush()

        for widget in source.widgets:
            new_widget = DashboardWidget(
                id=str(uuid.uuid4()),
                dashboard_template_id=new_template.id,
                widget_type=widget.widget_type,
                title=widget.title,
                subtitle=widget.subtitle,
                layout_x=widget.layout_x,
                layout_y=widget.layout_y,
                width=widget.width,
                height=widget.height,
                chart_config=widget.chart_config,
                threshold_config=widget.threshold_config,
                display_config=widget.display_config,
                sort_order=widget.sort_order,
            )
            db.add(new_widget)
            await db.flush()

            for mb in widget.metric_bindings:
                new_mb = WidgetMetricBinding(
                    id=str(uuid.uuid4()),
                    widget_id=new_widget.id,
                    metric_source_scope=mb.metric_source_scope,
                    metric_key=mb.metric_key,
                    connector_type=mb.connector_type,
                    aggregation_mode=mb.aggregation_mode,
                    display_label=mb.display_label,
                    color_override=mb.color_override,
                    sort_order=mb.sort_order,
                )
                db.add(new_mb)

        await db.flush()
        return await self.get_by_id(db, new_template.id)


dashboard_template_service = DashboardTemplateService()
