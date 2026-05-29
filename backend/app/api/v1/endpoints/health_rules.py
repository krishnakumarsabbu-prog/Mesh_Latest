"""
Health Rules API Endpoints.

Provides CRUD operations, status management, validation, and rule testing
for configurable health rules.

Endpoints:
  GET    /rules                  - List rules (filterable, paginated)
  POST   /rules                  - Create a new rule
  GET    /rules/{rule_id}        - Get a rule by ID
  PUT    /rules/{rule_id}        - Update a rule
  DELETE /rules/{rule_id}        - Archive (soft-delete) a rule
  PATCH  /rules/{rule_id}/status - Enable/disable/draft a rule
  POST   /rules/validate         - Validate without saving
  POST   /rules/test             - Test rule against sample payload
  GET    /rules/metadata         - Return operator/metric metadata for UI
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.services.audit_service import audit_service
from app.schemas.health_rule import (
    HealthRuleCreate,
    HealthRuleListResponse,
    HealthRuleResponse,
    HealthRuleStatusUpdate,
    HealthRuleUpdate,
    RuleTestRequest,
    RuleTestResponse,
    RuleValidationResponse,
    ValidationErrorDetail,
)
from app.services.health_rule_service import health_rule_service
from app.services.health_rule_test_service import health_rule_test_service
from app.services.rule_engine.validator import validate_rule_definition

router = APIRouter(prefix="/rules", tags=["Health Rules"])
logger = logging.getLogger("healthmesh.api.rules")


@router.get("/metadata", response_model=Dict[str, Any])
async def get_rule_metadata(
    _current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return available metric types, operators, severities, actions, and scopes.

    Used by the frontend rule builder to populate dropdowns.
    """
    return {
        "metric_types": [
            {"value": "health_status", "label": "Health Status", "data_type": "string"},
            {"value": "health_score", "label": "Health Score (0-100)", "data_type": "numeric"},
            {"value": "response_time_ms", "label": "Response Time (ms)", "data_type": "numeric"},
            {"value": "availability_pct", "label": "Availability %", "data_type": "numeric"},
            {"value": "sla_pct", "label": "SLA Compliance %", "data_type": "numeric"},
            {"value": "consecutive_failures", "label": "Consecutive Failures", "data_type": "numeric"},
            {"value": "error_rate", "label": "Error Rate (0.0-1.0)", "data_type": "numeric"},
            {"value": "incident_count", "label": "Incident Count", "data_type": "numeric"},
            {"value": "uptime_pct", "label": "Uptime %", "data_type": "numeric"},
            {"value": "custom_metric", "label": "Custom Metric", "data_type": "numeric"},
        ],
        "operators": [
            {"value": "gt", "label": "> Greater Than", "data_types": ["numeric"]},
            {"value": "gte", "label": ">= Greater Than or Equal", "data_types": ["numeric"]},
            {"value": "lt", "label": "< Less Than", "data_types": ["numeric"]},
            {"value": "lte", "label": "<= Less Than or Equal", "data_types": ["numeric"]},
            {"value": "eq", "label": "== Equal", "data_types": ["numeric", "string"]},
            {"value": "neq", "label": "!= Not Equal", "data_types": ["numeric", "string"]},
            {"value": "in_range", "label": "In Range [min, max]", "data_types": ["numeric"]},
            {"value": "not_in_range", "label": "Not In Range", "data_types": ["numeric"]},
            {"value": "contains", "label": "Contains", "data_types": ["string"]},
            {"value": "not_contains", "label": "Does Not Contain", "data_types": ["string"]},
            {"value": "is_true", "label": "Is True", "data_types": ["boolean"]},
            {"value": "is_false", "label": "Is False", "data_types": ["boolean"]},
        ],
        "severities": [
            {"value": "critical", "label": "Critical", "color": "#DC2626"},
            {"value": "high", "label": "High", "color": "#EA580C"},
            {"value": "medium", "label": "Medium", "color": "#D97706"},
            {"value": "low", "label": "Low", "color": "#65A30D"},
            {"value": "info", "label": "Info", "color": "#0284C7"},
        ],
        "actions": [
            {
                "value": "apply_penalty",
                "label": "Apply Score Penalty",
                "description": "Subtract points from health score",
                "requires_value": True,
                "value_label": "Penalty Points",
            },
            {
                "value": "apply_bonus",
                "label": "Apply Score Bonus",
                "description": "Add points to health score",
                "requires_value": True,
                "value_label": "Bonus Points",
            },
            {
                "value": "override_status",
                "label": "Override Health Status",
                "description": "Force a specific health status when triggered",
                "requires_status": True,
            },
            {
                "value": "flag_incident",
                "label": "Flag as Incident",
                "description": "Mark as an incident event in the audit log",
                "requires_value": False,
            },
            {
                "value": "notify",
                "label": "Notify Only",
                "description": "Trigger notification without score change",
                "requires_value": False,
            },
        ],
        "scopes": [
            {"value": "global", "label": "Global (all projects)"},
            {"value": "project", "label": "Project-specific"},
            {"value": "connector", "label": "Connector-specific"},
            {"value": "metric", "label": "Metric-specific"},
        ],
        "statuses": [
            {"value": "active", "label": "Active"},
            {"value": "inactive", "label": "Inactive"},
            {"value": "draft", "label": "Draft"},
            {"value": "archived", "label": "Archived"},
        ],
        "logic_groups": [
            {"value": "and", "label": "AND (all conditions must match)"},
            {"value": "or", "label": "OR (any condition must match)"},
        ],
        "health_status_values": [
            "healthy", "degraded", "down", "timeout", "error", "unknown", "skipped"
        ],
    }


