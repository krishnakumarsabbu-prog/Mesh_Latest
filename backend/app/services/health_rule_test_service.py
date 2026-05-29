"""
Health Rule Test/Preview Service.

Allows rules to be evaluated against a sample payload without triggering
a real health run. Supports:
  - Testing an existing rule by ID
  - Testing an inline rule definition without saving
  - Persisting test run records for audit/history
  - Returning detailed condition-level breakdowns for explainability
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.health_rule import (
    ConditionLogicGroup,
    ConditionMetricType,
    ConditionOperator,
    HealthRule,
    HealthRuleCondition,
    HealthRuleTestRun,
    RuleAction,
    RuleAuditAction,
    RuleScope,
    RuleSeverity,
    RuleStatus,
)
from app.schemas.health_rule import (
    ConditionTestDetail,
    HealthRuleCreate,
    RuleTestRequest,
    RuleTestResponse,
)
from app.services.rule_engine.context import RuleEvaluationContext
from app.services.rule_engine.engine import RuleEngine
from app.services.rule_engine.validator import validate_rule_definition

logger = logging.getLogger("healthmesh.rule_test_service")

_rule_engine = RuleEngine()


def _build_context_from_payload(payload: Dict[str, Any]) -> RuleEvaluationContext:
    """
    Convert a sample payload dict into a RuleEvaluationContext.

    Handles optional fields and type coercion gracefully.
    """
    custom_metrics: Dict[str, Any] = payload.get("custom_metrics", {})
    extra: Dict[str, Any] = payload.get("extra", {})

    def _to_float(val: Any) -> Optional[float]:
        if val is None:
            return None
        try:
            return float(val)
        except (ValueError, TypeError):
            return None

    def _to_int(val: Any) -> Optional[int]:
        if val is None:
            return None
        try:
            return int(val)
        except (ValueError, TypeError):
            return None

    return RuleEvaluationContext(
        project_id=payload.get("project_id", "test-project"),
        connector_id=payload.get("connector_id"),
        health_status=payload.get("health_status"),
        health_score=_to_float(payload.get("health_score")),
        response_time_ms=_to_float(payload.get("response_time_ms")),
        availability_pct=_to_float(payload.get("availability_pct")),
        sla_pct=_to_float(payload.get("sla_pct")),
        consecutive_failures=_to_int(payload.get("consecutive_failures")),
        error_rate=_to_float(payload.get("error_rate")),
        incident_count=_to_int(payload.get("incident_count")),
        uptime_pct=_to_float(payload.get("uptime_pct")),
        custom_metrics=custom_metrics,
        extra=extra,
    )


def _build_transient_rule(definition: HealthRuleCreate) -> HealthRule:
    """
    Build an in-memory HealthRule ORM object from a create payload.

    The resulting object is NOT persisted; it is used only for test evaluation.
    Conditions are attached as HealthRuleCondition objects.
    """
    rule = HealthRule(
        id=f"test-{uuid.uuid4().hex[:8]}",
        name=definition.name,
        description=definition.description,
        slug=f"test-{uuid.uuid4().hex[:8]}",
        scope=RuleScope(definition.scope),
        severity=RuleSeverity(definition.severity),
        status=RuleStatus.ACTIVE,
        action=RuleAction(definition.action),
        logic_group=ConditionLogicGroup(definition.logic_group),
        action_value=definition.action_value,
        action_status_override=definition.action_status_override,
        priority_weight=definition.priority_weight,
        score_impact=definition.score_impact,
        is_system=False,
        version=1,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    conditions: List[HealthRuleCondition] = []
    for idx, cond_data in enumerate(definition.conditions):
        cond = HealthRuleCondition(
            id=f"test-cond-{idx}",
            rule_id=rule.id,
            metric_type=ConditionMetricType(cond_data.metric_type),
            metric_key=cond_data.metric_key,
            operator=ConditionOperator(cond_data.operator),
            threshold_value=cond_data.threshold_value,
            threshold_value_max=cond_data.threshold_value_max,
            string_value=cond_data.string_value,
            description=cond_data.description,
            display_order=cond_data.display_order if cond_data.display_order is not None else idx,
            created_at=datetime.utcnow(),
        )
        conditions.append(cond)

    rule.conditions = conditions
    rule.assignments = []
    return rule


class HealthRuleTestService:
    """
    Evaluates rules against sample payloads for testing and preview.

    Supports both existing rules (by ID) and inline rule definitions.
    Persists test run records for audit history when a rule_id is provided.
    """

    async def test_rule(
        self,
        db: AsyncSession,
        request: RuleTestRequest,
        tested_by: Optional[str] = None,
    ) -> RuleTestResponse:
        """
        Evaluate a rule against a sample payload.

        Either rule_id (load existing rule) or rule_definition (inline) must be provided.

        Args:
            db: Async database session
            request: Test request with sample payload and rule spec
            tested_by: User ID performing the test

        Returns:
            RuleTestResponse with evaluation results and per-condition breakdown

        Raises:
            ValueError: If neither rule_id nor rule_definition is provided
        """
        warnings: List[str] = []
        rule: Optional[HealthRule] = None

        if request.rule_id:
            from app.services.health_rule_service import health_rule_service
            rule = await health_rule_service.get_rule(db, request.rule_id)
            if not rule:
                raise ValueError(f"Rule '{request.rule_id}' not found")

        elif request.rule_definition:
            conditions_dicts = [c.model_dump() for c in request.rule_definition.conditions]
            validation = validate_rule_definition(
                name=request.rule_definition.name,
                scope=request.rule_definition.scope,
                action=request.rule_definition.action,
                action_value=request.rule_definition.action_value,
                action_status_override=request.rule_definition.action_status_override,
                conditions=conditions_dicts,
            )
            if not validation.valid:
                errors = "; ".join(f"{e.field}: {e.message}" for e in validation.errors)
                raise ValueError(f"Inline rule definition is invalid: {errors}")

            warnings.extend(validation.warnings)
            rule = _build_transient_rule(request.rule_definition)

        else:
            raise ValueError("Either rule_id or rule_definition must be provided")

        context = _build_context_from_payload(request.sample_payload)

        rule_set_result = _rule_engine.evaluate([rule], context)

        rule_result = rule_set_result.all_results[0] if rule_set_result.all_results else None
        if not rule_result:
            raise ValueError("Rule evaluation produced no result")

        condition_details = [
            ConditionTestDetail(
                condition_id=c.condition_id if not c.condition_id.startswith("test-") else None,
                metric_type=c.metric_type,
                metric_key=c.metric_key,
                operator=c.operator,
                threshold_value=c.threshold_value,
                threshold_value_max=c.threshold_value_max,
                actual_value=c.actual_value,
                matched=c.matched,
                explanation=c.explanation,
            )
            for c in rule_result.condition_details
        ]

        test_run_id: Optional[str] = None
        if request.rule_id and rule:
            test_run_id = await self._persist_test_run(
                db=db,
                rule_id=rule.id,
                input_payload=request.sample_payload,
                rule_result=rule_result,
                tested_by=tested_by,
            )

        logger.info(
            "Rule test complete: rule='%s' matched=%s impact=%s",
            rule.name,
            rule_result.matched,
            rule_result.score_impact,
        )

        return RuleTestResponse(
            rule_id=request.rule_id,
            rule_name=rule.name,
            matched=rule_result.matched,
            logic_group=rule_result.logic_group,
            score_impact=rule_result.score_impact,
            status_override=rule_result.status_override,
            explanation=rule_result.explanation,
            condition_details=condition_details,
            warnings=warnings,
            persisted_test_run_id=test_run_id,
        )

    async def _persist_test_run(
        self,
        db: AsyncSession,
        rule_id: str,
        input_payload: Dict[str, Any],
        rule_result: Any,
        tested_by: Optional[str],
    ) -> str:
        """Persist a HealthRuleTestRun record and return its ID."""
        matched_conditions = json.dumps([
            {
                "condition_id": c.condition_id,
                "metric_type": c.metric_type,
                "operator": c.operator,
                "matched": c.matched,
                "explanation": c.explanation,
            }
            for c in rule_result.condition_details
        ])

        test_run = HealthRuleTestRun(
            id=str(uuid.uuid4()),
            rule_id=rule_id,
            input_payload=json.dumps(input_payload, default=str),
            evaluation_result=json.dumps(rule_result.to_dict(), default=str),
            matched=rule_result.matched,
            matched_conditions=matched_conditions,
            resulting_status=rule_result.status_override,
            score_impact=rule_result.score_impact,
            explanation=rule_result.explanation,
            tested_by=tested_by,
            tested_at=datetime.utcnow(),
        )
        db.add(test_run)
        await db.flush()
        return test_run.id


health_rule_test_service = HealthRuleTestService()
