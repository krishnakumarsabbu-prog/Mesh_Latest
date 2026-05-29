"""
Health Execution Orchestrator Service.

Central orchestration engine that:
1. Resolves all enabled connectors for a project
2. Executes all connector health checks in parallel using asyncio
3. Aggregates and normalizes responses
4. Calculates overall health score via the scoring engine
5. Persists the full execution snapshot (run + per-connector results + metrics + raw payloads)
6. Returns structured execution summary

Design principles:
  - Orchestrator has zero connector-specific logic; all execution via BaseConnector interface
  - Single connector failure never blocks the overall run
  - Per-connector timeout enforced independently via asyncio.wait_for
  - Fully async; designed for future migration to queue/worker model
  - Structured logging with correlation IDs on every run
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.connectors.base.interface import (
    ConnectorHealthResult,
    ConnectorHealthStatus,
)
from app.models.connector_execution_log import (
    AgentHealthStatus,
    ConnectorAgentStatus,
    ConnectorExecutionLog,
    ExecutionOutcome,
    ExecutionTrigger,
)
from app.models.health_run import (
    HealthRun,
    HealthRunConnectorResult,
    HealthRunMetric,
    HealthRunRawPayload,
    HealthRunStatus,
    HealthRunTrigger,
    RunConnectorOutcome,
    RunHealthStatus,
)
from app.models.project_connector import ProjectConnector, ProjectConnectorStatus
from app.services.connector_agent_service import (
    ConnectorAgentService,
    _build_config_and_credentials,
    _resolve_connector_slug,
)
from app.services.health_scoring import ConnectorScoreInput, health_scoring_engine
from app.connectors.base.registry import ConnectorRegistry
from app.services.rule_engine import RuleEngine, RuleEvaluationContext

logger = logging.getLogger("healthmesh.orchestrator")

_rule_engine = RuleEngine()

_CONNECTOR_TIMEOUT_SECONDS = 60
_STATUS_TO_RUN_HEALTH: Dict[str, str] = {
    ConnectorHealthStatus.HEALTHY.value: RunHealthStatus.HEALTHY.value,
    ConnectorHealthStatus.DEGRADED.value: RunHealthStatus.DEGRADED.value,
    ConnectorHealthStatus.DOWN.value: RunHealthStatus.DOWN.value,
    ConnectorHealthStatus.TIMEOUT.value: RunHealthStatus.TIMEOUT.value,
    ConnectorHealthStatus.ERROR.value: RunHealthStatus.ERROR.value,
    ConnectorHealthStatus.UNKNOWN.value: RunHealthStatus.UNKNOWN.value,
}

_STATUS_TO_OUTCOME: Dict[str, str] = {
    ConnectorHealthStatus.HEALTHY.value: RunConnectorOutcome.SUCCESS.value,
    ConnectorHealthStatus.DEGRADED.value: RunConnectorOutcome.SUCCESS.value,
    ConnectorHealthStatus.DOWN.value: RunConnectorOutcome.FAILURE.value,
    ConnectorHealthStatus.TIMEOUT.value: RunConnectorOutcome.TIMEOUT.value,
    ConnectorHealthStatus.ERROR.value: RunConnectorOutcome.ERROR.value,
    ConnectorHealthStatus.UNKNOWN.value: RunConnectorOutcome.FAILURE.value,
}

_OUTCOME_TO_EXEC_OUTCOME: Dict[str, str] = {
    RunConnectorOutcome.SUCCESS.value: ExecutionOutcome.SUCCESS.value,
    RunConnectorOutcome.FAILURE.value: ExecutionOutcome.FAILURE.value,
    RunConnectorOutcome.TIMEOUT.value: ExecutionOutcome.TIMEOUT.value,
    RunConnectorOutcome.ERROR.value: ExecutionOutcome.FAILURE.value,
    RunConnectorOutcome.AUTH_ERROR.value: ExecutionOutcome.AUTH_ERROR.value,
    RunConnectorOutcome.CONFIG_ERROR.value: ExecutionOutcome.CONFIG_ERROR.value,
    RunConnectorOutcome.SKIPPED.value: ExecutionOutcome.SKIPPED.value,
}

_STATUS_TO_AGENT_STATUS: Dict[str, str] = {
    RunHealthStatus.HEALTHY.value: AgentHealthStatus.HEALTHY.value,
    RunHealthStatus.DEGRADED.value: AgentHealthStatus.DEGRADED.value,
    RunHealthStatus.DOWN.value: AgentHealthStatus.DOWN.value,
    RunHealthStatus.TIMEOUT.value: AgentHealthStatus.TIMEOUT.value,
    RunHealthStatus.ERROR.value: AgentHealthStatus.ERROR.value,
    RunHealthStatus.UNKNOWN.value: AgentHealthStatus.UNKNOWN.value,
    RunHealthStatus.SKIPPED.value: AgentHealthStatus.UNKNOWN.value,
}


class ConnectorExecutionContext:
    """Carries all context needed to execute a single connector within a run."""

    def __init__(self, pc: ProjectConnector, execution_id: str) -> None:
        self.pc = pc
        self.execution_id = execution_id
        self.pc_id = pc.id
        self.connector_name = pc.name
        self.catalog_slug = pc.catalog_entry.slug if pc.catalog_entry else "custom"
        self.catalog_category = (
            pc.catalog_entry.category.value
            if pc.catalog_entry and hasattr(pc.catalog_entry.category, "value")
            else "custom"
        )
        self.priority = pc.priority or 0
        self.is_enabled = pc.is_enabled


class ConnectorExecutionResult:
    """Raw execution result for a single connector."""

    def __init__(
        self,
        ctx: ConnectorExecutionContext,
        health_status: str,
        outcome: str,
        response_time_ms: Optional[int] = None,
        error: Optional[str] = None,
        message: str = "",
        metrics: Optional[List[Any]] = None,
        raw_response: Optional[Dict[str, Any]] = None,
        started_at: Optional[datetime] = None,
        completed_at: Optional[datetime] = None,
    ) -> None:
        self.ctx = ctx
        self.health_status = health_status
        self.outcome = outcome
        self.response_time_ms = response_time_ms
        self.error = error
        self.message = message
        self.metrics = metrics or []
        self.raw_response = raw_response
        self.started_at = started_at or datetime.utcnow()
        self.completed_at = completed_at or datetime.utcnow()
        self.duration_ms = (
            int((self.completed_at - self.started_at).total_seconds() * 1000)
            if self.completed_at and self.started_at
            else response_time_ms
        )
        self.connector_slug: str = ""


class HealthOrchestrator:
    """
    Health execution orchestration engine.

    Coordinates parallel connector execution, result aggregation,
    health score calculation, and persistence for a full project health run.

    This class is transport-agnostic: it operates on a list of
    ProjectConnector records and delegates all connector-specific
    execution to the connector agent interface. This ensures it is
    ready for future queue/worker migration without architectural changes.
    """

    def __init__(self) -> None:
        self._agent_service = ConnectorAgentService()

    async def run_project_health(
        self,
        db: AsyncSession,
        project_id: str,
        triggered_by: str = HealthRunTrigger.MANUAL.value,
        triggered_by_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Execute a full health run for a project.

        Resolves all enabled connectors, runs them in parallel,
        aggregates results, calculates health score, persists snapshot,
        and returns the run summary.

        Args:
            db: Database session
            project_id: Target project ID
            triggered_by: Trigger source (manual, scheduled, api, webhook)
            triggered_by_user_id: User ID who initiated the run

        Returns:
            Dict with run_id, execution_id, status, score, and connector results
        """
        execution_id = f"run-{uuid.uuid4().hex[:12]}"
        run_start = time.monotonic()
        started_at = datetime.utcnow()

        log = logging.LoggerAdapter(
            logger,
            {"execution_id": execution_id, "project_id": project_id},
        )
        log.info("Health run initiated: project=%s trigger=%s", project_id, triggered_by)

        trigger_enum = HealthRunTrigger(triggered_by) if triggered_by in [e.value for e in HealthRunTrigger] else HealthRunTrigger.MANUAL

        health_run = HealthRun(
            id=str(uuid.uuid4()),
            execution_id=execution_id,
            project_id=project_id,
            triggered_by=trigger_enum,
            triggered_by_user_id=triggered_by_user_id,
            status=HealthRunStatus.RUNNING,
            started_at=started_at,
        )
        db.add(health_run)
        await db.flush()

        try:
            connectors = await self._load_project_connectors(db, project_id)
            health_run.connector_count = len(connectors)
            log.info("Resolved %d connectors for project", len(connectors))

            if not connectors:
                health_run.status = HealthRunStatus.COMPLETED
                health_run.overall_health_status = RunHealthStatus.UNKNOWN
                health_run.overall_score = 100.0
                health_run.success_count = 0
                health_run.failure_count = 0
                health_run.skipped_count = 0
                health_run.completed_at = datetime.utcnow()
                health_run.total_duration_ms = int((time.monotonic() - run_start) * 1000)
                health_run.contributing_factors = json.dumps(["No connectors assigned to this project"])
                await db.flush()
                return self._build_run_response(health_run, [])

            contexts = [ConnectorExecutionContext(pc, execution_id) for pc in connectors]
            exec_results = await self._execute_connectors_parallel(contexts, log)

            log.info(
                "Parallel execution complete: %d results in %.1fs",
                len(exec_results),
                time.monotonic() - run_start,
            )

            score_inputs = self._build_score_inputs(exec_results)
            score_result = health_scoring_engine.calculate(score_inputs)

            rule_factors, final_score, final_status = await self._apply_health_rules(
                db, project_id, exec_results, score_result, log
            )

            await self._persist_connector_results(db, health_run.id, exec_results, log)
            await self._persist_metrics(db, health_run.id, exec_results)
            await self._persist_raw_payloads(db, health_run.id, exec_results)
            await self._upsert_agent_statuses(db, exec_results, log)

            total_ms = int((time.monotonic() - run_start) * 1000)
            health_run.status = HealthRunStatus.COMPLETED
            health_run.overall_health_status = RunHealthStatus(final_status)
            health_run.overall_score = final_score
            health_run.success_count = score_result.success_count
            health_run.failure_count = score_result.failure_count
            health_run.skipped_count = score_result.skipped_count
            health_run.total_duration_ms = total_ms
            health_run.completed_at = datetime.utcnow()
            all_factors = score_result.contributing_factors + rule_factors
            health_run.contributing_factors = json.dumps(all_factors)

            if score_result.failure_count > 0 and score_result.success_count > 0:
                health_run.status = HealthRunStatus.PARTIAL

            await db.flush()

            log.info(
                "Health run completed: score=%.1f status=%s duration=%dms rules_applied=%d",
                final_score,
                final_status,
                total_ms,
                len(rule_factors),
            )

            response = self._build_run_response(health_run, exec_results, all_factors)

            try:
                from app.services.aggregation_scheduler import aggregation_scheduler
                await aggregation_scheduler.after_project_run(project_id, health_score=final_score)
            except Exception as agg_exc:
                logger.warning("Aggregation trigger failed (non-fatal): %s", agg_exc)

            return response

        except Exception as exc:
            logger.exception(
                "Health run failed: execution_id=%s project=%s error=%s",
                execution_id,
                project_id,
                exc,
            )
            health_run.status = HealthRunStatus.FAILED
            health_run.error_message = str(exc)
            health_run.completed_at = datetime.utcnow()
            health_run.total_duration_ms = int((time.monotonic() - run_start) * 1000)
            await db.flush()

            return {
                "run_id": health_run.id,
                "execution_id": execution_id,
                "status": HealthRunStatus.FAILED.value,
                "error": str(exc),
            }

    async def _load_project_connectors(
        self, db: AsyncSession, project_id: str
    ) -> List[ProjectConnector]:
        """Load all project connectors with their catalog entries."""
        result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.project_id == project_id)
            .order_by(ProjectConnector.priority.desc(), ProjectConnector.created_at)
        )
        return list(result.scalars().all())

    async def _execute_connectors_parallel(
        self,
        contexts: List[ConnectorExecutionContext],
        log: logging.LoggerAdapter,
    ) -> List[ConnectorExecutionResult]:
        """
        Execute all connectors concurrently using asyncio.gather.

        Each connector has an independent timeout. One connector failing
        never prevents others from running. Results preserve original
        ordering by connector priority/creation.
        """
        tasks = [self._execute_single_connector(ctx, log) for ctx in contexts]
        results = await asyncio.gather(*tasks, return_exceptions=False)
        return list(results)

    async def _execute_single_connector(
        self,
        ctx: ConnectorExecutionContext,
        log: logging.LoggerAdapter,
    ) -> ConnectorExecutionResult:
        """
        Execute health check for a single connector with timeout protection.

        Handles disabled connectors, misconfigured connectors, and runtime
        errors without propagating exceptions to the orchestrator.
        """
        started_at = datetime.utcnow()

        if not ctx.is_enabled:
            log.debug("Connector skipped (disabled): %s", ctx.connector_name)
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.SKIPPED.value,
                outcome=RunConnectorOutcome.SKIPPED.value,
                error="Connector is disabled",
                started_at=started_at,
                completed_at=datetime.utcnow(),
            )

        try:
            connector_config, credentials, _, _ = _build_config_and_credentials(ctx.pc)
        except Exception as exc:
            log.warning("Config build failed for %s: %s", ctx.connector_name, exc)
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.ERROR.value,
                outcome=RunConnectorOutcome.CONFIG_ERROR.value,
                error=f"Configuration error: {exc}",
                started_at=started_at,
                completed_at=datetime.utcnow(),
            )

        if not connector_config.base_url:
            log.warning("No base_url for connector %s", ctx.connector_name)
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.UNKNOWN.value,
                outcome=RunConnectorOutcome.CONFIG_ERROR.value,
                error="No base URL configured",
                started_at=started_at,
                completed_at=datetime.utcnow(),
            )

        resolved_slug = _resolve_connector_slug(ctx.catalog_slug, ctx.catalog_category)
        connector_instance = ConnectorRegistry.build(resolved_slug, connector_config, credentials)

        if not connector_instance:
            log.warning("No connector implementation for slug '%s'", resolved_slug)
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.ERROR.value,
                outcome=RunConnectorOutcome.ERROR.value,
                error=f"No implementation for connector slug '{resolved_slug}'",
                started_at=started_at,
                completed_at=datetime.utcnow(),
            )

        validation_errors = connector_instance.validate_config()
        if validation_errors:
            log.warning("Config validation failed for %s: %s", ctx.connector_name, validation_errors)
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.UNKNOWN.value,
                outcome=RunConnectorOutcome.CONFIG_ERROR.value,
                error="Configuration validation failed: " + "; ".join(validation_errors),
                started_at=started_at,
                completed_at=datetime.utcnow(),
            )

        try:
            health_result: ConnectorHealthResult = await asyncio.wait_for(
                connector_instance.fetch_health(),
                timeout=_CONNECTOR_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            completed_at = datetime.utcnow()
            log.warning(
                "Connector timed out: %s (timeout=%ds)", ctx.connector_name, _CONNECTOR_TIMEOUT_SECONDS
            )
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.TIMEOUT.value,
                outcome=RunConnectorOutcome.TIMEOUT.value,
                response_time_ms=_CONNECTOR_TIMEOUT_SECONDS * 1000,
                error=f"Connector timed out after {_CONNECTOR_TIMEOUT_SECONDS}s",
                started_at=started_at,
                completed_at=completed_at,
            )
        except Exception as exc:
            completed_at = datetime.utcnow()
            log.exception("Unhandled error in connector fetch_health: %s", ctx.connector_name)
            return ConnectorExecutionResult(
                ctx=ctx,
                health_status=RunHealthStatus.ERROR.value,
                outcome=RunConnectorOutcome.ERROR.value,
                error=f"Internal error: {exc}",
                started_at=started_at,
                completed_at=completed_at,
            )

        metrics_list: List[Any] = []
        try:
            metrics_list = await asyncio.wait_for(
                connector_instance.fetch_metrics(),
                timeout=30,
            )
        except Exception as exc:
            log.debug("Metrics fetch failed for %s: %s", ctx.connector_name, exc)

        completed_at = datetime.utcnow()
        health_status_str = _STATUS_TO_RUN_HEALTH.get(
            health_result.status.value, RunHealthStatus.UNKNOWN.value
        )
        outcome_str = _STATUS_TO_OUTCOME.get(
            health_result.status.value, RunConnectorOutcome.FAILURE.value
        )

        result = ConnectorExecutionResult(
            ctx=ctx,
            health_status=health_status_str,
            outcome=outcome_str,
            response_time_ms=health_result.response_time_ms,
            error=health_result.error,
            message=health_result.message,
            metrics=metrics_list,
            raw_response=health_result.raw_response,
            started_at=started_at,
            completed_at=completed_at,
        )
        result.connector_slug = resolved_slug

        log.debug(
            "Connector executed: name=%s status=%s outcome=%s duration=%dms",
            ctx.connector_name,
            health_status_str,
            outcome_str,
            result.duration_ms or 0,
        )
        return result

    def _build_score_inputs(
        self, results: List[ConnectorExecutionResult]
    ) -> List[ConnectorScoreInput]:
        """Convert execution results to scoring engine inputs."""
        inputs = []
        for r in results:
            inputs.append(ConnectorScoreInput(
                connector_id=r.ctx.pc_id,
                connector_name=r.ctx.connector_name,
                health_status=r.health_status,
                outcome=r.outcome,
                priority=r.ctx.priority,
                consecutive_failures=0,
                response_time_ms=r.response_time_ms,
                error_message=r.error,
                is_enabled=r.ctx.is_enabled,
            ))
        return inputs

    async def _persist_connector_results(
        self,
        db: AsyncSession,
        run_id: str,
        results: List[ConnectorExecutionResult],
        log: logging.LoggerAdapter,
    ) -> None:
        """Persist per-connector results to health_run_connector_results."""
        for r in results:
            metrics_snapshot = None
            if r.metrics:
                try:
                    metrics_snapshot = json.dumps([
                        {"name": m.name, "value": m.value, "unit": m.unit, "description": m.description}
                        for m in r.metrics
                    ])
                except Exception:
                    pass

            raw_snippet = None
            if r.raw_response:
                try:
                    raw_snippet = json.dumps(r.raw_response)[:2000]
                except Exception:
                    pass

            catalog = r.ctx.pc.catalog_entry
            slug = getattr(r, "connector_slug", None) or (catalog.slug if catalog else None)
            category = (
                catalog.category.value
                if catalog and hasattr(catalog.category, "value")
                else (str(catalog.category) if catalog else None)
            )

            result_row = HealthRunConnectorResult(
                id=str(uuid.uuid4()),
                health_run_id=run_id,
                project_connector_id=r.ctx.pc_id,
                connector_name=r.ctx.connector_name,
                connector_slug=slug,
                connector_category=category,
                outcome=RunConnectorOutcome(r.outcome),
                health_status=RunHealthStatus(r.health_status),
                response_time_ms=r.response_time_ms,
                error_message=r.error,
                message=r.message,
                raw_response_snippet=raw_snippet,
                metrics_snapshot=metrics_snapshot,
                weight=1.0 + 0.25 * max(0, r.ctx.priority),
                is_enabled=r.ctx.is_enabled,
                priority=r.ctx.priority,
                started_at=r.started_at,
                completed_at=r.completed_at,
                duration_ms=r.duration_ms,
            )
            db.add(result_row)

        await db.flush()
        log.debug("Persisted %d connector result rows", len(results))

    async def _persist_metrics(
        self,
        db: AsyncSession,
        run_id: str,
        results: List[ConnectorExecutionResult],
    ) -> None:
        """Persist individual metrics from all connector results."""
        for r in results:
            if not r.metrics:
                continue
            for m in r.metrics:
                try:
                    labels_str = json.dumps(m.labels) if m.labels else None
                    metric_row = HealthRunMetric(
                        id=str(uuid.uuid4()),
                        health_run_id=run_id,
                        project_connector_id=r.ctx.pc_id,
                        connector_name=r.ctx.connector_name,
                        metric_name=m.name,
                        metric_value=float(m.value),
                        metric_unit=m.unit,
                        metric_description=m.description,
                        labels=labels_str,
                        captured_at=m.timestamp or datetime.utcnow(),
                    )
                    db.add(metric_row)
                except Exception as exc:
                    logger.debug("Failed to persist metric %s: %s", m.name, exc)

        await db.flush()

    async def _persist_raw_payloads(
        self,
        db: AsyncSession,
        run_id: str,
        results: List[ConnectorExecutionResult],
    ) -> None:
        """Persist raw connector API responses for audit/debug."""
        for r in results:
            if not r.raw_response:
                continue
            try:
                raw_str = json.dumps(r.raw_response)
                catalog = r.ctx.pc.catalog_entry
                slug = getattr(r, "connector_slug", None) or (catalog.slug if catalog else None)

                payload_row = HealthRunRawPayload(
                    id=str(uuid.uuid4()),
                    health_run_id=run_id,
                    project_connector_id=r.ctx.pc_id,
                    connector_name=r.ctx.connector_name,
                    connector_slug=slug,
                    payload_type="health_response",
                    raw_payload=raw_str[:50000],
                    payload_size_bytes=len(raw_str.encode("utf-8")),
                    captured_at=r.completed_at or datetime.utcnow(),
                )
                db.add(payload_row)
            except Exception as exc:
                logger.debug("Failed to persist raw payload for %s: %s", r.ctx.connector_name, exc)

        await db.flush()

    async def _upsert_agent_statuses(
        self,
        db: AsyncSession,
        results: List[ConnectorExecutionResult],
        log: logging.LoggerAdapter,
    ) -> None:
        """Update ConnectorAgentStatus and create execution logs for each connector."""
        now = datetime.utcnow()

        for r in results:
            if r.outcome == RunConnectorOutcome.SKIPPED.value:
                continue

            exec_outcome_str = _OUTCOME_TO_EXEC_OUTCOME.get(r.outcome, ExecutionOutcome.FAILURE.value)
            exec_outcome = ExecutionOutcome(exec_outcome_str)

            agent_status_str = _STATUS_TO_AGENT_STATUS.get(r.health_status, AgentHealthStatus.UNKNOWN.value)
            agent_status = AgentHealthStatus(agent_status_str)

            metrics_snapshot = None
            if r.metrics:
                try:
                    metrics_snapshot = json.dumps([
                        {"name": m.name, "value": m.value, "unit": m.unit}
                        for m in r.metrics
                    ])
                except Exception:
                    pass

            exec_log = ConnectorExecutionLog(
                id=str(uuid.uuid4()),
                project_connector_id=r.ctx.pc_id,
                triggered_by=ExecutionTrigger.API,
                outcome=exec_outcome,
                response_time_ms=r.response_time_ms,
                error_message=r.error,
                raw_response_snippet=json.dumps(r.raw_response)[:2000] if r.raw_response else None,
                metrics_snapshot=metrics_snapshot,
                executed_at=r.completed_at or now,
            )
            db.add(exec_log)

            try:
                existing = await db.execute(
                    select(ConnectorAgentStatus).where(
                        ConnectorAgentStatus.project_connector_id == r.ctx.pc_id
                    )
                )
                status_record = existing.scalar_one_or_none()

                if status_record is None:
                    is_failure = exec_outcome != ExecutionOutcome.SUCCESS
                    status_record = ConnectorAgentStatus(
                        id=str(uuid.uuid4()),
                        project_connector_id=r.ctx.pc_id,
                        health_status=agent_status,
                        last_sync_at=now,
                        last_sync_outcome=exec_outcome,
                        last_sync_response_ms=r.response_time_ms,
                        last_error=r.error if is_failure else None,
                        last_error_at=now if is_failure else None,
                        consecutive_failures=0 if not is_failure else 1,
                        total_executions=1,
                        total_failures=1 if is_failure else 0,
                        uptime_percentage=0 if is_failure else 100,
                        updated_at=now,
                    )
                    db.add(status_record)
                else:
                    is_failure = exec_outcome != ExecutionOutcome.SUCCESS
                    total = (status_record.total_executions or 0) + 1
                    total_fail = (status_record.total_failures or 0) + (1 if is_failure else 0)
                    consec_fail = (
                        0 if not is_failure
                        else (status_record.consecutive_failures or 0) + 1
                    )
                    uptime = int(((total - total_fail) / total) * 100) if total > 0 else 0

                    status_record.health_status = agent_status
                    status_record.last_sync_at = now
                    status_record.last_sync_outcome = exec_outcome
                    status_record.last_sync_response_ms = r.response_time_ms
                    status_record.consecutive_failures = consec_fail
                    status_record.total_executions = total
                    status_record.total_failures = total_fail
                    status_record.uptime_percentage = uptime
                    status_record.updated_at = now
                    if is_failure:
                        status_record.last_error = r.error
                        status_record.last_error_at = now
                    if metrics_snapshot:
                        status_record.last_metrics_snapshot = metrics_snapshot

            except Exception as exc:
                log.warning("Failed to upsert agent status for %s: %s", r.ctx.connector_name, exc)

        await db.flush()
        log.debug("Agent statuses updated for %d connectors", len(results))

    async def _apply_health_rules(
        self,
        db: AsyncSession,
        project_id: str,
        exec_results: List[ConnectorExecutionResult],
        score_result: Any,
        log: logging.LoggerAdapter,
    ) -> tuple[List[str], float, str]:
        """
        Load and evaluate applicable health rules against the project context.

        Builds a project-level RuleEvaluationContext from the score result,
        then evaluates per-connector contexts for connector-scoped rules.

        Returns:
            Tuple of (rule_factor_lines, adjusted_score, final_status)
        """
        try:
            from app.services.health_rule_service import health_rule_service as rule_svc
            from app.models.health_rule import HealthRuleAuditLog, RuleAuditAction
            import uuid as _uuid

            rules = await rule_svc.get_applicable_rules(db, project_id)
            if not rules:
                return [], score_result.overall_score, score_result.overall_health_status

            failure_count = score_result.failure_count
            success_count = score_result.success_count
            total_active = failure_count + success_count
            availability_pct = (
                round((success_count / total_active) * 100, 2) if total_active > 0 else 100.0
            )

            project_context = RuleEvaluationContext(
                project_id=project_id,
                connector_id=None,
                health_status=score_result.overall_health_status,
                health_score=score_result.overall_score,
                availability_pct=availability_pct,
                consecutive_failures=failure_count,
                incident_count=failure_count,
            )

            rule_set_result = _rule_engine.evaluate(rules, project_context)

            rule_factor_lines = list(rule_set_result.explanation_lines)
            adjusted_score = round(
                min(100.0, max(0.0, score_result.overall_score + rule_set_result.total_score_impact)),
                2,
            )

            final_status = rule_set_result.status_override or score_result.overall_health_status

            if rule_set_result.rules_matched > 0:
                log.info(
                    "Health rules applied: matched=%d total_impact=%.2f adjusted_score=%.1f",
                    rule_set_result.rules_matched,
                    rule_set_result.total_score_impact,
                    adjusted_score,
                )
                asyncio.ensure_future(self._broadcast_rule_violations(
                    project_id, rules, rule_set_result, adjusted_score, final_status
                ))

            return rule_factor_lines, adjusted_score, final_status

        except Exception as exc:
            log.warning("Health rule evaluation failed (non-fatal): %s", exc)
            return [], score_result.overall_score, score_result.overall_health_status

    async def _broadcast_rule_violations(
        self,
        project_id: str,
        rules: list,
        rule_set_result: Any,
        adjusted_score: float,
        final_status: str,
    ) -> None:
        """Broadcast rule violation events to all connected WebSocket clients for the project."""
        try:
            from app.core.ws_manager import ws_manager
            matched_rules = [
                {
                    "rule_id": r.id,
                    "rule_name": r.name,
                    "severity": r.severity.value if hasattr(r.severity, "value") else r.severity,
                    "action": r.action.value if hasattr(r.action, "value") else r.action,
                }
                for r in rules
                if rule_set_result.rules_matched > 0
            ]
            payload = {
                "type": "rule_violation",
                "project_id": project_id,
                "rules_matched": rule_set_result.rules_matched,
                "total_score_impact": rule_set_result.total_score_impact,
                "adjusted_score": adjusted_score,
                "health_status": final_status,
                "explanation": rule_set_result.explanation_lines,
                "matched_rules": matched_rules[:10],
                "timestamp": datetime.utcnow().isoformat(),
            }
            await ws_manager.broadcast_to_project(project_id, payload)
        except Exception as exc:
            logger.debug("Rule violation broadcast failed (non-fatal): %s", exc)

    def _build_run_response(
        self,
        run: HealthRun,
        results: List[ConnectorExecutionResult],
        contributing_factors: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Build the API response dict for a completed health run."""
        connector_summaries = []
        for r in results:
            connector_summaries.append({
                "project_connector_id": r.ctx.pc_id,
                "connector_name": r.ctx.connector_name,
                "health_status": r.health_status,
                "outcome": r.outcome,
                "response_time_ms": r.response_time_ms,
                "error": r.error,
                "message": r.message,
                "duration_ms": r.duration_ms,
                "priority": r.ctx.priority,
                "is_enabled": r.ctx.is_enabled,
            })

        return {
            "run_id": run.id,
            "execution_id": run.execution_id,
            "project_id": run.project_id,
            "status": run.status.value,
            "overall_health_status": run.overall_health_status.value if run.overall_health_status else None,
            "overall_score": run.overall_score,
            "connector_count": run.connector_count,
            "success_count": run.success_count,
            "failure_count": run.failure_count,
            "skipped_count": run.skipped_count,
            "total_duration_ms": run.total_duration_ms,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "contributing_factors": contributing_factors or [],
            "connectors": connector_summaries,
        }


health_orchestrator = HealthOrchestrator()
