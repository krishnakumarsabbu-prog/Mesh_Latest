"""
Health Scoring Engine.

Implements weighted, multi-factor health score calculation for a project
health run. Produces an overall_score (0-100), overall_health_status,
and a list of contributing factors for transparency.

Scoring model:
  - Each connector contributes a score based on its health status and priority.
  - Status weights: healthy=100, degraded=60, down=0, timeout=10, error=5, unknown=20
  - Priority multiplier: priority 0 = base weight 1.0, each +1 priority = +0.25 weight
  - Skipped connectors do not contribute to the score denominator.
  - SLA penalty: if > 33% of connectors are failing, apply penalty of -5 pts.
  - Consecutive failure penalty: applied per connector if consecutive_failures > 3.
  - Final score is clamped to [0, 100].
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from app.models.health_run import RunConnectorOutcome, RunHealthStatus

logger = logging.getLogger(__name__)

_STATUS_BASE_SCORE: Dict[str, float] = {
    RunHealthStatus.HEALTHY.value: 100.0,
    RunHealthStatus.DEGRADED.value: 60.0,
    RunHealthStatus.DOWN.value: 0.0,
    RunHealthStatus.TIMEOUT.value: 10.0,
    RunHealthStatus.ERROR.value: 5.0,
    RunHealthStatus.UNKNOWN.value: 20.0,
    RunHealthStatus.SKIPPED.value: -1.0,
}

_OUTCOME_FAILED = {
    RunConnectorOutcome.FAILURE,
    RunConnectorOutcome.TIMEOUT,
    RunConnectorOutcome.ERROR,
    RunConnectorOutcome.AUTH_ERROR,
    RunConnectorOutcome.CONFIG_ERROR,
}


@dataclass
class ConnectorScoreInput:
    """Input data for scoring a single connector result."""

    connector_id: str
    connector_name: str
    health_status: str
    outcome: str
    priority: int = 0
    consecutive_failures: int = 0
    response_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    is_enabled: bool = True


@dataclass
class ConnectorScoreOutput:
    """Score output for a single connector."""

    connector_id: str
    connector_name: str
    raw_score: float
    weighted_score: float
    weight: float
    health_status: str
    outcome: str
    contributing_factor: str


@dataclass
class HealthScoreResult:
    """Final aggregated score result for a health run."""

    overall_score: float
    overall_health_status: str
    connector_scores: List[ConnectorScoreOutput] = field(default_factory=list)
    contributing_factors: List[str] = field(default_factory=list)
    success_count: int = 0
    failure_count: int = 0
    skipped_count: int = 0
    total_connectors: int = 0


class HealthScoringEngine:
    """
    Weighted health score calculator for a project health run.

    Produces a 0-100 score from per-connector results using priority
    weighting, status scoring, and penalty adjustments.
    """

    def calculate(self, connector_inputs: List[ConnectorScoreInput]) -> HealthScoreResult:
        """
        Calculate the overall health score from a list of connector results.

        Args:
            connector_inputs: List of connector result data to score.

        Returns:
            HealthScoreResult with overall_score, status, and contributing factors.
        """
        if not connector_inputs:
            return HealthScoreResult(
                overall_score=100.0,
                overall_health_status=RunHealthStatus.UNKNOWN.value,
                contributing_factors=["No connectors configured for this project"],
            )

        active_inputs = [c for c in connector_inputs if c.is_enabled]
        skipped_count = len(connector_inputs) - len(active_inputs)

        if not active_inputs:
            return HealthScoreResult(
                overall_score=100.0,
                overall_health_status=RunHealthStatus.UNKNOWN.value,
                skipped_count=skipped_count,
                total_connectors=len(connector_inputs),
                contributing_factors=["All connectors are disabled"],
            )

        connector_scores: List[ConnectorScoreOutput] = []
        total_weighted_score = 0.0
        total_weight = 0.0
        success_count = 0
        failure_count = 0

        for ci in active_inputs:
            base_score = _STATUS_BASE_SCORE.get(ci.health_status, 20.0)

            if base_score < 0:
                skipped_count += 1
                continue

            weight = self._calculate_weight(ci.priority)

            penalized_score = base_score
            if ci.consecutive_failures > 3:
                penalty = min(ci.consecutive_failures * 2.0, 20.0)
                penalized_score = max(0.0, base_score - penalty)

            if ci.response_time_ms and ci.response_time_ms > 5000 and base_score > 0:
                penalized_score = max(0.0, penalized_score - 5.0)

            weighted = penalized_score * weight
            total_weighted_score += weighted
            total_weight += weight

            outcome_enum = RunConnectorOutcome(ci.outcome) if ci.outcome in [e.value for e in RunConnectorOutcome] else None
            if outcome_enum in _OUTCOME_FAILED:
                failure_count += 1
            else:
                success_count += 1

            factor = self._build_factor(ci, penalized_score, base_score)
            connector_scores.append(ConnectorScoreOutput(
                connector_id=ci.connector_id,
                connector_name=ci.connector_name,
                raw_score=base_score,
                weighted_score=penalized_score,
                weight=weight,
                health_status=ci.health_status,
                outcome=ci.outcome,
                contributing_factor=factor,
            ))

        if total_weight == 0:
            overall_score = 100.0
        else:
            overall_score = total_weighted_score / total_weight

        active_scored = len(active_inputs) - (skipped_count - (len(connector_inputs) - len(active_inputs)))
        if active_scored > 0:
            failure_ratio = failure_count / active_scored
            if failure_ratio > 0.33:
                sla_penalty = min(failure_ratio * 10.0, 10.0)
                overall_score = max(0.0, overall_score - sla_penalty)

        overall_score = round(min(100.0, max(0.0, overall_score)), 2)

        overall_status = self._derive_status(overall_score, failure_count, success_count + failure_count)
        contributing_factors = self._build_summary_factors(
            overall_score, overall_status, success_count, failure_count, skipped_count, connector_scores
        )

        return HealthScoreResult(
            overall_score=overall_score,
            overall_health_status=overall_status,
            connector_scores=connector_scores,
            contributing_factors=contributing_factors,
            success_count=success_count,
            failure_count=failure_count,
            skipped_count=skipped_count,
            total_connectors=len(connector_inputs),
        )

    def _calculate_weight(self, priority: int) -> float:
        """Convert connector priority to a weight multiplier."""
        base = 1.0
        multiplier = 0.25 * max(0, priority)
        return round(base + multiplier, 3)

    def _build_factor(
        self,
        ci: ConnectorScoreInput,
        penalized_score: float,
        base_score: float,
    ) -> str:
        """Build a human-readable contributing factor string for a connector."""
        parts = [f"{ci.connector_name}: {ci.health_status}"]

        if ci.response_time_ms:
            parts.append(f"{ci.response_time_ms}ms")

        if penalized_score < base_score:
            diff = round(base_score - penalized_score, 1)
            parts.append(f"-{diff} pts penalty")

        if ci.error_message:
            truncated = ci.error_message[:80] + ("..." if len(ci.error_message) > 80 else "")
            parts.append(f"({truncated})")

        return " | ".join(parts)

    def _derive_status(
        self, score: float, failure_count: int, total_active: int
    ) -> str:
        """Derive overall health status from score and failure metrics."""
        if total_active == 0:
            return RunHealthStatus.UNKNOWN.value

        failure_ratio = failure_count / total_active if total_active > 0 else 0

        if score >= 90 and failure_ratio < 0.1:
            return RunHealthStatus.HEALTHY.value
        elif score >= 60 and failure_ratio < 0.5:
            return RunHealthStatus.DEGRADED.value
        elif score > 0:
            return RunHealthStatus.DOWN.value
        else:
            return RunHealthStatus.DOWN.value

    def _build_summary_factors(
        self,
        score: float,
        status: str,
        success_count: int,
        failure_count: int,
        skipped_count: int,
        connector_scores: List[ConnectorScoreOutput],
    ) -> List[str]:
        """Build the list of contributing factors for the run summary."""
        factors = []

        factors.append(f"Overall health score: {score:.1f}/100 ({status})")
        factors.append(
            f"Connectors: {success_count} successful, {failure_count} failed, {skipped_count} skipped"
        )

        failing = [c for c in connector_scores if c.health_status in (
            RunHealthStatus.DOWN.value, RunHealthStatus.ERROR.value,
            RunHealthStatus.TIMEOUT.value
        )]
        if failing:
            names = ", ".join(c.connector_name for c in failing[:5])
            factors.append(f"Critical failures: {names}")

        degraded = [c for c in connector_scores if c.health_status == RunHealthStatus.DEGRADED.value]
        if degraded:
            names = ", ".join(c.connector_name for c in degraded[:5])
            factors.append(f"Degraded connectors: {names}")

        high_latency = [
            c for c in connector_scores
            if c.health_status == RunHealthStatus.HEALTHY.value
        ]
        if high_latency:
            factors.append(f"Healthy connectors: {', '.join(c.connector_name for c in high_latency[:5])}")

        return factors


health_scoring_engine = HealthScoringEngine()
