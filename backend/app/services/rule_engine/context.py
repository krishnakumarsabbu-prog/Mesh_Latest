"""
Rule Evaluation Context.

Defines the data bag passed to the rule evaluator for each connector/project
health evaluation. Supports all built-in metric types and an extensible
custom_metrics dict for connector-specific values.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, Optional


@dataclass
class RuleEvaluationContext:
    """
    Input context for rule evaluation.

    All built-in fields map to ConditionMetricType enum values.
    custom_metrics maps arbitrary metric keys to numeric values
    for connector-specific rule conditions.

    Attributes:
        connector_id: Project connector ID (optional; None for project-scope eval)
        project_id: Project ID
        health_status: Current health status string (e.g. 'healthy', 'degraded')
        health_score: Numeric score 0-100
        response_time_ms: Last response time in milliseconds
        availability_pct: Availability percentage (0-100)
        sla_pct: SLA compliance percentage (0-100)
        consecutive_failures: Number of consecutive failure events
        error_rate: Error rate as a decimal (0.0-1.0)
        incident_count: Number of open/recent incidents
        uptime_pct: Uptime percentage (0-100)
        custom_metrics: Arbitrary connector-provided metrics by name
        extra: Any additional context data for future extensibility
    """

    project_id: str
    connector_id: Optional[str] = None
    health_status: Optional[str] = None
    health_score: Optional[float] = None
    response_time_ms: Optional[float] = None
    availability_pct: Optional[float] = None
    sla_pct: Optional[float] = None
    consecutive_failures: Optional[int] = None
    error_rate: Optional[float] = None
    incident_count: Optional[int] = None
    uptime_pct: Optional[float] = None
    custom_metrics: Dict[str, Any] = field(default_factory=dict)
    extra: Dict[str, Any] = field(default_factory=dict)

    def get_metric_value(self, metric_type: str, metric_key: Optional[str] = None) -> Any:
        """
        Retrieve the value for a given metric type.

        Args:
            metric_type: ConditionMetricType enum value string
            metric_key: Required for CUSTOM_METRIC type; the metric name

        Returns:
            The metric value, or None if not present in this context.
        """
        _METRIC_MAP = {
            "health_status": self.health_status,
            "health_score": self.health_score,
            "response_time_ms": self.response_time_ms,
            "availability_pct": self.availability_pct,
            "sla_pct": self.sla_pct,
            "consecutive_failures": self.consecutive_failures,
            "error_rate": self.error_rate,
            "incident_count": self.incident_count,
            "uptime_pct": self.uptime_pct,
        }

        if metric_type == "custom_metric":
            if not metric_key:
                return None
            return self.custom_metrics.get(metric_key)

        return _METRIC_MAP.get(metric_type)
