"""
Health Rule Pydantic Schemas.

Defines request/response schemas for the rules management API.
Mirrors the HealthRule model structure while providing clean
API contracts with validation and documentation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class HealthRuleConditionCreate(BaseModel):
    """Schema for creating a single rule condition."""

    metric_type: str = Field(..., description="ConditionMetricType enum value")
    metric_key: Optional[str] = Field(None, description="Required for custom_metric type")
    operator: str = Field(..., description="ConditionOperator enum value")
    threshold_value: Optional[float] = Field(None, description="Primary numeric threshold")
    threshold_value_max: Optional[float] = Field(None, description="Max threshold for range operators")
    string_value: Optional[str] = Field(None, description="String value for contains/equality operators")
    description: Optional[str] = Field(None, max_length=512)
    display_order: int = Field(0, ge=0)


class HealthRuleConditionResponse(HealthRuleConditionCreate):
    """Schema for returning a condition in API responses."""

    id: str
    rule_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class HealthRuleCreate(BaseModel):
    """Schema for creating a new health rule."""

    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    scope: str = Field("global", description="RuleScope value: global|project|connector|metric")
    severity: str = Field("medium", description="RuleSeverity value: critical|high|medium|low|info")
    action: str = Field(
        "apply_penalty",
        description="RuleAction: override_status|apply_penalty|apply_bonus|flag_incident|notify",
    )
    logic_group: str = Field("and", description="ConditionLogicGroup: and|or")
    action_value: Optional[float] = Field(None, description="Penalty/bonus numeric amount")
    action_status_override: Optional[str] = Field(None, description="Target status for OVERRIDE_STATUS action")
    action_metadata: Optional[Dict[str, Any]] = Field(None)
    priority_weight: float = Field(1.0, ge=0.1, le=10.0)
    score_impact: Optional[float] = Field(None)
    tags: Optional[str] = Field(None, max_length=512)
    conditions: List[HealthRuleConditionCreate] = Field(..., min_length=1)

    project_id: Optional[str] = Field(None, description="Assign to project (PROJECT scope)")
    connector_id: Optional[str] = Field(None, description="Assign to connector (CONNECTOR scope)")

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        valid = {"critical", "high", "medium", "low", "info"}
        if v not in valid:
            raise ValueError(f"severity must be one of {sorted(valid)}")
        return v

    @field_validator("action")
    @classmethod
    def validate_action(cls, v: str) -> str:
        valid = {"override_status", "apply_penalty", "apply_bonus", "flag_incident", "notify"}
        if v not in valid:
            raise ValueError(f"action must be one of {sorted(valid)}")
        return v

    @field_validator("logic_group")
    @classmethod
    def validate_logic_group(cls, v: str) -> str:
        if v not in ("and", "or"):
            raise ValueError("logic_group must be 'and' or 'or'")
        return v


class HealthRuleUpdate(BaseModel):
    """Schema for updating an existing health rule (all fields optional)."""

    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = Field(None, max_length=2000)
    scope: Optional[str] = None
    severity: Optional[str] = None
    status: Optional[str] = None
    action: Optional[str] = None
    logic_group: Optional[str] = None
    action_value: Optional[float] = None
    action_status_override: Optional[str] = None
    action_metadata: Optional[Dict[str, Any]] = None
    priority_weight: Optional[float] = Field(None, ge=0.1, le=10.0)
    score_impact: Optional[float] = None
    tags: Optional[str] = None
    conditions: Optional[List[HealthRuleConditionCreate]] = None


class HealthRuleStatusUpdate(BaseModel):
    """Schema for enabling/disabling a rule."""

    status: str = Field(..., description="Rule status: active|inactive|draft|archived")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid = {"active", "inactive", "draft", "archived"}
        if v not in valid:
            raise ValueError(f"status must be one of {sorted(valid)}")
        return v


class HealthRuleAssignmentCreate(BaseModel):
    """Schema for creating a rule assignment."""

    rule_id: str
    project_id: Optional[str] = None
    connector_id: Optional[str] = None
    scope_override: Optional[str] = None


class HealthRuleAssignmentResponse(BaseModel):
    """Schema for returning a rule assignment."""

    id: str
    rule_id: str
    project_id: Optional[str]
    connector_id: Optional[str]
    scope_override: Optional[str]
    is_active: bool
    assigned_by: Optional[str]
    assigned_at: datetime

    model_config = {"from_attributes": True}


class HealthRuleResponse(BaseModel):
    """Full rule response schema including conditions and assignments."""

    id: str
    name: str
    description: Optional[str]
    slug: str
    scope: str
    severity: str
    status: str
    action: str
    logic_group: str
    action_value: Optional[float]
    action_status_override: Optional[str]
    action_metadata: Optional[Dict[str, Any]]
    priority_weight: float
    score_impact: Optional[float]
    tags: Optional[str]
    is_system: bool
    version: int
    created_by: Optional[str]
    updated_by: Optional[str]
    created_at: datetime
    updated_at: datetime
    conditions: List[HealthRuleConditionResponse]
    assignments: List[HealthRuleAssignmentResponse]

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_rule(cls, rule: Any) -> "HealthRuleResponse":
        """Build response from ORM object, handling enum serialization."""
        return cls(
            id=rule.id,
            name=rule.name,
            description=rule.description,
            slug=rule.slug,
            scope=rule.scope.value if hasattr(rule.scope, "value") else rule.scope,
            severity=rule.severity.value if hasattr(rule.severity, "value") else rule.severity,
            status=rule.status.value if hasattr(rule.status, "value") else rule.status,
            action=rule.action.value if hasattr(rule.action, "value") else rule.action,
            logic_group=rule.logic_group.value if hasattr(rule.logic_group, "value") else rule.logic_group,
            action_value=rule.action_value,
            action_status_override=rule.action_status_override,
            action_metadata=_parse_json_field(rule.action_metadata),
            priority_weight=rule.priority_weight,
            score_impact=rule.score_impact,
            tags=rule.tags,
            is_system=rule.is_system,
            version=rule.version,
            created_by=rule.created_by,
            updated_by=rule.updated_by,
            created_at=rule.created_at,
            updated_at=rule.updated_at,
            conditions=[
                HealthRuleConditionResponse(
                    id=c.id,
                    rule_id=c.rule_id,
                    metric_type=c.metric_type.value if hasattr(c.metric_type, "value") else c.metric_type,
                    metric_key=c.metric_key,
                    operator=c.operator.value if hasattr(c.operator, "value") else c.operator,
                    threshold_value=c.threshold_value,
                    threshold_value_max=c.threshold_value_max,
                    string_value=c.string_value,
                    description=c.description,
                    display_order=c.display_order,
                    created_at=c.created_at,
                )
                for c in rule.conditions
            ],
            assignments=[
                HealthRuleAssignmentResponse(
                    id=a.id,
                    rule_id=a.rule_id,
                    project_id=a.project_id,
                    connector_id=a.connector_id,
                    scope_override=a.scope_override.value if a.scope_override and hasattr(a.scope_override, "value") else a.scope_override,
                    is_active=a.is_active,
                    assigned_by=a.assigned_by,
                    assigned_at=a.assigned_at,
                )
                for a in rule.assignments
            ],
        )


class HealthRuleListResponse(BaseModel):
    """Paginated list response for rules."""

    items: List[HealthRuleResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class RuleTestRequest(BaseModel):
    """Request schema for testing a rule against a sample payload."""

    rule_id: Optional[str] = Field(None, description="Test an existing rule by ID")
    rule_definition: Optional[HealthRuleCreate] = Field(
        None, description="Inline rule definition to test without saving"
    )
    sample_payload: Dict[str, Any] = Field(
        ...,
        description="Sample metric context payload to evaluate the rule against",
        examples=[{
            "project_id": "proj-123",
            "connector_id": "conn-456",
            "health_status": "degraded",
            "health_score": 55.0,
            "response_time_ms": 8500,
            "availability_pct": 82.0,
            "sla_pct": 78.0,
            "consecutive_failures": 5,
            "error_rate": 0.18,
            "incident_count": 3,
        }],
    )


class ConditionTestDetail(BaseModel):
    """Test result detail for a single condition."""

    condition_id: Optional[str]
    metric_type: str
    metric_key: Optional[str]
    operator: str
    threshold_value: Optional[float]
    threshold_value_max: Optional[float]
    actual_value: Any
    matched: bool
    explanation: str


class RuleTestResponse(BaseModel):
    """Response schema for a rule test execution."""

    rule_id: Optional[str]
    rule_name: str
    matched: bool
    logic_group: str
    score_impact: Optional[float]
    status_override: Optional[str]
    explanation: str
    condition_details: List[ConditionTestDetail]
    warnings: List[str]
    persisted_test_run_id: Optional[str]


class ValidationErrorDetail(BaseModel):
    """A single validation error with field and message."""

    field: str
    message: str
    condition_index: Optional[int]


class RuleValidationResponse(BaseModel):
    """Response for rule validation without saving."""

    valid: bool
    errors: List[ValidationErrorDetail]
    warnings: List[str]


def _parse_json_field(value: Any) -> Optional[Dict[str, Any]]:
    """Parse a JSON string field or return dict as-is."""
    import json
    if value is None:
        return None
    if isinstance(value, dict):
        return value
    try:
        return json.loads(value)
    except Exception:
        return None
