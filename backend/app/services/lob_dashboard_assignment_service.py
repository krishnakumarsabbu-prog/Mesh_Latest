"""
LOB Dashboard Assignment Service.

Handles:
- Assigning/unassigning dashboard templates to LOBs
- Reordering assignments and setting default
- Validation engine: checks required lob_aggregate metric keys exist
- Live dashboard rendering: resolves widget metric bindings against LOB aggregate metrics
- LOB-level widget overrides (rename, hide, reorder, threshold overrides)

Rendering pipeline:
  Template widgets + WidgetMetricBindings (metric_source_scope=lob_aggregate)
    → LobAggregateMetric table
    → Resolved metric values rendered per widget type (portfolio/executive roll-up)
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.aggregates import LobAggregateMetric
from app.models.dashboard_template import (
    AggregationMode,
    DashboardTemplate,
    DashboardWidget,
    MetricSourceScope,
    WidgetMetricBinding,
)
from app.models.lob import Lob
from app.models.lob_dashboard_assignment import LobDashboardAssignment, LobDashboardWidgetOverride
from app.schemas.lob_dashboard_assignment import (
    LobAssignmentCreate,
    LobAssignmentResponse,
    LobAssignmentUpdate,
    LobAssignmentValidationError,
    LobAssignmentValidationResult,
    LobAssignmentValidationWarning,
    LobLiveDashboardResponse,
    LobLiveWidgetData,
    LobPortfolioSummary,
    LobWidgetOverrideCreate,
    LobWidgetOverrideResponse,
)

logger = logging.getLogger("healthmesh.lob_dashboard_assignment")

LOB_AGGREGATE_METRIC_KEYS = {
    "avg_team_health",
    "avg_project_health",
    "total_projects",
    "critical_projects_count",
    "critical_teams_count",
    "portfolio_availability",
    "total_incidents",
    "sla_breach_rate",
    "team_count",
}

_LABEL_MAP: Dict[str, str] = {
    "avg_team_health": "Avg Team Health",
    "avg_project_health": "Avg Project Health",
    "total_projects": "Total Projects",
    "critical_projects_count": "Critical Projects",
    "critical_teams_count": "Critical Teams",
    "portfolio_availability": "Portfolio Availability",
    "total_incidents": "Total Incidents",
    "sla_breach_rate": "SLA Breach Rate",
    "team_count": "Team Count",
}

_UNIT_MAP: Dict[str, str] = {
    "avg_team_health": "%",
    "avg_project_health": "%",
    "portfolio_availability": "%",
    "sla_breach_rate": "%",
}


class LobDashboardAssignmentService:

    # ─── Assignment CRUD ────────────────────────────────────────────────────────

    async def list_assignments(
        self, db: AsyncSession, lob_id: str
    ) -> List[LobAssignmentResponse]:
        result = await db.execute(
            select(LobDashboardAssignment)
            .where(LobDashboardAssignment.lob_id == lob_id)
            .order_by(LobDashboardAssignment.sort_order)
        )
        assignments = result.scalars().all()

        responses = []
        for a in assignments:
            template = await self._load_template(db, a.template_id)
            overrides = await self._load_overrides(db, a.id)
            responses.append(self._to_response(a, template, overrides))
        return responses

    async def get_assignment(
        self, db: AsyncSession, lob_id: str, assignment_id: str
    ) -> Optional[LobAssignmentResponse]:
        result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
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
        lob_id: str,
        data: LobAssignmentCreate,
        user_id: Optional[str],
    ) -> LobAssignmentResponse:
        existing = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.lob_id == lob_id,
                LobDashboardAssignment.template_id == data.template_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Template is already assigned to this LOB")

        max_order_result = await db.execute(
            select(LobDashboardAssignment.sort_order)
            .where(LobDashboardAssignment.lob_id == lob_id)
            .order_by(desc(LobDashboardAssignment.sort_order))
            .limit(1)
        )
        row = max_order_result.scalar_one_or_none()
        next_order = (row or 0) + 1

        if data.is_default:
            await self._clear_defaults(db, lob_id)

        assignment = LobDashboardAssignment(
            lob_id=lob_id,
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
        lob_id: str,
        assignment_id: str,
        data: LobAssignmentUpdate,
    ) -> Optional[LobAssignmentResponse]:
        result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
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
                await self._clear_defaults(db, lob_id)
            a.is_default = data.is_default
        a.updated_at = datetime.utcnow()

        await db.flush()
        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def set_default(
        self, db: AsyncSession, lob_id: str, assignment_id: str
    ) -> Optional[LobAssignmentResponse]:
        result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None

        await self._clear_defaults(db, lob_id)
        a.is_default = True
        a.updated_at = datetime.utcnow()
        await db.flush()

        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def reorder_assignments(
        self, db: AsyncSession, lob_id: str, ordered_ids: List[str]
    ) -> List[LobAssignmentResponse]:
        result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.lob_id == lob_id
            )
        )
        assignments = {a.id: a for a in result.scalars().all()}

        for idx, aid in enumerate(ordered_ids):
            if aid in assignments:
                assignments[aid].sort_order = idx
                assignments[aid].updated_at = datetime.utcnow()

        await db.flush()
        return await self.list_assignments(db, lob_id)

    async def remove_assignment(
        self, db: AsyncSession, lob_id: str, assignment_id: str
    ) -> bool:
        result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return False

        override_result = await db.execute(
            select(LobDashboardWidgetOverride).where(
                LobDashboardWidgetOverride.assignment_id == assignment_id
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
        lob_id: str,
        assignment_id: str,
        data: LobWidgetOverrideCreate,
    ) -> Optional[LobWidgetOverrideResponse]:
        a_result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
            )
        )
        if not a_result.scalar_one_or_none():
            return None

        ov_result = await db.execute(
            select(LobDashboardWidgetOverride).where(
                LobDashboardWidgetOverride.assignment_id == assignment_id,
                LobDashboardWidgetOverride.widget_id == data.widget_id,
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
            ov = LobDashboardWidgetOverride(
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
        return LobWidgetOverrideResponse.model_validate(ov)

    async def delete_widget_override(
        self,
        db: AsyncSession,
        lob_id: str,
        assignment_id: str,
        widget_id: str,
    ) -> bool:
        a_result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
            )
        )
        if not a_result.scalar_one_or_none():
            return False

        ov_result = await db.execute(
            select(LobDashboardWidgetOverride).where(
                LobDashboardWidgetOverride.assignment_id == assignment_id,
                LobDashboardWidgetOverride.widget_id == widget_id,
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
        lob_id: str,
        template_id: str,
    ) -> LobAssignmentValidationResult:
        template = await self._load_template(db, template_id)
        if not template:
            return LobAssignmentValidationResult(
                valid=False,
                errors=[LobAssignmentValidationError(
                    code="TEMPLATE_NOT_FOUND",
                    message="Template not found",
                )],
            )

        existing_agg_result = await db.execute(
            select(LobAggregateMetric).where(LobAggregateMetric.lob_id == lob_id)
        )
        existing_rows = existing_agg_result.scalars().all()
        available_keys = {row.metric_key for row in existing_rows}

        if not available_keys:
            available_keys = set(LOB_AGGREGATE_METRIC_KEYS)

        errors: List[LobAssignmentValidationError] = []
        warnings: List[LobAssignmentValidationWarning] = []
        missing_metric_keys: set = set()
        total_bindings = 0
        satisfied_bindings = 0

        for widget in template.widgets:
            for binding in widget.metric_bindings:
                total_bindings += 1

                if binding.metric_source_scope == MetricSourceScope.LOB_AGGREGATE:
                    if binding.metric_key not in available_keys and binding.metric_key not in LOB_AGGREGATE_METRIC_KEYS:
                        missing_metric_keys.add(binding.metric_key)
                        warnings.append(LobAssignmentValidationWarning(
                            widget_id=widget.id,
                            widget_title=widget.title,
                            metric_key=binding.metric_key,
                            message=f"LOB aggregate metric '{binding.metric_key}' is not a known LOB aggregate key",
                        ))
                        continue
                    satisfied_bindings += 1
                else:
                    warnings.append(LobAssignmentValidationWarning(
                        widget_id=widget.id,
                        widget_title=widget.title,
                        metric_key=binding.metric_key,
                        message=f"Binding scope '{binding.metric_source_scope.value}' may not resolve at LOB level; lob_aggregate is recommended",
                    ))
                    total_bindings -= 1

        if total_bindings > 0 and satisfied_bindings == 0 and missing_metric_keys:
            errors.append(LobAssignmentValidationError(
                code="NO_RESOLVABLE_BINDINGS",
                message="No metric bindings can be resolved from LOB aggregate metrics.",
                details={"missing_keys": list(missing_metric_keys)},
            ))

        return LobAssignmentValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            missing_metric_keys=list(missing_metric_keys),
            satisfied_bindings=satisfied_bindings,
            total_bindings=total_bindings,
            available_metric_keys=list(available_keys or LOB_AGGREGATE_METRIC_KEYS),
        )

    # ─── Live Dashboard Rendering ───────────────────────────────────────────────

    async def render_live_dashboard(
        self,
        db: AsyncSession,
        lob_id: str,
        assignment_id: str,
    ) -> Optional[LobLiveDashboardResponse]:
        a_result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.id == assignment_id,
                LobDashboardAssignment.lob_id == lob_id,
            )
        )
        assignment = a_result.scalar_one_or_none()
        if not assignment:
            return None

        template = await self._load_template(db, assignment.template_id)
        if not template:
            return None

        overrides_result = await db.execute(
            select(LobDashboardWidgetOverride).where(
                LobDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        overrides_map: Dict[str, LobDashboardWidgetOverride] = {
            ov.widget_id: ov for ov in overrides_result.scalars().all()
        }

        lob_metrics = await self._fetch_lob_metrics(db, lob_id)

        lob_result = await db.execute(select(Lob).where(Lob.id == lob_id))
        lob = lob_result.scalar_one_or_none()

        widgets_data: List[LobLiveWidgetData] = []
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

            resolved_metrics = self._resolve_lob_bindings(widget.metric_bindings, lob_metrics)

            widgets_data.append(LobLiveWidgetData(
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

        portfolio_summary = await self._build_portfolio_summary(db, lob_id, lob, lob_metrics)
        dashboard_name = assignment.display_name or template.name

        return LobLiveDashboardResponse(
            assignment_id=assignment_id,
            lob_id=lob_id,
            template_id=template.id,
            dashboard_name=dashboard_name,
            template_name=template.name,
            refresh_interval_seconds=assignment.refresh_interval_seconds,
            rendered_at=datetime.utcnow().isoformat(),
            widgets=widgets_data,
            portfolio_summary=portfolio_summary,
        )

    def _resolve_lob_bindings(
        self,
        bindings: List[WidgetMetricBinding],
        lob_metrics: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        resolved = []
        for b in sorted(bindings, key=lambda x: x.sort_order):
            key = b.metric_key
            scope = b.metric_source_scope

            if scope == MetricSourceScope.LOB_AGGREGATE:
                metric_data = lob_metrics.get(key)
                value = metric_data.get("value") if metric_data else None
                computed_at = metric_data.get("last_computed_at") if metric_data else None

                resolved.append({
                    "binding_id": b.id,
                    "metric_key": key,
                    "label": b.display_label or _LABEL_MAP.get(key, key.replace("_", " ").title()),
                    "aggregation_mode": b.aggregation_mode.value,
                    "value": value,
                    "unit": _UNIT_MAP.get(key),
                    "trend": [],
                    "color": b.color_override,
                    "source": "lob_aggregate",
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
                    "note": f"Scope '{scope.value}' not directly resolvable at LOB level",
                })

        return resolved

    async def _fetch_lob_metrics(
        self, db: AsyncSession, lob_id: str
    ) -> Dict[str, Any]:
        result = await db.execute(
            select(LobAggregateMetric).where(LobAggregateMetric.lob_id == lob_id)
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

    async def _build_portfolio_summary(
        self,
        db: AsyncSession,
        lob_id: str,
        lob: Optional[Lob],
        lob_metrics: Dict[str, Any],
    ) -> LobPortfolioSummary:
        def _val(key: str) -> float:
            m = lob_metrics.get(key)
            return m["value"] if m and m["value"] is not None else 0.0

        computed_at = max(
            (m["last_computed_at"] for m in lob_metrics.values() if m.get("last_computed_at")),
            default=None,
        )

        return LobPortfolioSummary(
            lob_id=lob_id,
            lob_name=lob.name if lob else lob_id,
            lob_color=lob.color if lob else None,
            team_count=_val("team_count"),
            total_projects=_val("total_projects"),
            critical_projects_count=_val("critical_projects_count"),
            critical_teams_count=_val("critical_teams_count"),
            avg_team_health=_val("avg_team_health"),
            avg_project_health=_val("avg_project_health"),
            portfolio_availability=_val("portfolio_availability"),
            total_incidents=_val("total_incidents"),
            sla_breach_rate=_val("sla_breach_rate"),
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
    ) -> List[LobWidgetOverrideResponse]:
        result = await db.execute(
            select(LobDashboardWidgetOverride).where(
                LobDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        return [LobWidgetOverrideResponse.model_validate(ov) for ov in result.scalars().all()]

    async def _clear_defaults(self, db: AsyncSession, lob_id: str) -> None:
        result = await db.execute(
            select(LobDashboardAssignment).where(
                LobDashboardAssignment.lob_id == lob_id,
                LobDashboardAssignment.is_default == True,
            )
        )
        for a in result.scalars().all():
            a.is_default = False
            a.updated_at = datetime.utcnow()
        await db.flush()

    def _to_response(
        self,
        assignment: LobDashboardAssignment,
        template: Optional[DashboardTemplate],
        overrides: List[LobWidgetOverrideResponse],
    ) -> LobAssignmentResponse:
        return LobAssignmentResponse(
            id=assignment.id,
            lob_id=assignment.lob_id,
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


lob_dashboard_assignment_service = LobDashboardAssignmentService()
