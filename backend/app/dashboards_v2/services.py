import logging
import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import desc, select, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.project import Project
from app.models.component import Component
from app.models.dashboard_template import (
    DashboardTemplate,
    DashboardWidget,
    WidgetMetricBinding,
)
from app.models.health_run import HealthRun, HealthRunMetric
from app.models.connector_execution_log import ConnectorAgentStatus
from app.dashboards_v2.models import ComponentDashboardAssignment, ComponentDashboardWidgetOverride
from app.dashboards_v2.schemas import (
    ComponentAssignmentCreate,
    ComponentAssignmentResponse,
    ComponentAssignmentUpdate,
    ComponentAssignmentValidationError,
    ComponentAssignmentValidationResult,
    ComponentAssignmentValidationWarning,
    ComponentLiveDashboardResponse,
    ComponentLiveWidgetData,
    ComponentSummary,
    ComponentWidgetOverrideResponse,
)

logger = logging.getLogger("healthmesh.component_dashboard_assignment")


class ComponentDashboardAssignmentService:

    # ─── Assignment CRUD ────────────────────────────────────────────────────────

    async def list_assignments(
        self, db: AsyncSession, component_id: str
    ) -> List[ComponentAssignmentResponse]:
        result = await db.execute(
            select(ComponentDashboardAssignment)
            .where(ComponentDashboardAssignment.component_id == component_id)
            .order_by(ComponentDashboardAssignment.sort_order)
        )
        assignments = result.scalars().all()

        responses = []
        for a in assignments:
            template = await self._load_template(db, a.template_id)
            overrides = await self._load_overrides(db, a.id)
            responses.append(self._to_response(a, template, overrides))
        return responses

    async def get_assignment(
        self, db: AsyncSession, component_id: str, assignment_id: str
    ) -> Optional[ComponentAssignmentResponse]:
        result = await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.id == assignment_id,
                ComponentDashboardAssignment.component_id == component_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None
        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def assign_template(
        self,
        db: AsyncSession,
        component_id: str,
        data: ComponentAssignmentCreate,
        user_id: Optional[str],
    ) -> ComponentAssignmentResponse:
        existing = await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.component_id == component_id,
                ComponentDashboardAssignment.template_id == data.template_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Template is already assigned to this component")

        max_order_result = await db.execute(
            select(ComponentDashboardAssignment.sort_order)
            .where(ComponentDashboardAssignment.component_id == component_id)
            .order_by(desc(ComponentDashboardAssignment.sort_order))
            .limit(1)
        )
        row = max_order_result.scalar_one_or_none()
        next_order = (row or 0) + 1

        if data.is_default:
            await self._clear_defaults(db, component_id)

        assignment = ComponentDashboardAssignment(
            component_id=component_id,
            template_id=data.template_id,
            display_name=data.display_name,
            sort_order=next_order,
            is_default=data.is_default,
            refresh_interval_seconds=data.refresh_interval_seconds,
            assigned_by=user_id,
        )
        db.add(assignment)
        await db.flush()
        await db.refresh(assignment)

        template = await self._load_template(db, assignment.template_id)
        return self._to_response(assignment, template, [])

    async def update_assignment(
        self,
        db: AsyncSession,
        component_id: str,
        assignment_id: str,
        data: ComponentAssignmentUpdate,
    ) -> Optional[ComponentAssignmentResponse]:
        result = await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.id == assignment_id,
                ComponentDashboardAssignment.component_id == component_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None

        if data.is_default:
            await self._clear_defaults(db, component_id)
            a.is_default = True

        if data.display_name is not None:
            a.display_name = data.display_name
        if data.refresh_interval_seconds is not None:
            a.refresh_interval_seconds = data.refresh_interval_seconds
        if data.sort_order is not None:
            a.sort_order = data.sort_order

        db.add(a)
        await db.flush()
        await db.refresh(a)

        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def remove_assignment(
        self, db: AsyncSession, component_id: str, assignment_id: str
    ) -> bool:
        result = await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.id == assignment_id,
                ComponentDashboardAssignment.component_id == component_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return False

        # Cascade overrides deletion manually (although cascade delete on ForeignKey is also there)
        await db.execute(
            select(ComponentDashboardWidgetOverride).where(
                ComponentDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        await db.delete(a)
        await db.flush()
        return True

    async def reorder_assignments(
        self, db: AsyncSession, component_id: str, ordered_ids: List[str]
    ) -> bool:
        for idx, aid in enumerate(ordered_ids):
            await db.execute(
                text(
                    "UPDATE component_dashboard_assignments SET sort_order = :order "
                    "WHERE id = :id AND component_id = :cid"
                ),
                {"order": idx, "id": aid, "cid": component_id},
            )
        await db.flush()
        return True

    async def set_default_assignment(
        self, db: AsyncSession, component_id: str, assignment_id: str
    ) -> bool:
        await self._clear_defaults(db, component_id)
        await db.execute(
            text(
                "UPDATE component_dashboard_assignments SET is_default = 1 "
                "WHERE id = :id AND component_id = :cid"
            ),
            {"id": assignment_id, "cid": component_id},
        )
        await db.flush()
        return True

    # ─── Live Rendering Pipeline ──────────────────────────────────────────────────

    async def render_dashboard(
        self, db: AsyncSession, component_id: str, assignment_id: str
    ) -> Optional[ComponentLiveDashboardResponse]:
        result = await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.id == assignment_id,
                ComponentDashboardAssignment.component_id == component_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None

        component = (await db.execute(select(Component).where(Component.id == component_id))).scalar_one_or_none()
        if not component:
            return None

        template = await db.execute(
            select(DashboardTemplate)
            .options(selectinload(DashboardTemplate.widgets).selectinload(DashboardWidget.metric_bindings))
            .where(DashboardTemplate.id == a.template_id)
        )
        tpl = template.scalar_one_or_none()
        if not tpl:
            return None

        overrides = await self._load_overrides(db, a.id)
        override_map = {o.widget_id: o for o in overrides}

        # Retrieve all projects in this component
        projects_res = await db.execute(select(Project).where(Project.component_id == component_id))
        projects = projects_res.scalars().all()
        project_ids = [p.id for p in projects]

        # Component Summary Aggregates
        summary = await self._compile_component_summary(db, component, projects)

        # Get latest run IDs of all projects to query their connector metrics
        latest_run_ids = []
        if project_ids:
            for pid in project_ids:
                lrun = await db.execute(
                    select(HealthRun.id)
                    .where(HealthRun.project_id == pid)
                    .order_by(desc(HealthRun.started_at))
                    .limit(1)
                )
                rid = lrun.scalar_one_or_none()
                if rid:
                    latest_run_ids.append(rid)

        # Query metrics
        metrics_by_key = {}
        if latest_run_ids:
            metrics_res = await db.execute(
                select(HealthRunMetric).where(HealthRunMetric.health_run_id.in_(latest_run_ids))
            )
            for m in metrics_res.scalars().all():
                if m.metric_name not in metrics_by_key:
                    metrics_by_key[m.metric_name] = []
                metrics_by_key[m.metric_name].append(m)

        rendered_widgets = []
        for w in tpl.widgets:
            ow = override_map.get(w.id)
            if ow and ow.is_hidden:
                continue

            resolved_metrics = []
            has_data = False
            widget_error = None

            for binding in w.metric_bindings:
                val = None
                unit = "N/A"
                if binding.metric_source_scope.value == "component_aggregate":
                    # Map component summary values
                    field_name = binding.metric_key
                    if hasattr(summary, field_name):
                        val = getattr(summary, field_name)
                        unit = "count" if "count" in field_name or "project" in field_name else "%"
                        has_data = True
                elif binding.metric_source_scope.value == "connector_metric":
                    # Pull values from run metrics
                    matching_metrics = metrics_by_key.get(binding.metric_key, [])
                    if matching_metrics:
                        vals = [m.metric_value for m in matching_metrics if m.metric_value is not None]
                        if vals:
                            # Aggregate latest or average
                            if binding.aggregation_mode.value == "sum":
                                val = sum(vals)
                            elif binding.aggregation_mode.value == "avg":
                                val = sum(vals) / len(vals)
                            elif binding.aggregation_mode.value == "min":
                                val = min(vals)
                            elif binding.aggregation_mode.value == "max":
                                val = max(vals)
                            else:  # latest
                                val = vals[-1]
                            unit = matching_metrics[0].metric_unit or ""
                            has_data = True

                resolved_metrics.append({
                    "binding_id": binding.id,
                    "metric_key": binding.metric_key,
                    "metric_source_scope": binding.metric_source_scope.value,
                    "value": val,
                    "unit": unit,
                    "display_label": binding.display_label or binding.metric_key,
                })

            # Override title & display configs
            title = ow.title_override if ow and ow.title_override else w.title
            layout_y = ow.sort_order_override if ow and ow.sort_order_override is not None else w.layout_y
            threshold_cfg = ow.threshold_config_override if ow and ow.threshold_config_override else w.threshold_config
            display_cfg = ow.display_config_override if ow and ow.display_config_override else w.display_config

            rendered_widgets.append(ComponentLiveWidgetData(
                widget_id=w.id,
                widget_type=w.widget_type.value,
                title=title,
                subtitle=w.subtitle,
                is_hidden=False,
                layout_x=w.layout_x,
                layout_y=layout_y,
                width=w.width,
                height=w.height,
                sort_order=w.sort_order,
                chart_config=w.chart_config,
                threshold_config=threshold_cfg,
                display_config=display_cfg,
                resolved_metrics=resolved_metrics,
                has_data=has_data,
                error=widget_error,
            ))

        # Sort widgets by layout_y or sort_order
        rendered_widgets.sort(key=lambda x: (x.layout_y, x.sort_order))

        return ComponentLiveDashboardResponse(
            assignment_id=a.id,
            component_id=component_id,
            template_id=tpl.id,
            dashboard_name=a.display_name or tpl.name,
            template_name=tpl.name,
            refresh_interval_seconds=a.refresh_interval_seconds,
            rendered_at=datetime.utcnow().isoformat(),
            widgets=rendered_widgets,
            component_summary=summary,
        )

    # ─── Widget Overrides ─────────────────────────────────────────────────────────

    async def upsert_widget_override(
        self,
        db: AsyncSession,
        component_id: str,
        assignment_id: str,
        widget_id: str,
        data: Dict[str, Any],
    ) -> bool:
        # Verify assignment belongs to component
        assignment = (await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.id == assignment_id,
                ComponentDashboardAssignment.component_id == component_id,
            )
        )).scalar_one_or_none()
        if not assignment:
            return False

        existing = (await db.execute(
            select(ComponentDashboardWidgetOverride).where(
                ComponentDashboardWidgetOverride.assignment_id == assignment_id,
                ComponentDashboardWidgetOverride.widget_id == widget_id,
            )
        )).scalar_one_or_none()

        if existing:
            if "is_hidden" in data:
                existing.is_hidden = data["is_hidden"]
            if "title_override" in data:
                existing.title_override = data["title_override"]
            if "sort_order_override" in data:
                existing.sort_order_override = data["sort_order_override"]
            if "threshold_config_override" in data:
                existing.threshold_config_override = data["threshold_config_override"]
            if "display_config_override" in data:
                existing.display_config_override = data["display_config_override"]
            db.add(existing)
        else:
            override = ComponentDashboardWidgetOverride(
                assignment_id=assignment_id,
                widget_id=widget_id,
                is_hidden=data.get("is_hidden", False),
                title_override=data.get("title_override"),
                sort_order_override=data.get("sort_order_override"),
                threshold_config_override=data.get("threshold_config_override"),
                display_config_override=data.get("display_config_override"),
            )
            db.add(override)

        await db.flush()
        return True

    async def delete_widget_override(
        self, db: AsyncSession, component_id: str, assignment_id: str, widget_id: str
    ) -> bool:
        # Verify assignment belongs to component
        assignment = (await db.execute(
            select(ComponentDashboardAssignment).where(
                ComponentDashboardAssignment.id == assignment_id,
                ComponentDashboardAssignment.component_id == component_id,
            )
        )).scalar_one_or_none()
        if not assignment:
            return False

        existing = (await db.execute(
            select(ComponentDashboardWidgetOverride).where(
                ComponentDashboardWidgetOverride.assignment_id == assignment_id,
                ComponentDashboardWidgetOverride.widget_id == widget_id,
            )
        )).scalar_one_or_none()

        if not existing:
            return False

        await db.delete(existing)
        await db.flush()
        return True

    # ─── Validation ───────────────────────────────────────────────────────────────

    async def validate_template(
        self, db: AsyncSession, component_id: str, template_id: str
    ) -> ComponentAssignmentValidationResult:
        template = await self._load_template(db, template_id)
        if not template:
            return ComponentAssignmentValidationResult(
                valid=False,
                errors=[ComponentAssignmentValidationError(code="TEMPLATE_NOT_FOUND", message="Template not found")]
            )

        # Get all projects and connector types
        projects_res = await db.execute(select(Project).where(Project.component_id == component_id))
        projects = projects_res.scalars().all()
        project_ids = [p.id for p in projects]

        satisfied = 0
        total = 0
        warnings = []
        errors = []

        available_metric_keys = ["avg_project_health", "project_count", "healthy_projects", "warning_projects", "critical_projects", "total_alerts", "avg_availability", "sla_breach_count"]

        # If component has connector metric bindings, verify we have metric records
        latest_run_ids = []
        if project_ids:
            for pid in project_ids:
                lrun = await db.execute(
                    select(HealthRun.id)
                    .where(HealthRun.project_id == pid)
                    .order_by(desc(HealthRun.started_at))
                    .limit(1)
                )
                rid = lrun.scalar_one_or_none()
                if rid:
                    latest_run_ids.append(rid)

        metrics_res = await db.execute(
            select(HealthRunMetric.metric_name).where(HealthRunMetric.health_run_id.in_(latest_run_ids)).distinct()
        ) if latest_run_ids else None
        available_metrics = [m[0] for m in metrics_res.all()] if metrics_res else []

        for w in template.widgets:
            for binding in w.metric_bindings:
                total += 1
                if binding.metric_source_scope.value == "component_aggregate":
                    if binding.metric_key in available_metric_keys:
                        satisfied += 1
                    else:
                        warnings.append(ComponentAssignmentValidationWarning(
                            widget_id=w.id,
                            widget_title=w.title,
                            metric_key=binding.metric_key,
                            message=f"Aggregate key '{binding.metric_key}' is not predefined."
                        ))
                elif binding.metric_source_scope.value == "connector_metric":
                    if binding.metric_key in available_metrics:
                        satisfied += 1
                    else:
                        warnings.append(ComponentAssignmentValidationWarning(
                            widget_id=w.id,
                            widget_title=w.title,
                            metric_key=binding.metric_key,
                            message=f"Metric '{binding.metric_key}' has not been reported by connectors in this component."
                        ))

        return ComponentAssignmentValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            satisfied_bindings=satisfied,
            total_bindings=total,
            available_metric_keys=available_metric_keys + available_metrics
        )

    # ─── Internal Helpers ─────────────────────────────────────────────────────────

    async def _compile_component_summary(
        self, db: AsyncSession, component: Component, projects: List[Project]
    ) -> ComponentSummary:
        project_count = len(projects)
        healthy = 0
        warning = 0
        critical = 0
        scores = []
        incident_count = 0
        uptimes = []
        sla_pct = 100.0

        for p in projects:
            latest_run = await db.execute(
                select(HealthRun)
                .where(HealthRun.project_id == p.id)
                .order_by(desc(HealthRun.started_at))
                .limit(1)
            )
            run = latest_run.scalar_one_or_none()
            if run:
                scores.append(run.overall_score or 0.0)
                if run.overall_score >= 90:
                    healthy += 1
                elif run.overall_score >= 70:
                    warning += 1
                else:
                    critical += 1
                incident_count += (run.failure_count or 0)

            # Query uptime / availability percentage
            agent_status = await db.execute(
                select(ConnectorAgentStatus.uptime_percentage)
                .join(Project)
                .where(Project.id == p.id)
            )
            for row in agent_status.all():
                if row[0] is not None:
                    uptimes.append(row[0])

        avg_health = sum(scores) / len(scores) if scores else 100.0
        avg_avail = sum(uptimes) / len(uptimes) if uptimes else 100.0

        if project_count > 0:
            failure_ratio = critical / project_count
            sla_pct = round(max(0, (1 - failure_ratio) * 100), 2)

        return ComponentSummary(
            component_id=component.id,
            component_name=component.name,
            component_color=component.color,
            project_count=project_count,
            healthy_projects=healthy,
            warning_projects=warning,
            critical_projects=critical,
            avg_project_health=round(avg_health, 2),
            total_alerts=incident_count,
            avg_availability=round(avg_avail, 2),
            sla_breach_count=critical,
        )

    async def _load_template(self, db: AsyncSession, template_id: str) -> Optional[DashboardTemplate]:
        result = await db.execute(
            select(DashboardTemplate)
            .options(selectinload(DashboardTemplate.widgets).selectinload(DashboardWidget.metric_bindings))
            .where(DashboardTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def _load_overrides(
        self, db: AsyncSession, assignment_id: str
    ) -> List[ComponentDashboardWidgetOverride]:
        result = await db.execute(
            select(ComponentDashboardWidgetOverride)
            .where(ComponentDashboardWidgetOverride.assignment_id == assignment_id)
        )
        return result.scalars().all()

    async def _clear_defaults(self, db: AsyncSession, component_id: str):
        await db.execute(
            text(
                "UPDATE component_dashboard_assignments SET is_default = 0 "
                "WHERE component_id = :cid"
            ),
            {"cid": component_id},
        )
        await db.flush()

    def _to_response(
        self,
        a: ComponentDashboardAssignment,
        t: Optional[DashboardTemplate],
        overrides: List[ComponentDashboardWidgetOverride],
    ) -> ComponentAssignmentResponse:
        return ComponentAssignmentResponse(
            id=a.id,
            component_id=a.component_id,
            template_id=a.template_id,
            display_name=a.display_name,
            sort_order=a.sort_order,
            is_default=a.is_default,
            refresh_interval_seconds=a.refresh_interval_seconds,
            assigned_by=a.assigned_by,
            created_at=a.created_at,
            updated_at=a.updated_at,
            template_name=t.name if t else None,
            template_description=t.description if t else None,
            template_scope=t.scope.value if t else None,
            template_visibility=t.visibility.value if t else None,
            template_category=t.category if t else None,
            widget_count=len(t.widgets) if t and t.widgets else 0,
            overrides=[
                ComponentWidgetOverrideResponse.from_orm(o) for o in overrides
            ],
        )


component_dashboard_assignment_service = ComponentDashboardAssignmentService()
