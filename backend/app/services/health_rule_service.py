"""
Health Rule CRUD Service.

Handles creation, retrieval, update, deletion, and activation of health rules.
Enforces validation, slug generation, version tracking, and audit logging.

All public methods accept an AsyncSession and operate within the caller's
transaction boundary (commit/rollback managed by the session dependency).
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.health_rule import (
    ConditionLogicGroup,
    ConditionMetricType,
    ConditionOperator,
    HealthRule,
    HealthRuleAssignment,
    HealthRuleAuditLog,
    HealthRuleCondition,
    RuleAction,
    RuleAuditAction,
    RuleScope,
    RuleSeverity,
    RuleStatus,
)
from app.schemas.health_rule import (
    HealthRuleCreate,
    HealthRuleUpdate,
)
from app.services.rule_engine.validator import validate_rule_definition

logger = logging.getLogger("healthmesh.rule_service")


def _slugify(name: str) -> str:
    """Convert a rule name to a URL-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_-]+", "-", slug)
    slug = slug.strip("-")
    return slug


async def _ensure_unique_slug(db: AsyncSession, base_slug: str, exclude_id: Optional[str] = None) -> str:
    """Ensure slug uniqueness by appending a numeric suffix if needed."""
    candidate = base_slug
    counter = 1
    while True:
        q = select(HealthRule).where(HealthRule.slug == candidate)
        if exclude_id:
            q = q.where(HealthRule.id != exclude_id)
        result = await db.execute(q)
        if not result.scalar_one_or_none():
            return candidate
        candidate = f"{base_slug}-{counter}"
        counter += 1


