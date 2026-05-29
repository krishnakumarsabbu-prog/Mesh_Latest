"""
Rule Evaluation Result Contracts.

Defines the immutable output data structures returned by the evaluator
and engine. These are used for scoring integration, API responses,
and persistence into audit logs.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ConditionEvaluationDetail:
    """
    Evaluation details for a single condition within a rule.

    Attributes:
        condition_id: The HealthRuleCondition ID
        metric_type: The metric type evaluated
        metric_key: Custom metric key (if applicable)
        operator: The comparison operator used
        threshold_value: Expected threshold
        threshold_value_max: Max threshold (for range operators)
        actual_value: The actual value found in the context
        matched: Whether this condition was satisfied
        explanation: Human-readable explanation of this condition's result
    """

    condition_id: str
    metric_type: str
    metric_key: Optional[str]
    operator: str
    threshold_value: Optional[float]
    threshold_value_max: Optional[float]
    actual_value: Any
    matched: bool
    explanation: str


@dataclass
class RuleEvaluationResult:
    """
    Complete evaluation result for a single HealthRule.

    Attributes:
        rule_id: The HealthRule ID
        rule_name: Human-readable rule name
        rule_severity: Severity level of the rule
        rule_action: Action to take when rule is triggered
        matched: Whether the overall rule was triggered (all/any conditions met)
        logic_group: AND or OR logic used to combine conditions
        condition_details: Per-condition evaluation breakdown
        score_impact: Numeric score adjustment to apply (negative = penalty)
        status_override: Health status override if action is OVERRIDE_STATUS
        explanation: Human-readable summary of why rule matched/did not match
        action_metadata: Additional data from rule action config
    """

    rule_id: str
    rule_name: str
    rule_severity: str
    rule_action: str
    matched: bool
    logic_group: str
    condition_details: List[ConditionEvaluationDetail] = field(default_factory=list)
    score_impact: Optional[float] = None
    status_override: Optional[str] = None
    explanation: str = ""
    action_metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a JSON-safe dict for persistence."""
        return {
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "rule_severity": self.rule_severity,
            "rule_action": self.rule_action,
            "matched": self.matched,
            "logic_group": self.logic_group,
            "score_impact": self.score_impact,
            "status_override": self.status_override,
            "explanation": self.explanation,
            "action_metadata": self.action_metadata,
            "condition_details": [
                {
                    "condition_id": c.condition_id,
                    "metric_type": c.metric_type,
                    "metric_key": c.metric_key,
                    "operator": c.operator,
                    "threshold_value": c.threshold_value,
                    "threshold_value_max": c.threshold_value_max,
                    "actual_value": c.actual_value,
                    "matched": c.matched,
                    "explanation": c.explanation,
                }
                for c in self.condition_details
            ],
        }


@dataclass
class RuleSetEvaluationResult:
    """
    Aggregated result from evaluating all applicable rules against a context.

    Attributes:
        connector_id: Connector this evaluation applies to (None = project-level)
        project_id: Project this evaluation applies to
        rules_evaluated: Number of rules evaluated
        rules_matched: Number of rules that triggered
        total_score_impact: Net score adjustment from all triggered rules
        status_override: Final status override (from highest-priority triggered rule)
        triggered_rules: List of individual rule results that matched
        all_results: All rule results (matched and unmatched)
        explanation_lines: Human-readable summary of all matched rules
    """

    project_id: str
    connector_id: Optional[str]
    rules_evaluated: int
    rules_matched: int
    total_score_impact: float
    status_override: Optional[str]
    triggered_rules: List[RuleEvaluationResult]
    all_results: List[RuleEvaluationResult]
    explanation_lines: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a JSON-safe dict for persistence."""
        return {
            "project_id": self.project_id,
            "connector_id": self.connector_id,
            "rules_evaluated": self.rules_evaluated,
            "rules_matched": self.rules_matched,
            "total_score_impact": self.total_score_impact,
            "status_override": self.status_override,
            "explanation_lines": self.explanation_lines,
            "triggered_rules": [r.to_dict() for r in self.triggered_rules],
        }
