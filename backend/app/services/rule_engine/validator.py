"""
Rule Validation Layer.

Validates rule definitions before persistence or execution:
  - Metric type existence and operator compatibility
  - Threshold range integrity
  - Logical condition integrity
  - Scope conflict detection
  - Action/value consistency

Returns structured ValidationResult objects, not exceptions,
to support live validation feedback in the rule builder UI.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from app.models.health_rule import (
    ConditionMetricType,
    ConditionOperator,
    RuleAction,
    RuleScope,
)

_BOOLEAN_ONLY_OPERATORS = {ConditionOperator.IS_TRUE, ConditionOperator.IS_FALSE}
_STRING_COMPATIBLE_OPERATORS = {
    ConditionOperator.CONTAINS,
    ConditionOperator.NOT_CONTAINS,
    ConditionOperator.EQUAL,
    ConditionOperator.NOT_EQUAL,
}
_RANGE_OPERATORS = {ConditionOperator.IN_RANGE, ConditionOperator.NOT_IN_RANGE}
_NUMERIC_OPERATORS = {
    ConditionOperator.GREATER_THAN,
    ConditionOperator.GREATER_THAN_OR_EQUAL,
    ConditionOperator.LESS_THAN,
    ConditionOperator.LESS_THAN_OR_EQUAL,
    ConditionOperator.EQUAL,
    ConditionOperator.NOT_EQUAL,
}

_STRING_METRIC_TYPES = {ConditionMetricType.HEALTH_STATUS}
_BOOLEAN_METRIC_TYPES: set = set()
_NUMERIC_METRIC_TYPES = {
    ConditionMetricType.HEALTH_SCORE,
    ConditionMetricType.RESPONSE_TIME_MS,
    ConditionMetricType.AVAILABILITY_PCT,
    ConditionMetricType.SLA_PCT,
    ConditionMetricType.CONSECUTIVE_FAILURES,
    ConditionMetricType.ERROR_RATE,
    ConditionMetricType.INCIDENT_COUNT,
    ConditionMetricType.UPTIME_PCT,
    ConditionMetricType.CUSTOM_METRIC,
}

_VALID_STATUS_VALUES = {"healthy", "degraded", "down", "timeout", "error", "unknown", "skipped"}


@dataclass
class ConditionValidationError:
    """Validation error for a single condition."""

    field: str
    message: str
    condition_index: Optional[int] = None


@dataclass
class ValidationResult:
    """Structured validation result for a rule definition."""

    valid: bool
    errors: List[ConditionValidationError] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    def add_error(self, field: str, message: str, condition_index: Optional[int] = None) -> None:
        self.errors.append(ConditionValidationError(field=field, message=message, condition_index=condition_index))
        self.valid = False

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)


def validate_rule_definition(
    name: str,
    scope: str,
    action: str,
    action_value: Optional[float],
    action_status_override: Optional[str],
    conditions: List[dict],
    project_id: Optional[str] = None,
    connector_id: Optional[str] = None,
) -> ValidationResult:
    """
    Validate a complete rule definition.

    Args:
        name: Rule name
        scope: RuleScope value string
        action: RuleAction value string
        action_value: Numeric action value (penalty/bonus amount)
        action_status_override: Status string for OVERRIDE_STATUS action
        conditions: List of condition definition dicts
        project_id: Project ID for scope validation
        connector_id: Connector ID for scope validation

    Returns:
        ValidationResult with errors and warnings
    """
    result = ValidationResult(valid=True)

    if not name or len(name.strip()) < 2:
        result.add_error("name", "Rule name must be at least 2 characters")

    _validate_scope(result, scope, project_id, connector_id)
    _validate_action(result, action, action_value, action_status_override)

    if not conditions:
        result.add_error("conditions", "Rule must have at least one condition")
    else:
        for idx, cond in enumerate(conditions):
            _validate_condition(result, cond, idx)

    return result


def _validate_scope(
    result: ValidationResult,
    scope: str,
    project_id: Optional[str],
    connector_id: Optional[str],
) -> None:
    """Validate scope/assignment consistency."""
    try:
        scope_enum = RuleScope(scope)
    except ValueError:
        result.add_error("scope", f"Invalid scope value: '{scope}'")
        return

    if scope_enum == RuleScope.PROJECT and not project_id:
        result.add_error("scope", "PROJECT scope requires a project_id assignment")

    if scope_enum == RuleScope.CONNECTOR and not connector_id:
        result.add_error("scope", "CONNECTOR scope requires a connector_id assignment")

    if scope_enum == RuleScope.GLOBAL and (project_id or connector_id):
        result.add_warning("GLOBAL scope rules apply to all projects; project/connector targets are ignored")


def _validate_action(
    result: ValidationResult,
    action: str,
    action_value: Optional[float],
    action_status_override: Optional[str],
) -> None:
    """Validate action/value consistency."""
    try:
        action_enum = RuleAction(action)
    except ValueError:
        result.add_error("action", f"Invalid action value: '{action}'")
        return

    if action_enum == RuleAction.APPLY_PENALTY:
        if action_value is None:
            result.add_error("action_value", "APPLY_PENALTY action requires a numeric penalty value")
        elif action_value <= 0:
            result.add_error("action_value", "Penalty value must be positive (e.g. 5 means -5 pts)")
        elif action_value > 100:
            result.add_error("action_value", "Penalty value cannot exceed 100")

    elif action_enum == RuleAction.APPLY_BONUS:
        if action_value is None:
            result.add_error("action_value", "APPLY_BONUS action requires a numeric bonus value")
        elif action_value <= 0:
            result.add_error("action_value", "Bonus value must be positive")
        elif action_value > 50:
            result.add_warning("Bonus values above 50 are unusually high; verify intent")

    elif action_enum == RuleAction.OVERRIDE_STATUS:
        if not action_status_override:
            result.add_error(
                "action_status_override",
                "OVERRIDE_STATUS action requires a target status (e.g. 'degraded')",
            )
        elif action_status_override not in _VALID_STATUS_VALUES:
            result.add_error(
                "action_status_override",
                f"Invalid status override '{action_status_override}'. Must be one of: {sorted(_VALID_STATUS_VALUES)}",
            )


def _validate_condition(
    result: ValidationResult, cond: dict, idx: int
) -> None:
    """Validate a single condition definition dict."""
    metric_type_str = cond.get("metric_type")
    operator_str = cond.get("operator")
    threshold_value = cond.get("threshold_value")
    threshold_value_max = cond.get("threshold_value_max")
    metric_key = cond.get("metric_key")

    if not metric_type_str:
        result.add_error("metric_type", "Condition requires a metric_type", idx)
        return

    try:
        metric_type = ConditionMetricType(metric_type_str)
    except ValueError:
        result.add_error("metric_type", f"Unknown metric type: '{metric_type_str}'", idx)
        return

    if not operator_str:
        result.add_error("operator", "Condition requires an operator", idx)
        return

    try:
        operator = ConditionOperator(operator_str)
    except ValueError:
        result.add_error("operator", f"Unknown operator: '{operator_str}'", idx)
        return

    if metric_type == ConditionMetricType.CUSTOM_METRIC and not metric_key:
        result.add_error("metric_key", "CUSTOM_METRIC conditions require a metric_key", idx)

    if metric_type in _NUMERIC_METRIC_TYPES:
        if operator in _BOOLEAN_ONLY_OPERATORS:
            result.add_error(
                "operator",
                f"Operator '{operator_str}' is not valid for numeric metric '{metric_type_str}'",
                idx,
            )
            return

    if operator in _RANGE_OPERATORS:
        if threshold_value is None or threshold_value_max is None:
            result.add_error(
                "threshold_value",
                f"Range operator '{operator_str}' requires both threshold_value and threshold_value_max",
                idx,
            )
        elif threshold_value_max <= threshold_value:
            result.add_error(
                "threshold_value_max",
                "threshold_value_max must be greater than threshold_value",
                idx,
            )

    elif operator not in _BOOLEAN_ONLY_OPERATORS and operator not in _STRING_COMPATIBLE_OPERATORS.difference(_RANGE_OPERATORS):
        if operator in _NUMERIC_OPERATORS and threshold_value is None:
            result.add_error(
                "threshold_value",
                f"Numeric operator '{operator_str}' requires a threshold_value",
                idx,
            )

    if metric_type == ConditionMetricType.AVAILABILITY_PCT or metric_type == ConditionMetricType.SLA_PCT:
        if threshold_value is not None and not (0.0 <= threshold_value <= 100.0):
            result.add_error(
                "threshold_value",
                f"Percentage metric '{metric_type_str}' threshold must be between 0 and 100",
                idx,
            )

    if metric_type == ConditionMetricType.ERROR_RATE:
        if threshold_value is not None and not (0.0 <= threshold_value <= 1.0):
            result.add_warning(
                f"Condition {idx + 1}: error_rate is typically 0.0–1.0; got {threshold_value}"
            )
