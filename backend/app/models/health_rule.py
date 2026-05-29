"""
Health Rule Database Models.

Defines the schema for:
  - HealthRule: Named rule with metadata, scope, and severity
  - HealthRuleCondition: Individual condition within a rule (metric, operator, threshold)
  - HealthRuleAssignment: Rule assigned to project/connector scope
  - HealthRuleTestRun: Record of a rule test/preview execution
  - HealthRuleAuditLog: Immutable audit trail of rule changes and trigger events

Design:
  - Conditions are linked to rules via foreign key; evaluated with AND/OR group logic
  - Assignments link rules to projects/connectors at different scopes
  - Test runs store sample payload and evaluation output for explainability
  - Audit logs capture both mutation events and runtime trigger events
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class RuleScope(str, enum.Enum):
    """Defines what scope a rule applies to."""

    GLOBAL = "global"
    PROJECT = "project"
    CONNECTOR = "connector"
    METRIC = "metric"


class RuleSeverity(str, enum.Enum):
    """Severity level of a rule when triggered."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class RuleAction(str, enum.Enum):
    """Action to take when rule conditions are met."""

    OVERRIDE_STATUS = "override_status"
    APPLY_PENALTY = "apply_penalty"
    APPLY_BONUS = "apply_bonus"
    FLAG_INCIDENT = "flag_incident"
    NOTIFY = "notify"


class ConditionOperator(str, enum.Enum):
    """Comparison operators for rule conditions."""

    GREATER_THAN = "gt"
    GREATER_THAN_OR_EQUAL = "gte"
    LESS_THAN = "lt"
    LESS_THAN_OR_EQUAL = "lte"
    EQUAL = "eq"
    NOT_EQUAL = "neq"
    IN_RANGE = "in_range"
    NOT_IN_RANGE = "not_in_range"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    IS_TRUE = "is_true"
    IS_FALSE = "is_false"


class ConditionLogicGroup(str, enum.Enum):
    """Logical grouping for conditions within a rule."""

    AND = "and"
    OR = "or"


class ConditionMetricType(str, enum.Enum):
    """Supported metric input types for condition evaluation."""

    HEALTH_STATUS = "health_status"
    HEALTH_SCORE = "health_score"
    RESPONSE_TIME_MS = "response_time_ms"
    AVAILABILITY_PCT = "availability_pct"
    SLA_PCT = "sla_pct"
    CONSECUTIVE_FAILURES = "consecutive_failures"
    ERROR_RATE = "error_rate"
    INCIDENT_COUNT = "incident_count"
    UPTIME_PCT = "uptime_pct"
    CUSTOM_METRIC = "custom_metric"


