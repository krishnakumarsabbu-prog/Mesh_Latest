"""
Project Dashboard Assignment Service.

Handles:
- Assigning/unassigning dashboard templates to projects
- Reordering assignments and setting the default
- Validation engine: connector type checks, metric availability checks
- Live dashboard rendering: resolving widget metric bindings to real metric values
- Project-level overrides (rename, hide widgets, reorder, threshold overrides)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.dashboard_template import DashboardTemplate, DashboardWidget, WidgetMetricBinding, AggregationMode
from app.models.health_run import HealthRun, HealthRunMetric, HealthRunStatus, RunHealthStatus
from app.models.project import Project
from app.models.project_connector import ProjectConnector
from app.models.project_connector_metric import ProjectConnectorMetric
from app.models.project_dashboard_assignment import ProjectDashboardAssignment, ProjectDashboardWidgetOverride
from app.schemas.project_dashboard_assignment import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    AssignmentValidationResult,
    LiveDashboardResponse,
    LiveWidgetData,
    ValidationError,
    ValidationWarning,
    WidgetOverrideCreate,
    WidgetOverrideResponse,
)

logger = logging.getLogger("healthmesh.dashboard_assignment")


class ProjectDashboardAssignmentService:

    # ─── Assignment CRUD ────────────────────────────────────────────────────────

    async def list_assignments(
        self, db: AsyncSession, project_id: str
    ) -> List[AssignmentResponse]:
        result = await db.execute(
            select(ProjectDashboardAssignment)
            .where(ProjectDashboardAssignment.project_id == project_id)
            .order_by(ProjectDashboardAssignment.sort_order)
        )
        assignments = result.scalars().all()

        responses = []
        for a in assignments:
            template = await self._load_template(db, a.template_id)
            overrides = await self._load_overrides(db, a.id)
            responses.append(self._to_response(a, template, overrides))
        return responses

    async def get_assignment(
        self, db: AsyncSession, project_id: str, assignment_id: str
    ) -> Optional[AssignmentResponse]:
        result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
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
        project_id: str,
        data: AssignmentCreate,
        user_id: Optional[str],
    ) -> AssignmentResponse:
        existing = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.project_id == project_id,
                ProjectDashboardAssignment.template_id == data.template_id,
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError("Template is already assigned to this project")

        max_order_result = await db.execute(
            select(ProjectDashboardAssignment.sort_order)
            .where(ProjectDashboardAssignment.project_id == project_id)
            .order_by(desc(ProjectDashboardAssignment.sort_order))
            .limit(1)
        )
        row = max_order_result.scalar_one_or_none()
        next_order = (row or 0) + 1

        if data.is_default:
            await self._clear_defaults(db, project_id)

        assignment = ProjectDashboardAssignment(
            project_id=project_id,
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
        project_id: str,
        assignment_id: str,
        data: AssignmentUpdate,
    ) -> Optional[AssignmentResponse]:
        result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
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
                await self._clear_defaults(db, project_id)
            a.is_default = data.is_default
        a.updated_at = datetime.utcnow()

        await db.flush()
        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def set_default(
        self, db: AsyncSession, project_id: str, assignment_id: str
    ) -> Optional[AssignmentResponse]:
        result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return None

        await self._clear_defaults(db, project_id)
        a.is_default = True
        a.updated_at = datetime.utcnow()
        await db.flush()

        template = await self._load_template(db, a.template_id)
        overrides = await self._load_overrides(db, a.id)
        return self._to_response(a, template, overrides)

    async def reorder_assignments(
        self, db: AsyncSession, project_id: str, ordered_ids: List[str]
    ) -> List[AssignmentResponse]:
        result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.project_id == project_id
            )
        )
        assignments = {a.id: a for a in result.scalars().all()}

        for idx, aid in enumerate(ordered_ids):
            if aid in assignments:
                assignments[aid].sort_order = idx
                assignments[aid].updated_at = datetime.utcnow()

        await db.flush()
        return await self.list_assignments(db, project_id)

    async def remove_assignment(
        self, db: AsyncSession, project_id: str, assignment_id: str
    ) -> bool:
        result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
            )
        )
        a = result.scalar_one_or_none()
        if not a:
            return False

        override_result = await db.execute(
            select(ProjectDashboardWidgetOverride).where(
                ProjectDashboardWidgetOverride.assignment_id == assignment_id
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
        project_id: str,
        assignment_id: str,
        data: WidgetOverrideCreate,
    ) -> Optional[WidgetOverrideResponse]:
        a_result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
            )
        )
        if not a_result.scalar_one_or_none():
            return None

        ov_result = await db.execute(
            select(ProjectDashboardWidgetOverride).where(
                ProjectDashboardWidgetOverride.assignment_id == assignment_id,
                ProjectDashboardWidgetOverride.widget_id == data.widget_id,
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
            ov = ProjectDashboardWidgetOverride(
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
        return WidgetOverrideResponse.model_validate(ov)

    async def delete_widget_override(
        self,
        db: AsyncSession,
        project_id: str,
        assignment_id: str,
        widget_id: str,
    ) -> bool:
        a_result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
            )
        )
        if not a_result.scalar_one_or_none():
            return False

        ov_result = await db.execute(
            select(ProjectDashboardWidgetOverride).where(
                ProjectDashboardWidgetOverride.assignment_id == assignment_id,
                ProjectDashboardWidgetOverride.widget_id == widget_id,
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
        project_id: str,
        template_id: str,
    ) -> AssignmentValidationResult:
        template = await self._load_template(db, template_id)
        if not template:
            return AssignmentValidationResult(
                valid=False,
                errors=[ValidationError(code="TEMPLATE_NOT_FOUND", message="Template not found")],
            )

        pc_result = await db.execute(
            select(ProjectConnector)
            .where(
                ProjectConnector.project_id == project_id,
                ProjectConnector.is_enabled == True,
            )
        )
        project_connectors = pc_result.scalars().all()

        pcm_result = await db.execute(
            select(ProjectConnectorMetric)
            .where(
                ProjectConnectorMetric.project_connector_id.in_([pc.id for pc in project_connectors]),
                ProjectConnectorMetric.is_enabled == True,
            )
            .options(selectinload(ProjectConnectorMetric.metric_template))
        )
        project_metrics = pcm_result.scalars().all()

        enabled_metric_keys = {
            pm.metric_template.metric_key
            for pm in project_metrics
            if pm.metric_template
        }

        catalog_result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.project_id == project_id, ProjectConnector.is_enabled == True)
        )
        pcs_with_catalog = catalog_result.scalars().all()
        enabled_connector_slugs = {
            pc.catalog_entry.slug
            for pc in pcs_with_catalog
            if pc.catalog_entry
        }

        errors: List[ValidationError] = []
        warnings: List[ValidationWarning] = []
        missing_connector_types: set = set()
        missing_metric_keys: set = set()
        total_bindings = 0
        satisfied_bindings = 0

        for widget in template.widgets:
            for binding in widget.metric_bindings:
                total_bindings += 1

                if binding.connector_type and binding.connector_type not in enabled_connector_slugs:
                    missing_connector_types.add(binding.connector_type)
                    warnings.append(ValidationWarning(
                        widget_id=widget.id,
                        widget_title=widget.title,
                        metric_key=binding.metric_key,
                        connector_type=binding.connector_type,
                        message=f"Connector type '{binding.connector_type}' is not configured in this project",
                    ))
                    continue

                if binding.metric_key not in enabled_metric_keys:
                    missing_metric_keys.add(binding.metric_key)
                    warnings.append(ValidationWarning(
                        widget_id=widget.id,
                        widget_title=widget.title,
                        metric_key=binding.metric_key,
                        connector_type=binding.connector_type,
                        message=f"Metric '{binding.metric_key}' is not enabled in this project",
                    ))
                    continue

                satisfied_bindings += 1

        if len(missing_connector_types) == len({
            b.connector_type
            for w in template.widgets for b in w.metric_bindings
            if b.connector_type
        }) and total_bindings > 0 and satisfied_bindings == 0:
            errors.append(ValidationError(
                code="NO_COMPATIBLE_CONNECTORS",
                message="No compatible connectors found. This dashboard requires connectors that are not configured.",
                details={"required": list(missing_connector_types)},
            ))

        valid = len(errors) == 0
        return AssignmentValidationResult(
            valid=valid,
            errors=errors,
            warnings=warnings,
            missing_connector_types=list(missing_connector_types),
            missing_metric_keys=list(missing_metric_keys),
            satisfied_bindings=satisfied_bindings,
            total_bindings=total_bindings,
        )

    # ─── Live Dashboard Rendering ───────────────────────────────────────────────

    async def render_live_dashboard(
        self,
        db: AsyncSession,
        project_id: str,
        assignment_id: str,
        time_range_hours: int = 24,
    ) -> Optional[LiveDashboardResponse]:
        a_result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.id == assignment_id,
                ProjectDashboardAssignment.project_id == project_id,
            )
        )
        assignment = a_result.scalar_one_or_none()
        if not assignment:
            return None

        template = await self._load_template(db, assignment.template_id)
        if not template:
            return None

        overrides_result = await db.execute(
            select(ProjectDashboardWidgetOverride).where(
                ProjectDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        overrides_map: Dict[str, ProjectDashboardWidgetOverride] = {
            ov.widget_id: ov for ov in overrides_result.scalars().all()
        }

        live_metrics = await self._fetch_live_metrics(db, project_id, time_range_hours)

        project_result = await db.execute(select(Project).where(Project.id == project_id))
        project = project_result.scalar_one_or_none()

        widgets_data: List[LiveWidgetData] = []
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

            resolved_metrics = self._resolve_bindings(widget.metric_bindings, live_metrics)

            widgets_data.append(LiveWidgetData(
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

        from app.services.project_dashboard_service import project_dashboard_service
        project_summary = await project_dashboard_service.get_project_summary(db, project_id)

        dashboard_name = assignment.display_name or template.name

        return LiveDashboardResponse(
            assignment_id=assignment_id,
            project_id=project_id,
            template_id=template.id,
            dashboard_name=dashboard_name,
            template_name=template.name,
            refresh_interval_seconds=assignment.refresh_interval_seconds,
            rendered_at=datetime.utcnow().isoformat(),
            widgets=widgets_data,
            project_summary=project_summary,
        )

    def _resolve_bindings(
        self,
        bindings: List[WidgetMetricBinding],
        live_metrics: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        resolved = []
        for b in sorted(bindings, key=lambda x: x.sort_order):
            key = b.metric_key
            connector_filter = b.connector_type

            matching_series = []
            for series_key, series_data in live_metrics.items():
                connector_name = series_data.get("connector", "")
                metric_name = series_data.get("metric_name", "")

                if metric_name == key or series_key.endswith(f"::{key}"):
                    if connector_filter and connector_filter not in (connector_name or "").lower():
                        continue
                    matching_series.append(series_data)

            if not matching_series:
                resolved.append({
                    "binding_id": b.id,
                    "metric_key": key,
                    "label": b.display_label or key,
                    "connector_type": connector_filter,
                    "aggregation_mode": b.aggregation_mode.value,
                    "value": None,
                    "unit": None,
                    "trend": [],
                    "color": b.color_override,
                })
                continue

            series = matching_series[0]
            data_points = series.get("data_points", [])

            value = self._aggregate(data_points, b.aggregation_mode)
            trend = [{"t": dp.get("timestamp"), "v": dp.get("value")} for dp in data_points[-30:]]

            resolved.append({
                "binding_id": b.id,
                "metric_key": key,
                "label": b.display_label or series.get("metric_name", key),
                "connector": series.get("connector"),
                "connector_type": connector_filter,
                "aggregation_mode": b.aggregation_mode.value,
                "value": value,
                "latest_value": series.get("latest_value"),
                "avg_value": series.get("avg_value"),
                "min_value": series.get("min_value"),
                "max_value": series.get("max_value"),
                "unit": series.get("unit"),
                "trend": trend,
                "color": b.color_override,
                "description": series.get("description"),
            })

        return resolved

    def _aggregate(self, data_points: List[Dict], mode: AggregationMode) -> Optional[float]:
        values = [dp["value"] for dp in data_points if dp.get("value") is not None]
        if not values:
            return None
        if mode == AggregationMode.LATEST:
            return values[-1]
        if mode == AggregationMode.AVG:
            return round(sum(values) / len(values), 4)
        if mode == AggregationMode.SUM:
            return sum(values)
        if mode == AggregationMode.MIN:
            return min(values)
        if mode == AggregationMode.MAX:
            return max(values)
        if mode == AggregationMode.COUNT:
            return float(len(values))
        if mode == AggregationMode.P95:
            sorted_vals = sorted(values)
            idx = max(0, int(len(sorted_vals) * 0.95) - 1)
            return sorted_vals[idx]
        if mode == AggregationMode.P99:
            sorted_vals = sorted(values)
            idx = max(0, int(len(sorted_vals) * 0.99) - 1)
            return sorted_vals[idx]
        return values[-1]

    async def _fetch_live_metrics(
        self,
        db: AsyncSession,
        project_id: str,
        hours: int,
    ) -> Dict[str, Any]:
        since = datetime.utcnow() - timedelta(hours=hours)

        run_ids_result = await db.execute(
            select(HealthRun.id)
            .where(
                HealthRun.project_id == project_id,
                HealthRun.started_at >= since,
            )
            .order_by(HealthRun.started_at)
        )
        run_ids = [r[0] for r in run_ids_result.all()]

        if not run_ids:
            return {}

        metrics_result = await db.execute(
            select(HealthRunMetric).where(
                HealthRunMetric.health_run_id.in_(run_ids)
            ).order_by(HealthRunMetric.captured_at)
        )
        metrics = metrics_result.scalars().all()

        grouped: Dict[str, Dict[str, Any]] = {}
        for m in metrics:
            key = f"{m.connector_name or 'unknown'}::{m.metric_name}"
            if key not in grouped:
                grouped[key] = {
                    "connector": m.connector_name,
                    "metric_name": m.metric_name,
                    "unit": m.metric_unit,
                    "description": m.metric_description,
                    "data_points": [],
                }
            grouped[key]["data_points"].append({
                "timestamp": m.captured_at.isoformat() if m.captured_at else None,
                "value": m.metric_value,
            })

        for key, series in grouped.items():
            pts = series["data_points"]
            vals = [p["value"] for p in pts if p["value"] is not None]
            series["latest_value"] = vals[-1] if vals else None
            series["avg_value"] = round(sum(vals) / len(vals), 4) if vals else None
            series["min_value"] = min(vals) if vals else None
            series["max_value"] = max(vals) if vals else None

        return grouped

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
    ) -> List[WidgetOverrideResponse]:
        result = await db.execute(
            select(ProjectDashboardWidgetOverride).where(
                ProjectDashboardWidgetOverride.assignment_id == assignment_id
            )
        )
        return [WidgetOverrideResponse.model_validate(ov) for ov in result.scalars().all()]

    async def _clear_defaults(self, db: AsyncSession, project_id: str) -> None:
        result = await db.execute(
            select(ProjectDashboardAssignment).where(
                ProjectDashboardAssignment.project_id == project_id,
                ProjectDashboardAssignment.is_default == True,
            )
        )
        for a in result.scalars().all():
            a.is_default = False
            a.updated_at = datetime.utcnow()
        await db.flush()

    def _to_response(
        self,
        assignment: ProjectDashboardAssignment,
        template: Optional[DashboardTemplate],
        overrides: List[WidgetOverrideResponse],
    ) -> AssignmentResponse:
        return AssignmentResponse(
            id=assignment.id,
            project_id=assignment.project_id,
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


project_dashboard_assignment_service = ProjectDashboardAssignmentService()
