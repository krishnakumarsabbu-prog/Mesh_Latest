"""
Health Rule Engine Package.

Exposes the main RuleEngine entry point and shared data contracts.
"""

from app.services.rule_engine.context import RuleEvaluationContext
from app.services.rule_engine.engine import RuleEngine
from app.services.rule_engine.result import RuleEvaluationResult, RuleSetEvaluationResult

__all__ = [
    "RuleEngine",
    "RuleEvaluationContext",
    "RuleEvaluationResult",
    "RuleSetEvaluationResult",
]