class RuleStatus(str, enum.Enum):
    """Lifecycle status of a health rule."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    DRAFT = "draft"
    ARCHIVED = "archived"


class RuleAuditAction(str, enum.Enum):
    """Type of audit event for a rule."""

    CREATED = "created"
    UPDATED = "updated"
    DELETED = "deleted"
    ENABLED = "enabled"
    DISABLED = "disabled"
    TRIGGERED = "triggered"
    TESTED = "tested"
    ASSIGNED = "assigned"
    UNASSIGNED = "unassigned"


class HealthRule(Base):
    """
    A named, configurable health rule with conditions and an action.

    Rules are evaluated during health runs against connector/project metrics.
    Each rule has a logic group (AND/OR) governing how its conditions are combined.
    When all conditions in the group are met, the rule action is applied.
    """

    __tablename__ = "health_rules"

    id = Column(String, primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    slug = Column(String(255), nullable=False, unique=True)

    scope = Column(Enum(RuleScope), nullable=False, default=RuleScope.GLOBAL)
    severity = Column(Enum(RuleSeverity), nullable=False, default=RuleSeverity.MEDIUM)
    status = Column(Enum(RuleStatus), nullable=False, default=RuleStatus.DRAFT)
    action = Column(Enum(RuleAction), nullable=False, default=RuleAction.APPLY_PENALTY)

    logic_group = Column(
        Enum(ConditionLogicGroup),
        nullable=False,
        default=ConditionLogicGroup.AND,
    )

    action_value = Column(Float, nullable=True)
    action_status_override = Column(String(64), nullable=True)
    action_metadata = Column(Text, nullable=True)

    priority_weight = Column(Float, nullable=False, default=1.0)
    score_impact = Column(Float, nullable=True)

    tags = Column(String(512), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    version = Column(Integer, nullable=False, default=1)

    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    updated_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    conditions = relationship(
        "HealthRuleCondition",
        back_populates="rule",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    assignments = relationship(
        "HealthRuleAssignment",
        back_populates="rule",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class HealthRuleCondition(Base):
    """
    A single evaluable condition within a HealthRule.

    Each condition targets a specific metric type, applies an operator,
    and compares against a threshold value. Conditions within a rule
    are combined using the rule's logic_group (AND/OR).

    For range operators (in_range, not_in_range), both threshold_value
    and threshold_value_max must be set.

    For custom metrics, metric_key specifies the metric name.
    """

    __tablename__ = "health_rule_conditions"

    id = Column(String, primary_key=True)
    rule_id = Column(String, ForeignKey("health_rules.id", ondelete="CASCADE"), nullable=False)

    metric_type = Column(Enum(ConditionMetricType), nullable=False)
    metric_key = Column(String(255), nullable=True)

    operator = Column(Enum(ConditionOperator), nullable=False)
    threshold_value = Column(Float, nullable=True)
    threshold_value_max = Column(Float, nullable=True)
    string_value = Column(String(512), nullable=True)

    description = Column(Text, nullable=True)
    display_order = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    rule = relationship("HealthRule", back_populates="conditions")


class HealthRuleAssignment(Base):
    """
    Links a HealthRule to a specific scope target.

    Scope targets:
      - GLOBAL: rule applies to all projects (project_id=None, connector_id=None)
      - PROJECT: rule applies to a specific project (project_id set)
      - CONNECTOR: rule applies to a specific project connector (connector_id set)
      - METRIC: rule applies when a specific metric is being evaluated

    Rules with narrower scope override broader-scope rules.
    """

    __tablename__ = "health_rule_assignments"
    __table_args__ = (
        UniqueConstraint("rule_id", "project_id", "connector_id", name="uq_rule_assignment"),
    )

    id = Column(String, primary_key=True)
    rule_id = Column(String, ForeignKey("health_rules.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=True)
    connector_id = Column(
        String, ForeignKey("project_connectors.id", ondelete="CASCADE"), nullable=True
    )

    scope_override = Column(Enum(RuleScope), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    assigned_by = Column(String, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    rule = relationship("HealthRule", back_populates="assignments")


class HealthRuleTestRun(Base):
    """
    Records a rule test/preview execution against a sample payload.

    Stores the input payload, evaluation result, matched conditions,
    and the resulting score impact for explainability.
    """

    __tablename__ = "health_rule_test_runs"

    id = Column(String, primary_key=True)
    rule_id = Column(String, ForeignKey("health_rules.id", ondelete="CASCADE"), nullable=False)

    input_payload = Column(Text, nullable=False)
    evaluation_result = Column(Text, nullable=False)
    matched = Column(Boolean, nullable=False, default=False)
    matched_conditions = Column(Text, nullable=True)
    resulting_status = Column(String(64), nullable=True)
    score_impact = Column(Float, nullable=True)
    explanation = Column(Text, nullable=True)

    tested_by = Column(String, ForeignKey("users.id"), nullable=True)
    tested_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class HealthRuleAuditLog(Base):
    """
    Immutable audit trail for all health rule lifecycle and trigger events.

    Captures both mutation events (CRUD on rules/assignments) and runtime
    events (rule triggered during health run, tested by user).
    """

    __tablename__ = "health_rule_audit_log"

    id = Column(String, primary_key=True)
    rule_id = Column(String, ForeignKey("health_rules.id", ondelete="SET NULL"), nullable=True)
    action = Column(Enum(RuleAuditAction), nullable=False)

    actor_user_id = Column(String, ForeignKey("users.id"), nullable=True)
    project_id = Column(String, nullable=True)
    connector_id = Column(String, nullable=True)
    health_run_id = Column(String, nullable=True)

    before_state = Column(Text, nullable=True)
    after_state = Column(Text, nullable=True)
    details = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
