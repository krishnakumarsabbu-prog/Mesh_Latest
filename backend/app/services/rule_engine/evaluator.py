"""
Rule Condition Evaluator.

Implements operator-based condition evaluation for all supported
ConditionOperator types. Separated from the engine to allow independent
testing and future extension with new operators.

Design:
  - Stateless; all state is passed via parameters
  - Each operator method returns (matched: bool, explanation: str)
  - Type coercion is handled explicitly to support string/numeric comparisons
  - Unknown operators default to non-matching with explanation
"""

from __future__ import annotations

import logging
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)

_HEALTH_STATUS_ORDER = {
    "healthy": 100,
    "degraded": 60,
    "unknown": 20,
    "timeout": 10,
    "error": 5,
    "down": 0,
    "skipped": -1,
}


def evaluate_condition(
    operator: str,
    actual_value: Any,
    threshold_value: Optional[float],
    threshold_value_max: Optional[float],
    string_value: Optional[str],
    metric_type: str,
) -> Tuple[bool, str]:
    """
    Evaluate a single condition against an actual value.

    Args:
        operator: ConditionOperator enum value string
        actual_value: The actual metric value from context
        threshold_value: Primary numeric threshold
        threshold_value_max: Secondary numeric threshold for range operators
        string_value: String comparison target (for CONTAINS/equality on strings)
        metric_type: The metric type (for contextual explanation building)

    Returns:
        Tuple of (matched: bool, explanation: str)
    """
    if actual_value is None:
        return False, f"Metric '{metric_type}' has no value in this context"

    if operator in ("is_true", "is_false"):
        return _eval_boolean(operator, actual_value, metric_type)

    if operator in ("contains", "not_contains"):
        return _eval_string(operator, actual_value, string_value, metric_type)

    if operator in ("in_range", "not_in_range"):
        return _eval_range(operator, actual_value, threshold_value, threshold_value_max, metric_type)

    if operator in ("eq", "neq") and isinstance(actual_value, str):
        return _eval_string_equality(operator, actual_value, string_value, threshold_value, metric_type)

    return _eval_numeric(operator, actual_value, threshold_value, metric_type)


def _eval_boolean(operator: str, actual_value: Any, metric_type: str) -> Tuple[bool, str]:
    """Evaluate boolean IS_TRUE / IS_FALSE operators."""
    if operator == "is_true":
        matched = bool(actual_value)
        return matched, f"{metric_type} is {'truthy' if matched else 'falsy'} (expected truthy)"
    else:
        matched = not bool(actual_value)
        return matched, f"{metric_type} is {'falsy' if matched else 'truthy'} (expected falsy)"


def _eval_string(
    operator: str,
    actual_value: Any,
    string_value: Optional[str],
    metric_type: str,
) -> Tuple[bool, str]:
    """Evaluate CONTAINS / NOT_CONTAINS operators."""
    actual_str = str(actual_value).lower()
    target = (string_value or "").lower()

    if operator == "contains":
        matched = target in actual_str
        return matched, (
            f"{metric_type} value '{actual_value}' {'contains' if matched else 'does not contain'} '{string_value}'"
        )
    else:
        matched = target not in actual_str
        return matched, (
            f"{metric_type} value '{actual_value}' {'does not contain' if matched else 'contains'} '{string_value}'"
        )


def _eval_string_equality(
    operator: str,
    actual_value: str,
    string_value: Optional[str],
    threshold_value: Optional[float],
    metric_type: str,
) -> Tuple[bool, str]:
    """Evaluate EQ / NEQ operators on string values (e.g. health_status)."""
    if metric_type == "health_status" and threshold_value is not None:
        actual_score = _HEALTH_STATUS_ORDER.get(actual_value.lower(), -1)
        threshold_score = float(threshold_value)
        if operator == "eq":
            matched = actual_score == threshold_score
            return matched, (
                f"health_status '{actual_value}' (score={actual_score}) "
                f"{'==' if matched else '!='} threshold score {threshold_score}"
            )
        else:
            matched = actual_score != threshold_score
            return matched, (
                f"health_status '{actual_value}' (score={actual_score}) "
                f"{'!=' if matched else '=='} threshold score {threshold_score}"
            )

    target = string_value or ""
    if operator == "eq":
        matched = actual_value.lower() == target.lower()
        return matched, (
            f"{metric_type} '{actual_value}' {'==' if matched else '!='} '{target}'"
        )
    else:
        matched = actual_value.lower() != target.lower()
        return matched, (
            f"{metric_type} '{actual_value}' {'!=' if matched else '=='} '{target}'"
        )


def _eval_range(
    operator: str,
    actual_value: Any,
    threshold_value: Optional[float],
    threshold_value_max: Optional[float],
    metric_type: str,
) -> Tuple[bool, str]:
    """Evaluate IN_RANGE / NOT_IN_RANGE operators."""
    if threshold_value is None or threshold_value_max is None:
        return False, f"Range operator requires both min and max threshold values for {metric_type}"

    try:
        numeric = float(actual_value)
    except (ValueError, TypeError):
        return False, f"Cannot convert {metric_type} value '{actual_value}' to numeric for range comparison"

    in_range = threshold_value <= numeric <= threshold_value_max

    if operator == "in_range":
        return in_range, (
            f"{metric_type} {numeric} {'is' if in_range else 'is not'} "
            f"in range [{threshold_value}, {threshold_value_max}]"
        )
    else:
        return not in_range, (
            f"{metric_type} {numeric} {'is not' if not in_range else 'is'} "
            f"in range [{threshold_value}, {threshold_value_max}]"
        )


def _eval_numeric(
    operator: str,
    actual_value: Any,
    threshold_value: Optional[float],
    metric_type: str,
) -> Tuple[bool, str]:
    """Evaluate GT, GTE, LT, LTE, EQ, NEQ operators on numeric values."""
    if threshold_value is None:
        return False, f"Numeric operator '{operator}' requires a threshold value for {metric_type}"

    try:
        numeric = float(actual_value)
    except (ValueError, TypeError):
        logger.debug("Cannot coerce '%s' to float for metric '%s'", actual_value, metric_type)
        return False, f"Cannot convert {metric_type} value '{actual_value}' to numeric"

    _OPS = {
        "gt": (lambda a, b: a > b, ">"),
        "gte": (lambda a, b: a >= b, ">="),
        "lt": (lambda a, b: a < b, "<"),
        "lte": (lambda a, b: a <= b, "<="),
        "eq": (lambda a, b: a == b, "=="),
        "neq": (lambda a, b: a != b, "!="),
    }

    if operator not in _OPS:
        return False, f"Unknown operator '{operator}' for metric '{metric_type}'"

    fn, symbol = _OPS[operator]
    matched = fn(numeric, threshold_value)
    return matched, (
        f"{metric_type} {numeric} {symbol} {threshold_value}: {'passed' if matched else 'failed'}"
    )
