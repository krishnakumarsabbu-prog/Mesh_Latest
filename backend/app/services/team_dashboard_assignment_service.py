"""
Team Dashboard Assignment Service.

Handles:
- Assigning/unassigning dashboard templates to teams
- Reordering assignments and setting the default
- Validation engine: checks required team_aggregate metric keys exist
- Live dashboard rendering: resolves widget metric bindings against team aggregate metrics
- Team-level widget overrides (rename, hide, reorder, threshold overrides)

Rendering pipeline:
  Template widgets + WidgetMetricBindings (metric_source_scope=team_aggregate)
    → TeamAggregateMetric table
    → Resolved metric values rendered per widget type
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.aggregates import TeamAggregateMetric
from app.models.dashboard_template import (
    AggregationMode,
    DashboardTemplate,
    DashboardWidget,
    MetricSourceScope,
    WidgetMetricBinding,
)
from app.models.team import Team
from app.models.team_dashboard_assignment import TeamDashboardAssignment, TeamDashboardWidgetOverride
from app.schemas.team_dashboard_assignment import (
    TeamAssignmentCreate,
    TeamAssignmentResponse,
    TeamAssignmentUpdate,
    TeamAssignmentValidationError,
    TeamAssignmentValidationResult,
    TeamAssignmentValidationWarning,
    TeamLiveDashboardResponse,
    TeamLiveWidgetData,
    TeamSummary,
    TeamWidgetOverrideCreate,
    TeamWidgetOverrideResponse,
)

logger = logging.getLogger("healthmesh.team_dashboard_assignment")

TEAM_AGGREGATE_METRIC_KEYS = {
    "avg_project_health",
    "healthy_projects_count",
    "warning_projects_count",
    "critical_projects_count",
    "total_open_incidents",
    "avg_latency",
    "max_latency",
    "avg_availability",
    "sla_breach_count",
    "total_alerts",
    "project_count",
}


class TeamDashboardAssignmentService:

    # ─── Assignment CRUD ────────────────────────────────────────────────────────

    async def list_assignments(
        self, db: AsyncSession, team_id: str
    ) -> List[TeamAssignmentResponse]:
        result = await db.execute(
            select(TeamDashboardAssignment)
            .where(TeamDashboardAssignment.team_id == team_id)
            .order_by(TeamDashboardAssignment.sort_order)
        )
        assignments = result.scalars().all()

        responses = []
        for a in assignments:
            template = await self._load_template(db, a.template_id)
            overrides = await self._load_overrides(db, a.id)
            responses.append(self._to_response(a, template, overrides))
        return responses

    async def get_assignment(
        self, db: AsyncSession, team_id: str, assignment_id: str
    ) -> Optional[TeamAssignmentResponse]:
        result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
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
        team_id: str,
        data: TeamAssignmentCreate,
        user_id: Optional[str],
    ) -> TeamAssignmentResponse:
        existing = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.team_id == team_id,
                TeamDashboardAssignment.template_id == data.template_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Template is already assigned to this team")

        max_order_result = await db.execute(
            select(TeamDashboardAssignment.sort_order)
            .where(TeamDashboardAssignment.team_id == team_id)
            .order_by(desc(TeamDashboardAssignment.sort_order))
            .limit(1)
        )
        row = max_order_result.scalar_one_or_none()
        next_order = (row or 0) + 1

        if data.is_default:
            await self._clear_defaults(db, team_id)

        assignment = TeamDashboardAssignment(
            team_id=team_id,
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
        team_id: str,
        assignment_id: str,
        data: TeamAssignmentUpdate,
    ) -> Optional[TeamAssignmentResponse]:
        result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None

        if data.display_name is not None:
            a.display_name = data.display_name
        if data.refresh_interval_seconds is not None:
            a.refresh_interval_seconds = data.refresh_interval_seconds
        if data.sort_order is not None:
            a.sort_order = data.sort_order
        if data.is_default is not None:
            if data.is_default:
                await self._clear_defaults(db, team_id)
            a.is_default = data.is_default
        a.updated_at = datetime.utcnow()

        await db.flush()
        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def set_default(
        self, db: AsyncSession, team_id: str, assignment_id: str
    ) -> Optional[TeamAssignmentResponse]:
        result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None

        await self._clear_defaults(db, team_id)
        a.is_default = True
        a.updated_at = datetime.utcnow()
        await db.flush()

        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def reorder_assignments(
        self, db: AsyncSession, team_id: str, ordered_ids: List[str]
    ) -> List[TeamAssignmentResponse]:
        result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.team_id == team_id
            )
        )
        assignments = {a.id: a for a in result.scalars().all()}

        for idx, aid in enumerate(ordered_ids):
            if aid in assignments:
                assignments[aid].sort_order = idx
                assignments[aid].updated_at = datetime.utcnow()

        await db.flush()
        return await self.list_assignments(db, team_id)

    async def remove_assignment(
        self, db: AsyncSession, team_id: str, assignment_id: str
    ) -> bool:
        result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return False

        override_result = await db.execute(
            select(TeamDashboardWidgetOverride).where(
                TeamDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        for ov in override_result.scalars().all():
            await db.delete(ov)

        await db.delete(a)
        await db.flush()
        return True

    # ─── Widget Overrides ───────────────────────────────────────────────────────

    async def upsert_widget_override(
        self,
        db: AsyncSession,
        team_id: str,
        assignment_id: str,
        data: TeamWidgetOverrideCreate,
    ) -> Optional[TeamWidgetOverrideResponse]:
        a_result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
            )
        )
        if not a_result.scalar_one_or_none():
            return None

        ov_result = await db.execute(
            select(TeamDashboardWidgetOverride).where(
                TeamDashboardWidgetOverride.assignment_id == assignment_id,
                TeamDashboardWidgetOverride.widget_id == data.widget_id,
            )
        )
        ov = ov_result.scalar_one_or_none()

        if ov:
            ov.is_hidden = data.is_hidden
            ov.title_override = data.title_override
            ov.sort_order_override = data.sort_order_override
            ov.threshold_config_override = data.threshold_config_override
            ov.display_config_override = data.display_config_override
            ov.updated_at = datetime.utcnow()
        else:
            ov = TeamDashboardWidgetOverride(
                assignment_id=assignment_id,
                widget_id=data.widget_id,
                is_hidden=data.is_hidden,
                title_override=data.title_override,
                sort_order_override=data.sort_order_override,
                threshold_config_override=data.threshold_config_override,
                display_config_override=data.display_config_override,
            )
            db.add(ov)

        await db.flush()
        await db.refresh(ov)
        return TeamWidgetOverrideResponse.model_validate(ov)

    async def delete_widget_override(
        self,
        db: AsyncSession,
        team_id: str,
        assignment_id: str,
        widget_id: str,
    ) -> bool:
        a_result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
            )
        )
        if not a_result.scalar_one_or_none():
            return False

        ov_result = await db.execute(
            select(TeamDashboardWidgetOverride).where(
                TeamDashboardWidgetOverride.assignment_id == assignment_id,
                TeamDashboardWidgetOverride.widget_id == widget_id,
            )
        )
        ov = ov_result.scalar_one_or_none()
        if not ov:
            return False
        await db.delete(ov)
        await db.flush()
        return True

    # ─── Validation Engine ──────────────────────────────────────────────────────

    async def validate_assignment(
        self,
        db: AsyncSession,
        team_id: str,
        template_id: str,
    ) -> TeamAssignmentValidationResult:
        template = await self._load_template(db, template_id)
        if not template:
            return TeamAssignmentValidationResult(
                valid=False,
                errors=[TeamAssignmentValidationError(code="TEMPLATE_NOT_FOUND", message="Template not found")],
            )

        existing_agg_result = await db.execute(
            select(TeamAggregateMetric).where(TeamAggregateMetric.team_id == team_id)
        )
        existing_rows = existing_agg_result.scalars().all()
        available_keys = {row.metric_key for row in existing_rows}

        if not available_keys:
            available_keys = set(TEAM_AGGREGATE_METRIC_KEYS)

        errors: List[TeamAssignmentValidationError] = []
        warnings: List[TeamAssignmentValidationWarning] = []
        missing_metric_keys: set = set()
        total_bindings = 0
        satisfied_bindings = 0

        for widget in template.widgets:
            for binding in widget.metric_bindings:
                if binding.metric_source_scope not in (
                    MetricSourceScope.TEAM_AGGREGATE,
                    MetricSourceScope.LOB_AGGREGATE,
                    MetricSourceScope.PROJECT_AGGREGATE,
                    MetricSourceScope.CONNECTOR_METRIC,
                ):
                    continue

                total_bindings += 1

                if binding.metric_source_scope == MetricSourceScope.TEAM_AGGREGATE:
                    if binding.metric_key not in available_keys and binding.metric_key not in TEAM_AGGREGATE_METRIC_KEYS:
                        missing_metric_keys.add(binding.metric_key)
                        warnings.append(TeamAssignmentValidationWarning(
                            widget_id=widget.id,
                            widget_title=widget.title,
                            metric_key=binding.metric_key,
                            message=f"Team aggregate metric '{binding.metric_key}' is not a known aggregate key",
                        ))
                        continue
                    satisfied_bindings += 1
                else:
                    warnings.append(TeamAssignmentValidationWarning(
                        widget_id=widget.id,
                        widget_title=widget.title,
                        metric_key=binding.metric_key,
                        message=f"Binding scope '{binding.metric_source_scope.value}' may not resolve at team level; only team_aggregate is directly supported",
                    ))
                    total_bindings -= 1

        if total_bindings > 0 and satisfied_bindings == 0 and missing_metric_keys:
            errors.append(TeamAssignmentValidationError(
                code="NO_RESOLVABLE_BINDINGS",
                message="No metric bindings can be resolved from team aggregate metrics.",
                details={"missing_keys": list(missing_metric_keys)},
            ))

        return TeamAssignmentValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            missing_metric_keys=list(missing_metric_keys),
            satisfied_bindings=satisfied_bindings,
            total_bindings=total_bindings,
            available_metric_keys=list(available_keys or TEAM_AGGREGATE_METRIC_KEYS),
        )

    # ─── Live Dashboard Rendering ───────────────────────────────────────────────

    async def render_live_dashboard(
        self,
        db: AsyncSession,
        team_id: str,
        assignment_id: str,
    ) -> Optional[TeamLiveDashboardResponse]:
        a_result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.id == assignment_id,
                TeamDashboardAssignment.team_id == team_id,
            )
        )
        assignment = a_result.scalar_one_or_none()
        if not assignment:
            return None

        template = await self._load_template(db, assignment.template_id)
        if not template:
            return None

        overrides_result = await db.execute(
            select(TeamDashboardWidgetOverride).where(
                TeamDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        overrides_map: Dict[str, TeamDashboardWidgetOverride] = {
            ov.widget_id: ov for ov in overrides_result.scalars().all()
        }

        team_metrics = await self._fetch_team_metrics(db, team_id)

        team_result = await db.execute(select(Team).where(Team.id == team_id))
        team = team_result.scalar_one_or_none()

        widgets_data: List[TeamLiveWidgetData] = []
        sorted_widgets = sorted(template.widgets, key=lambda w: (w.layout_y, w.layout_x, w.sort_order))

        for widget in sorted_widgets:
            ov = overrides_map.get(widget.id)
            is_hidden = ov.is_hidden if ov else False
            title = (ov.title_override if ov and ov.title_override else widget.title)
            sort_order = (ov.sort_order_override if ov and ov.sort_order_override is not None else widget.sort_order)

            threshold_config = widget.threshold_config or {}
            if ov and ov.threshold_config_override:
                threshold_config = {**threshold_config, **ov.threshold_config_override}

            display_config = widget.display_config or {}
            if ov and ov.display_config_override:
                display_config = {**display_config, **ov.display_config_override}

            resolved_metrics = self._resolve_team_bindings(widget.metric_bindings, team_metrics)

            widgets_data.append(TeamLiveWidgetData(
                widget_id=widget.id,
                widget_type=widget.widget_type.value,
                title=title,
                subtitle=widget.subtitle,
                is_hidden=is_hidden,
                layout_x=widget.layout_x,
                layout_y=widget.layout_y,
                width=widget.width,
                height=widget.height,
                sort_order=sort_order,
                chart_config=widget.chart_config,
                threshold_config=threshold_config,
                display_config=display_config,
                resolved_metrics=resolved_metrics,
                has_data=len(resolved_metrics) > 0 and any(m.get("value") is not None for m in resolved_metrics),
            ))

        team_summary = await self._build_team_summary(db, team_id, team, team_metrics)
        dashboard_name = assignment.display_name or template.name

        return TeamLiveDashboardResponse(
            assignment_id=assignment_id,
            team_id=team_id,
            template_id=template.id,
            dashboard_name=dashboard_name,
            template_name=template.name,
            refresh_interval_seconds=assignment.refresh_interval_seconds,
            rendered_at=datetime.utcnow().isoformat(),
            widgets=widgets_data,
            team_summary=team_summary,
        )

    def _resolve_team_bindings(
        self,
        bindings: List[WidgetMetricBinding],
        team_metrics: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        resolved = []
        for b in sorted(bindings, key=lambda x: x.sort_order):
            key = b.metric_key
            scope = b.metric_source_scope

            if scope == MetricSourceScope.TEAM_AGGREGATE:
                metric_data = team_metrics.get(key)
                value = metric_data.get("value") if metric_data else None
                computed_at = metric_data.get("last_computed_at") if metric_data else None

                resolved.append({
                    "binding_id": b.id,
                    "metric_key": key,
                    "label": b.display_label or self._format_metric_label(key),
                    "aggregation_mode": b.aggregation_mode.value,
                    "value": value,
                    "unit": self._get_metric_unit(key),
                    "trend": [],
                    "color": b.color_override,
                    "source": "team_aggregate",
                    "last_computed_at": computed_at,
                })
            else:
                resolved.append({
                    "binding_id": b.id,
                    "metric_key": key,
                    "label": b.display_label or key,
                    "aggregation_mode": b.aggregation_mode.value,
                    "value": None,
                    "unit": None,
                    "trend": [],
                    "color": b.color_override,
                    "source": scope.value,
                    "note": f"Scope '{scope.value}' not directly resolvable at team level",
                })

        return resolved

    def _format_metric_label(self, key: str) -> str:
        label_map = {
            "avg_project_health": "Avg Health Score",
            "healthy_projects_count": "Healthy Projects",
            "warning_projects_count": "Warning Projects",
            "critical_projects_count": "Critical Projects",
            "total_open_incidents": "Open Incidents",
            "avg_latency": "Avg Latency",
            "max_latency": "Peak Latency",
            "avg_availability": "Avg Availability",
            "sla_breach_count": "SLA Breaches",
            "total_alerts": "Total Alerts",
            "project_count": "Project Count",
        }
        return label_map.get(key, key.replace("_", " ").title())

    def _get_metric_unit(self, key: str) -> Optional[str]:
        unit_map = {
            "avg_project_health": "%",
            "avg_latency": "ms",
            "max_latency": "ms",
            "avg_availability": "%",
        }
        return unit_map.get(key)

    async def _fetch_team_metrics(
        self, db: AsyncSession, team_id: str
    ) -> Dict[str, Any]:
        result = await db.execute(
            select(TeamAggregateMetric).where(TeamAggregateMetric.team_id == team_id)
        )
        rows = result.scalars().all()
        return {
            row.metric_key: {
                "value": row.numeric_value,
                "string_value": row.string_value,
                "last_computed_at": row.last_computed_at.isoformat() if row.last_computed_at else None,
            }
            for row in rows
        }

    async def _build_team_summary(
        self,
        db: AsyncSession,
        team_id: str,
        team: Optional[Team],
        team_metrics: Dict[str, Any],
    ) -> TeamSummary:
        def _val(key: str) -> float:
            m = team_metrics.get(key)
            return m["value"] if m and m["value"] is not None else 0.0

        computed_at = max(
            (m["last_computed_at"] for m in team_metrics.values() if m.get("last_computed_at")),
            default=None,
        )

        return TeamSummary(
            team_id=team_id,
            team_name=team.name if team else team_id,
            team_color=team.color if team else None,
            project_count=_val("project_count"),
            healthy_projects=_val("healthy_projects_count"),
            warning_projects=_val("warning_projects_count"),
            critical_projects=_val("critical_projects_count"),
            avg_project_health=_val("avg_project_health"),
            total_alerts=_val("total_alerts"),
            avg_availability=_val("avg_availability"),
            sla_breach_count=_val("sla_breach_count"),
            metrics_computed_at=computed_at,
        )

    # ─── Helpers ────────────────────────────────────────────────────────────────

    async def _load_template(
        self, db: AsyncSession, template_id: str
    ) -> Optional[DashboardTemplate]:
        result = await db.execute(
            select(DashboardTemplate)
            .options(
                selectinload(DashboardTemplate.widgets).selectinload(DashboardWidget.metric_bindings)
            )
            .where(DashboardTemplate.id == template_id)
        )
        return result.scalar_one_or_none()

    async def _load_overrides(
        self, db: AsyncSession, assignment_id: str
    ) -> List[TeamWidgetOverrideResponse]:
        result = await db.execute(
            select(TeamDashboardWidgetOverride).where(
                TeamDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        return [TeamWidgetOverrideResponse.model_validate(ov) for ov in result.scalars().all()]

    async def _clear_defaults(self, db: AsyncSession, team_id: str) -> None:
        result = await db.execute(
            select(TeamDashboardAssignment).where(
                TeamDashboardAssignment.team_id == team_id,
                TeamDashboardAssignment.is_default == True,
            )
        )
        for a in result.scalars().all():
            a.is_default = False
            a.updated_at = datetime.utcnow()
        await db.flush()

    def _to_response(
        self,
        assignment: TeamDashboardAssignment,
        template: Optional[DashboardTemplate],
        overrides: List[TeamWidgetOverrideResponse],
    ) -> TeamAssignmentResponse:
        return TeamAssignmentResponse(
            id=assignment.id,
            team_id=assignment.team_id,
            template_id=assignment.template_id,
            display_name=assignment.display_name,
            sort_order=assignment.sort_order,
            is_default=assignment.is_default,
            refresh_interval_seconds=assignment.refresh_interval_seconds,
            assigned_by=assignment.assigned_by,
            created_at=assignment.created_at,
            updated_at=assignment.updated_at,
            template_name=template.name if template else None,
            template_description=template.description if template else None,
            template_scope=template.scope.value if template else None,
            template_visibility=template.visibility.value if template else None,
            template_category=template.category if template else None,
            widget_count=len(template.widgets) if template else 0,
            overrides=overrides,
        )


team_dashboard_assignment_service = TeamDashboardAssignmentService()
