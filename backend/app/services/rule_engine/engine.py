"""
Rule Engine.

Orchestrates evaluation of a set of HealthRule objects against a
RuleEvaluationContext. Implements the parser/evaluator/executor separation:

  Parser layer:    Interprets rule structure (conditions, logic group)
  Evaluator layer: Delegates to evaluator.py for per-condition comparison
  Executor layer:  Applies matched rule actions (score adjustments, overrides)

Supports:
  - AND/OR condition grouping
  - Priority-weighted rule ordering
  - Score penalty/bonus actions
  - Status override actions
  - Explainability output per condition and per rule

Extension points:
  - New ConditionOperator values: add to evaluator.py
  - New RuleAction values: add to _apply_action()
  - Nested/grouped conditions: extend _parse_conditions()
  - DSL/JSON rule definitions: implement a custom parser that produces
    HealthRuleCondition-equivalent objects and feeds this engine
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from app.models.health_rule import (
    ConditionLogicGroup,
    HealthRule,
    HealthRuleCondition,
    RuleAction,
    RuleSeverity,
    RuleStatus,
)
from app.services.rule_engine.context import RuleEvaluationContext
from app.services.rule_engine.evaluator import evaluate_condition
from app.services.rule_engine.result import (
    ConditionEvaluationDetail,
    RuleEvaluationResult,
    RuleSetEvaluationResult,
)

logger = logging.getLogger("healthmesh.rule_engine")

_SEVERITY_PRIORITY: Dict[str, int] = {
    RuleSeverity.CRITICAL.value: 5,
    RuleSeverity.HIGH.value: 4,
    RuleSeverity.MEDIUM.value: 3,
    RuleSeverity.LOW.value: 2,
    RuleSeverity.INFO.value: 1,
}


class RuleEngine:
    """
    Evaluates a collection of HealthRules against a RuleEvaluationContext.

    Usage:
        engine = RuleEngine()
        result = engine.evaluate(rules, context)

    The engine is stateless; all state is passed via parameters.
    Rules are evaluated in priority order (severity desc, then rule priority_weight desc).
    """

    def evaluate(
        self,
        rules: List[HealthRule],
        context: RuleEvaluationContext,
    ) -> RuleSetEvaluationResult:
        """
        Evaluate all active rules against the given context.

        Args:
            rules: List of HealthRule ORM objects (with conditions loaded)
            context: The metric context to evaluate rules against

        Returns:
            RuleSetEvaluationResult with all matches, score impact, and explanations
        """
        active_rules = [r for r in rules if r.status == RuleStatus.ACTIVE]
        sorted_rules = sorted(
            active_rules,
            key=lambda r: (
                _SEVERITY_PRIORITY.get(r.severity.value, 0),
                r.priority_weight or 1.0,
            ),
            reverse=True,
        )

        all_results: List[RuleEvaluationResult] = []
        triggered_rules: List[RuleEvaluationResult] = []
        total_score_impact = 0.0
        final_status_override: Optional[str] = None

        for rule in sorted_rules:
            try:
                result = self._evaluate_rule(rule, context)
            except Exception as exc:
                logger.exception("Error evaluating rule '%s': %s", rule.name, exc)
                continue

            all_results.append(result)

            if result.matched:
                triggered_rules.append(result)
                if result.score_impact is not None:
                    total_score_impact += result.score_impact
                if result.status_override and final_status_override is None:
                    final_status_override = result.status_override

        explanation_lines = self._build_explanation(triggered_rules)

        logger.debug(
            "Rule evaluation complete: project=%s connector=%s rules=%d matched=%d score_impact=%.2f",
            context.project_id,
            context.connector_id,
            len(active_rules),
            len(triggered_rules),
            total_score_impact,
        )

        return RuleSetEvaluationResult(
            project_id=context.project_id,
            connector_id=context.connector_id,
            rules_evaluated=len(active_rules),
            rules_matched=len(triggered_rules),
            total_score_impact=total_score_impact,
            status_override=final_status_override,
            triggered_rules=triggered_rules,
            all_results=all_results,
            explanation_lines=explanation_lines,
        )

    def _evaluate_rule(
        self, rule: HealthRule, context: RuleEvaluationContext
    ) -> RuleEvaluationResult:
        """
        Evaluate a single rule against the context.

        Applies AND or OR logic group to combine condition results.
        Builds condition details for full explainability.
        """
        conditions = sorted(rule.conditions, key=lambda c: c.display_order)
        condition_details: List[ConditionEvaluationDetail] = []

        for cond in conditions:
            actual_value = context.get_metric_value(
                cond.metric_type.value, cond.metric_key
            )
            matched, explanation = evaluate_condition(
                operator=cond.operator.value,
                actual_value=actual_value,
                threshold_value=cond.threshold_value,
                threshold_value_max=cond.threshold_value_max,
                string_value=cond.string_value,
                metric_type=cond.metric_type.value,
            )
            condition_details.append(
                ConditionEvaluationDetail(
                    condition_id=cond.id,
                    metric_type=cond.metric_type.value,
                    metric_key=cond.metric_key,
                    operator=cond.operator.value,
                    threshold_value=cond.threshold_value,
                    threshold_value_max=cond.threshold_value_max,
                    actual_value=actual_value,
                    matched=matched,
                    explanation=explanation,
                )
            )

        rule_matched = self._apply_logic_group(
            rule.logic_group, condition_details
        )

        score_impact, status_override, action_metadata = self._apply_action(
            rule, rule_matched
        )

        explanation = self._build_rule_explanation(
            rule, rule_matched, condition_details, score_impact
        )

        return RuleEvaluationResult(
            rule_id=rule.id,
            rule_name=rule.name,
            rule_severity=rule.severity.value,
            rule_action=rule.action.value,
            matched=rule_matched,
            logic_group=rule.logic_group.value,
            condition_details=condition_details,
            score_impact=score_impact,
            status_override=status_override,
            explanation=explanation,
            action_metadata=action_metadata,
        )

    def _apply_logic_group(
        self,
        logic_group: ConditionLogicGroup,
        condition_details: List[ConditionEvaluationDetail],
    ) -> bool:
        """Apply AND or OR logic to combine condition results."""
        if not condition_details:
            return False

        matched_flags = [c.matched for c in condition_details]

        if logic_group == ConditionLogicGroup.AND:
            return all(matched_flags)
        elif logic_group == ConditionLogicGroup.OR:
            return any(matched_flags)

        return all(matched_flags)

    def _apply_action(
        self,
        rule: HealthRule,
        matched: bool,
    ) -> tuple[Optional[float], Optional[str], Optional[Dict[str, Any]]]:
        """
        Determine score_impact, status_override, and action_metadata for a triggered rule.

        Returns (score_impact, status_override, action_metadata).
        If rule did not match, all values are None.
        """
        if not matched:
            return None, None, None

        action = rule.action
        action_value = rule.action_value
        action_metadata: Optional[Dict[str, Any]] = None

        if rule.action_metadata:
            try:
                action_metadata = json.loads(rule.action_metadata)
            except Exception:
                pass

        score_impact: Optional[float] = None
        status_override: Optional[str] = None

        if action == RuleAction.APPLY_PENALTY:
            penalty = -(abs(action_value) if action_value is not None else 5.0)
            adjusted_penalty = penalty * (rule.priority_weight or 1.0)
            score_impact = round(adjusted_penalty, 3)

        elif action == RuleAction.APPLY_BONUS:
            bonus = abs(action_value) if action_value is not None else 5.0
            adjusted_bonus = bonus * (rule.priority_weight or 1.0)
            score_impact = round(adjusted_bonus, 3)

        elif action == RuleAction.OVERRIDE_STATUS:
            status_override = rule.action_status_override
            if action_value is not None:
                score_impact = round(-abs(action_value), 3)

        elif action == RuleAction.FLAG_INCIDENT:
            score_impact = -(abs(action_value) if action_value is not None else 0.0)

        elif action == RuleAction.NOTIFY:
            score_impact = 0.0

        return score_impact, status_override, action_metadata

    def _build_rule_explanation(
        self,
        rule: HealthRule,
        matched: bool,
        condition_details: List[ConditionEvaluationDetail],
        score_impact: Optional[float],
    ) -> str:
        """Build a human-readable explanation for a rule evaluation."""
        logic = rule.logic_group.value.upper()
        matched_count = sum(1 for c in condition_details if c.matched)
        total = len(condition_details)

        if matched:
            parts = [f"Rule '{rule.name}' [{rule.severity.value}] TRIGGERED ({logic}: {matched_count}/{total} conditions met)"]
            if score_impact is not None and score_impact != 0:
                parts.append(f"Score impact: {score_impact:+.1f}")
        else:
            parts = [f"Rule '{rule.name}' not triggered ({logic}: {matched_count}/{total} conditions met)"]

        for c in condition_details:
            prefix = "  [PASS]" if c.matched else "  [FAIL]"
            parts.append(f"{prefix} {c.explanation}")

        return "\n".join(parts)

    def _build_explanation(
        self, triggered_rules: List[RuleEvaluationResult]
    ) -> List[str]:
        """Build the top-level explanation lines for the rule set result."""
        if not triggered_rules:
            return ["No health rules triggered"]

        lines = [f"{len(triggered_rules)} rule(s) triggered:"]
        for r in triggered_rules:
            impact_str = ""
            if r.score_impact is not None and r.score_impact != 0:
                impact_str = f" (score {r.score_impact:+.1f})"
            lines.append(f"  [{r.rule_severity.upper()}] {r.rule_name}{impact_str}")

        return lines