@router.get("", response_model=HealthRuleListResponse)
async def list_rules(
    scope: Optional[str] = Query(None, description="Filter by scope"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    status: Optional[str] = Query(None, description="Filter by status"),
    project_id: Optional[str] = Query(None, description="Filter by project assignment"),
    connector_id: Optional[str] = Query(None, description="Filter by connector assignment"),
    search: Optional[str] = Query(None, description="Search in name, description, tags"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> HealthRuleListResponse:
    """List all health rules with optional filtering and pagination."""
    rules, total = await health_rule_service.list_rules(
        db=db,
        scope=scope,
        severity=severity,
        status=status,
        project_id=project_id,
        connector_id=connector_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    return HealthRuleListResponse(
        items=[HealthRuleResponse.from_orm_rule(r) for r in rules],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.post("", response_model=HealthRuleResponse, status_code=201)
async def create_rule(
    payload: HealthRuleCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HealthRuleResponse:
    """Create a new health rule with conditions."""
    try:
        rule = await health_rule_service.create_rule(
            db=db, payload=payload, created_by=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await audit_service.log(
        db, action="rule.create", resource_type="health_rule", resource_id=rule.id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"name": rule.name, "severity": str(rule.severity), "scope": str(rule.scope)},
    )
    return HealthRuleResponse.from_orm_rule(rule)


@router.post("/validate", response_model=RuleValidationResponse)
async def validate_rule(
    payload: HealthRuleCreate,
    _current_user: User = Depends(get_current_user),
) -> RuleValidationResponse:
    """Validate a rule definition without persisting it."""
    conditions_dicts = [c.model_dump() for c in payload.conditions]
    result = validate_rule_definition(
        name=payload.name,
        scope=payload.scope,
        action=payload.action,
        action_value=payload.action_value,
        action_status_override=payload.action_status_override,
        conditions=conditions_dicts,
        project_id=payload.project_id,
        connector_id=payload.connector_id,
    )
    return RuleValidationResponse(
        valid=result.valid,
        errors=[
            ValidationErrorDetail(
                field=e.field,
                message=e.message,
                condition_index=e.condition_index,
            )
            for e in result.errors
        ],
        warnings=result.warnings,
    )


@router.post("/test", response_model=RuleTestResponse)
async def test_rule(
    request: RuleTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RuleTestResponse:
    """
    Test a rule against a sample payload without running a full health check.

    Accepts either a rule_id (load existing) or rule_definition (inline).
    Returns per-condition evaluation details and the resulting score impact.
    """
    try:
        result = await health_rule_test_service.test_rule(
            db=db, request=request, tested_by=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


@router.get("/{rule_id}", response_model=HealthRuleResponse)
async def get_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    _current_user: User = Depends(get_current_user),
) -> HealthRuleResponse:
    """Get a rule by ID including all conditions and assignments."""
    rule = await health_rule_service.get_rule(db, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    return HealthRuleResponse.from_orm_rule(rule)


@router.put("/{rule_id}", response_model=HealthRuleResponse)
async def update_rule(
    rule_id: str,
    payload: HealthRuleUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HealthRuleResponse:
    """Update an existing rule. Providing conditions replaces all existing conditions."""
    try:
        rule = await health_rule_service.update_rule(
            db=db, rule_id=rule_id, payload=payload, updated_by=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=404 if "not found" in str(exc) else 422, detail=str(exc))
    await audit_service.log(
        db, action="rule.update", resource_type="health_rule", resource_id=rule_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=payload.model_dump(exclude_none=True, exclude={"conditions"}),
    )
    return HealthRuleResponse.from_orm_rule(rule)


@router.patch("/{rule_id}/status", response_model=HealthRuleResponse)
async def update_rule_status(
    rule_id: str,
    payload: HealthRuleStatusUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HealthRuleResponse:
    """Enable, disable, or change the lifecycle status of a rule."""
    try:
        rule = await health_rule_service.set_rule_status(
            db=db, rule_id=rule_id, new_status=payload.status, updated_by=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=404 if "not found" in str(exc) else 422, detail=str(exc))
    await audit_service.log(
        db, action="rule.status_change", resource_type="health_rule", resource_id=rule_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"status": payload.status},
    )
    return HealthRuleResponse.from_orm_rule(rule)


@router.delete("/{rule_id}", status_code=200)
async def delete_rule(
    rule_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Archive (soft-delete) a rule. System rules cannot be deleted."""
    try:
        deleted = await health_rule_service.delete_rule(
            db=db, rule_id=rule_id, deleted_by=current_user.id
        )
    except ValueError as exc:
        raise HTTPException(status_code=403, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail=f"Rule '{rule_id}' not found")
    await audit_service.log(
        db, action="rule.delete", resource_type="health_rule", resource_id=rule_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )
    return {"deleted": True}


@router.post("/evaluate-assets", response_model=dict)
async def evaluate_rules_against_runtime_assets(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """
    POST /rules/evaluate-assets

    Evaluate all active rules against live runtime asset data.
    Body:
      {
        "project_id": "optional-project-id",
        "connector_id": "optional-connector-id",
        "availability_pct": 85.0,
        "health_score": 55.0,
        "error_rate": 0.25,
        "consecutive_failures": 4,
        "uptime_pct": 92.0,
        "sla_pct": 97.5
      }

    Returns triggered rules with score impacts and explanations.
    """
    from app.services.health_rule_service import health_rule_service
    from app.services.rule_engine.engine import RuleEngine
    from app.services.rule_engine.context import RuleEvaluationContext
    from sqlalchemy import select
    from app.models.health_rule import HealthRule, RuleStatus

    project_id = data.get("project_id", "runtime-eval")
    connector_id = data.get("connector_id")

    # Load all active rules
    rules_result = await db.execute(
        select(HealthRule).where(HealthRule.status == RuleStatus.ACTIVE)
    )
    active_rules = rules_result.scalars().all()

    if not active_rules:
        return {
            "rules_evaluated": 0,
            "rules_matched": 0,
            "triggered_rules": [],
            "total_score_impact": 0.0,
            "explanation_lines": ["No active rules found"],
        }

    context = RuleEvaluationContext(
        project_id=project_id,
        connector_id=connector_id,
        health_score=data.get("health_score"),
        availability_pct=data.get("availability_pct"),
        sla_pct=data.get("sla_pct"),
        consecutive_failures=data.get("consecutive_failures"),
        error_rate=data.get("error_rate"),
        uptime_pct=data.get("uptime_pct"),
        health_status=data.get("health_status"),
        response_time_ms=data.get("response_time_ms"),
        incident_count=data.get("incident_count"),
    )

    engine = RuleEngine()
    result = engine.evaluate(active_rules, context)

    return {
        "rules_evaluated": result.rules_evaluated,
        "rules_matched": result.rules_matched,
        "total_score_impact": result.total_score_impact,
        "status_override": result.status_override,
        "explanation_lines": result.explanation_lines,
        "triggered_rules": [
            {
                "rule_id": r.rule_id,
                "rule_name": r.rule_name,
                "rule_severity": r.rule_severity,
                "rule_action": r.rule_action,
                "matched": r.matched,
                "score_impact": r.score_impact,
                "status_override": r.status_override,
                "explanation": r.explanation,
            }
            for r in result.triggered_rules
        ],
    }