class HealthRuleService:
    """
    Service layer for health rule lifecycle management.

    Provides create, read, update, delete, enable/disable, and
    assignment management operations with full audit trail.
    """

    async def create_rule(
        self,
        db: AsyncSession,
        payload: HealthRuleCreate,
        created_by: Optional[str] = None,
    ) -> HealthRule:
        """
        Create a new health rule with conditions and optional scope assignment.

        Validates the rule definition before persistence.
        Generates a unique slug from the rule name.
        Creates an audit log entry for the creation event.

        Args:
            db: Async database session
            payload: Rule creation payload
            created_by: User ID of the creator

        Returns:
            The created HealthRule ORM object (with conditions loaded)

        Raises:
            ValueError: If rule validation fails
        """
        conditions_dicts = [c.model_dump() for c in payload.conditions]
        validation = validate_rule_definition(
            name=payload.name,
            scope=payload.scope,
            action=payload.action,
            action_value=payload.action_value,
            action_status_override=payload.action_status_override,
            conditions=conditions_dicts,
            project_id=payload.project_id,
            connector_id=payload.connector_id,
        )
        if not validation.valid:
            errors = "; ".join(f"{e.field}: {e.message}" for e in validation.errors)
            raise ValueError(f"Rule validation failed: {errors}")

        base_slug = _slugify(payload.name)
        slug = await _ensure_unique_slug(db, base_slug)

        action_metadata_str = None
        if payload.action_metadata:
            action_metadata_str = json.dumps(payload.action_metadata)

        rule = HealthRule(
            id=str(uuid.uuid4()),
            name=payload.name,
            description=payload.description,
            slug=slug,
            scope=RuleScope(payload.scope),
            severity=RuleSeverity(payload.severity),
            status=RuleStatus.ACTIVE,
            action=RuleAction(payload.action),
            logic_group=ConditionLogicGroup(payload.logic_group),
            action_value=payload.action_value,
            action_status_override=payload.action_status_override,
            action_metadata=action_metadata_str,
            priority_weight=payload.priority_weight,
            score_impact=payload.score_impact,
            tags=payload.tags,
            is_system=False,
            version=1,
            created_by=created_by,
            updated_by=created_by,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(rule)
        await db.flush()

        for idx, cond_data in enumerate(payload.conditions):
            condition = HealthRuleCondition(
                id=str(uuid.uuid4()),
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
            db.add(condition)

        if payload.project_id or payload.connector_id:
            assignment = HealthRuleAssignment(
                id=str(uuid.uuid4()),
                rule_id=rule.id,
                project_id=payload.project_id,
                connector_id=payload.connector_id,
                is_active=True,
                assigned_by=created_by,
                assigned_at=datetime.utcnow(),
            )
            db.add(assignment)

        await self._write_audit_log(
            db,
            rule_id=rule.id,
            action=RuleAuditAction.CREATED,
            actor_user_id=created_by,
            after_state=self._rule_state_snapshot(rule, payload.conditions),
        )

        await db.flush()

        result = await db.execute(
            select(HealthRule)
            .options(
                selectinload(HealthRule.conditions),
                selectinload(HealthRule.assignments),
            )
            .where(HealthRule.id == rule.id)
        )
        return result.scalar_one()

    async def get_rule(self, db: AsyncSession, rule_id: str) -> Optional[HealthRule]:
        """
        Retrieve a single rule by ID with conditions and assignments loaded.

        Returns None if not found.
        """
        result = await db.execute(
            select(HealthRule)
            .options(
                selectinload(HealthRule.conditions),
                selectinload(HealthRule.assignments),
            )
            .where(HealthRule.id == rule_id)
        )
        return result.scalar_one_or_none()

    async def list_rules(
        self,
        db: AsyncSession,
        scope: Optional[str] = None,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        project_id: Optional[str] = None,
        connector_id: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[HealthRule], int]:
        """
        List rules with optional filtering and pagination.

        Scope filtering includes global rules plus any rules assigned to
        the specified project/connector.

        Returns:
            Tuple of (rules_list, total_count)
        """
        q = (
            select(HealthRule)
            .options(
                selectinload(HealthRule.conditions),
                selectinload(HealthRule.assignments),
            )
        )

        if scope:
            q = q.where(HealthRule.scope == RuleScope(scope))

        if severity:
            q = q.where(HealthRule.severity == RuleSeverity(severity))

        if status:
            q = q.where(HealthRule.status == RuleStatus(status))

        if search:
            pattern = f"%{search}%"
            q = q.where(
                or_(
                    HealthRule.name.ilike(pattern),
                    HealthRule.description.ilike(pattern),
                    HealthRule.tags.ilike(pattern),
                )
            )

        if project_id or connector_id:
            q = q.outerjoin(HealthRuleAssignment, HealthRuleAssignment.rule_id == HealthRule.id)
            conditions_list = [HealthRule.scope == RuleScope.GLOBAL]
            if project_id:
                conditions_list.append(HealthRuleAssignment.project_id == project_id)
            if connector_id:
                conditions_list.append(HealthRuleAssignment.connector_id == connector_id)
            q = q.where(or_(*conditions_list))

        count_q = select(func.count()).select_from(q.subquery())
        total_result = await db.execute(count_q)
        total = total_result.scalar_one()

        q = q.order_by(HealthRule.severity, HealthRule.name)
        q = q.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(q)
        rules = list(result.scalars().unique().all())

        return rules, total

    async def update_rule(
        self,
        db: AsyncSession,
        rule_id: str,
        payload: HealthRuleUpdate,
        updated_by: Optional[str] = None,
    ) -> HealthRule:
        """
        Update an existing rule.

        If conditions are provided in the update payload, all existing
        conditions are replaced with the new set.
        Increments the rule version on each update.
        Writes an audit log entry with before/after state snapshot.

        Raises:
            ValueError: If rule not found or validation fails
        """
        rule = await self.get_rule(db, rule_id)
        if not rule:
            raise ValueError(f"Rule '{rule_id}' not found")

        before_state = self._rule_state_snapshot(rule)

        if payload.name is not None:
            rule.name = payload.name
            new_slug = _slugify(payload.name)
            rule.slug = await _ensure_unique_slug(db, new_slug, exclude_id=rule_id)

        if payload.description is not None:
            rule.description = payload.description
        if payload.scope is not None:
            rule.scope = RuleScope(payload.scope)
        if payload.severity is not None:
            rule.severity = RuleSeverity(payload.severity)
        if payload.status is not None:
            rule.status = RuleStatus(payload.status)
        if payload.action is not None:
            rule.action = RuleAction(payload.action)
        if payload.logic_group is not None:
            rule.logic_group = ConditionLogicGroup(payload.logic_group)
        if payload.action_value is not None:
            rule.action_value = payload.action_value
        if payload.action_status_override is not None:
            rule.action_status_override = payload.action_status_override
        if payload.action_metadata is not None:
            rule.action_metadata = json.dumps(payload.action_metadata)
        if payload.priority_weight is not None:
            rule.priority_weight = payload.priority_weight
        if payload.score_impact is not None:
            rule.score_impact = payload.score_impact
        if payload.tags is not None:
            rule.tags = payload.tags

        if payload.conditions is not None:
            for existing_cond in list(rule.conditions):
                await db.delete(existing_cond)
            await db.flush()

            for idx, cond_data in enumerate(payload.conditions):
                condition = HealthRuleCondition(
                    id=str(uuid.uuid4()),
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
                db.add(condition)

        rule.version = (rule.version or 1) + 1
        rule.updated_by = updated_by
        rule.updated_at = datetime.utcnow()

        await db.flush()

        refreshed = await self.get_rule(db, rule_id)

        await self._write_audit_log(
            db,
            rule_id=rule.id,
            action=RuleAuditAction.UPDATED,
            actor_user_id=updated_by,
            before_state=before_state,
            after_state=self._rule_state_snapshot(refreshed),
        )

        await db.flush()
        return refreshed

    async def set_rule_status(
        self,
        db: AsyncSession,
        rule_id: str,
        new_status: str,
        updated_by: Optional[str] = None,
    ) -> HealthRule:
        """
        Enable, disable, or change the status of a rule.

        Raises:
            ValueError: If rule not found or status invalid
        """
        rule = await self.get_rule(db, rule_id)
        if not rule:
            raise ValueError(f"Rule '{rule_id}' not found")

        old_status = rule.status.value
        rule.status = RuleStatus(new_status)
        rule.updated_by = updated_by
        rule.updated_at = datetime.utcnow()

        audit_action = (
            RuleAuditAction.ENABLED if new_status == "active" else RuleAuditAction.DISABLED
        )
        await self._write_audit_log(
            db,
            rule_id=rule.id,
            action=audit_action,
            actor_user_id=updated_by,
            details=json.dumps({"old_status": old_status, "new_status": new_status}),
        )

        await db.flush()
        return await self.get_rule(db, rule_id)

    async def delete_rule(
        self,
        db: AsyncSession,
        rule_id: str,
        deleted_by: Optional[str] = None,
    ) -> bool:
        """
        Soft-delete a rule by setting status to ARCHIVED.

        System rules cannot be deleted.

        Returns:
            True if deleted, False if not found.
        Raises:
            ValueError: If rule is a system rule
        """
        rule = await self.get_rule(db, rule_id)
        if not rule:
            return False

        if rule.is_system:
            raise ValueError("System rules cannot be deleted")

        before_state = self._rule_state_snapshot(rule)
        rule.status = RuleStatus.ARCHIVED
        rule.updated_by = deleted_by
        rule.updated_at = datetime.utcnow()

        await self._write_audit_log(
            db,
            rule_id=rule.id,
            action=RuleAuditAction.DELETED,
            actor_user_id=deleted_by,
            before_state=before_state,
        )

        await db.flush()
        return True

    async def get_applicable_rules(
        self,
        db: AsyncSession,
        project_id: str,
        connector_id: Optional[str] = None,
    ) -> List[HealthRule]:
        """
        Load all active rules applicable to a given project/connector context.

        Returns global rules plus rules specifically assigned to the project
        or connector (if provided), ordered by severity (desc) then name.

        Args:
            db: Async session
            project_id: The project being evaluated
            connector_id: The specific connector being evaluated (optional)

        Returns:
            List of HealthRule objects with conditions loaded
        """
        q = (
            select(HealthRule)
            .options(selectinload(HealthRule.conditions))
            .where(HealthRule.status == RuleStatus.ACTIVE)
        )

        scope_conditions = [HealthRule.scope == RuleScope.GLOBAL]

        if project_id or connector_id:
            assignment_q = (
                select(HealthRuleAssignment.rule_id)
                .where(HealthRuleAssignment.is_active == True)
            )
            assignment_conditions = []
            if project_id:
                assignment_conditions.append(HealthRuleAssignment.project_id == project_id)
            if connector_id:
                assignment_conditions.append(HealthRuleAssignment.connector_id == connector_id)
            if assignment_conditions:
                assignment_q = assignment_q.where(or_(*assignment_conditions))

            scope_conditions.append(HealthRule.id.in_(assignment_q))

        q = q.where(or_(*scope_conditions))
        q = q.order_by(HealthRule.severity, HealthRule.name)

        result = await db.execute(q)
        return list(result.scalars().unique().all())

    async def _write_audit_log(
        self,
        db: AsyncSession,
        rule_id: Optional[str],
        action: RuleAuditAction,
        actor_user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        connector_id: Optional[str] = None,
        health_run_id: Optional[str] = None,
        before_state: Optional[str] = None,
        after_state: Optional[str] = None,
        details: Optional[str] = None,
    ) -> None:
        """Write an immutable audit log entry."""
        log_entry = HealthRuleAuditLog(
            id=str(uuid.uuid4()),
            rule_id=rule_id,
            action=action,
            actor_user_id=actor_user_id,
            project_id=project_id,
            connector_id=connector_id,
            health_run_id=health_run_id,
            before_state=before_state,
            after_state=after_state,
            details=details,
            created_at=datetime.utcnow(),
        )
        db.add(log_entry)

    def _rule_state_snapshot(
        self,
        rule: HealthRule,
        conditions: Optional[List[Any]] = None,
    ) -> str:
        """Build a JSON snapshot of a rule's current state for audit purposes."""
        conds = conditions or rule.conditions
        state: Dict[str, Any] = {
            "id": rule.id,
            "name": rule.name,
            "slug": rule.slug,
            "scope": rule.scope.value if hasattr(rule.scope, "value") else rule.scope,
            "severity": rule.severity.value if hasattr(rule.severity, "value") else rule.severity,
            "status": rule.status.value if hasattr(rule.status, "value") else rule.status,
            "action": rule.action.value if hasattr(rule.action, "value") else rule.action,
            "logic_group": rule.logic_group.value if hasattr(rule.logic_group, "value") else rule.logic_group,
            "action_value": rule.action_value,
            "priority_weight": rule.priority_weight,
            "version": rule.version,
            "conditions": [
                {
                    "metric_type": c.metric_type if isinstance(c, dict) else (c.metric_type.value if hasattr(c.metric_type, "value") else c.metric_type),
                    "operator": c.operator if isinstance(c, dict) else (c.operator.value if hasattr(c.operator, "value") else c.operator),
                    "threshold_value": c.threshold_value if isinstance(c, dict) else c.threshold_value,
                }
                for c in conds
            ],
        }
        return json.dumps(state, default=str)


health_rule_service = HealthRuleService()
