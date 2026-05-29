"""
Connector Agent Service.

Orchestrates connector execution by:
1. Loading project connector configuration and credentials
2. Resolving the correct connector implementation via the registry
3. Running test/health/metrics operations
4. Persisting execution logs and updating agent status records
5. Persisting application-level runtime metrics and health snapshots
6. Returning structured results to API endpoints
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.connectors.base.interface import (
    ConnectorAuthStrategy,
    ConnectorConfig,
    ConnectorCredentials,
    ConnectorHealthResult,
    ConnectorHealthStatus,
    ConnectorTestResult,
    HealthMetric,
)
from app.connectors.base.registry import ConnectorRegistry
from app.models.connector_execution_log import (
    AgentHealthStatus,
    ConnectorAgentStatus,
    ConnectorExecutionLog,
    ExecutionOutcome,
    ExecutionTrigger,
)
from app.models.project_connector import ProjectConnector, ProjectConnectorStatus

logger = logging.getLogger(__name__)

_OUTCOME_MAP: Dict[str, ExecutionOutcome] = {
    ConnectorHealthStatus.HEALTHY: ExecutionOutcome.SUCCESS,
    ConnectorHealthStatus.DEGRADED: ExecutionOutcome.SUCCESS,
    ConnectorHealthStatus.DOWN: ExecutionOutcome.FAILURE,
    ConnectorHealthStatus.TIMEOUT: ExecutionOutcome.TIMEOUT,
    ConnectorHealthStatus.ERROR: ExecutionOutcome.FAILURE,
    ConnectorHealthStatus.UNKNOWN: ExecutionOutcome.FAILURE,
}

_STATUS_MAP: Dict[str, AgentHealthStatus] = {
    ConnectorHealthStatus.HEALTHY: AgentHealthStatus.HEALTHY,
    ConnectorHealthStatus.DEGRADED: AgentHealthStatus.DEGRADED,
    ConnectorHealthStatus.DOWN: AgentHealthStatus.DOWN,
    ConnectorHealthStatus.TIMEOUT: AgentHealthStatus.TIMEOUT,
    ConnectorHealthStatus.ERROR: AgentHealthStatus.ERROR,
    ConnectorHealthStatus.UNKNOWN: AgentHealthStatus.UNKNOWN,
}


def _resolve_connector_slug(catalog_slug: str, catalog_category: str) -> str:
    slug = catalog_slug.lower()
    if ConnectorRegistry.is_registered(slug):
        return slug
    # Try with underscores instead of hyphens (e.g. "oracle-oem" -> "oracle_oem")
    underscore_slug = slug.replace("-", "_")
    if ConnectorRegistry.is_registered(underscore_slug):
        return underscore_slug
    # Try with hyphens instead of underscores
    hyphen_slug = slug.replace("_", "-")
    if ConnectorRegistry.is_registered(hyphen_slug):
        return hyphen_slug
    category_fallback = {
        "observability": "custom",
        "apm": "custom",
        "itsm": "custom",
        "database": "custom",
        "messaging": "custom",
        "custom": "custom",
        "cloud": "custom",
        "infrastructure": "custom",
    }
    return category_fallback.get(catalog_category.lower(), "custom")


def _build_config_and_credentials(
    pc: ProjectConnector,
    override_config: Optional[Dict[str, Any]] = None,
    override_credentials: Optional[Dict[str, Any]] = None,
    proxy_url: Optional[str] = None,
    proxy_strict_ssl: bool = True,
) -> tuple[ConnectorConfig, ConnectorCredentials, Dict[str, Any], Dict[str, Any]]:
    catalog = pc.catalog_entry

    raw_config: Dict[str, Any] = {}
    if pc.config:
        try:
            raw_config = json.loads(pc.config)
        except json.JSONDecodeError:
            pass

    raw_creds: Dict[str, Any] = {}
    if pc.credentials:
        try:
            raw_creds = json.loads(pc.credentials)
        except json.JSONDecodeError:
            pass

    if catalog and catalog.default_config:
        default = catalog.default_config
        merged_config = {**default, **raw_config}
    else:
        merged_config = dict(raw_config)

    if override_config:
        merged_config.update(override_config)
    if override_credentials:
        raw_creds.update(override_credentials)

    merged_all = {**merged_config, **raw_creds}

    base_url = (
        merged_all.get("base_url")
        or merged_all.get("controller_url")
        or merged_all.get("instance_url")
        or merged_all.get("api_url")
        or merged_all.get("vcenter_url")
        or merged_all.get("oem_url")
        or merged_all.get("splunk_url")
        or merged_all.get("grafana_url")
        or merged_all.get("host_url")
        or merged_all.get("server_url")
        or merged_all.get("endpoint_url")
        or merged_all.get("rest_proxy_url")
        or ""
    )
    timeout = int(merged_all.get("timeout_seconds", 30))
    verify_ssl = bool(merged_all.get("verify_ssl", True))

    connector_config = ConnectorConfig(
        base_url=base_url,
        timeout_seconds=timeout,
        max_retries=3,
        retry_backoff_factor=1.5,
        verify_ssl=verify_ssl,
        proxy_url=proxy_url,
        proxy_strict_ssl=proxy_strict_ssl,
        extra=merged_config,
    )

    auth_type: str = merged_config.get("auth_type", "").lower()
    token = raw_creds.get("token") or raw_creds.get("api_key") or merged_config.get("token")
    api_key = raw_creds.get("api_key") or raw_creds.get("token") or merged_config.get("api_key")
    username = raw_creds.get("username") or merged_config.get("username", "")
    password = raw_creds.get("password") or merged_config.get("password", "")

    catalog_slug = catalog.slug if catalog else ""
    if catalog_slug == "splunk":
        strategy = ConnectorAuthStrategy.SPLUNK_TOKEN
        token = raw_creds.get("token") or merged_config.get("token")
    elif catalog_slug in ("grafana",):
        strategy = ConnectorAuthStrategy.BEARER_TOKEN
    elif catalog_slug in ("appdynamics", "servicenow"):
        strategy = ConnectorAuthStrategy.BASIC_AUTH
        account = merged_config.get("account_name", "")
        if account and username and catalog_slug == "appdynamics":
            username = f"{username}@{account}"
    elif catalog_slug == "linborg":
        strategy = ConnectorAuthStrategy.API_KEY_HEADER
        api_key = token or api_key
    elif auth_type in ("bearer", "bearer_token"):
        strategy = ConnectorAuthStrategy.BEARER_TOKEN
    elif auth_type in ("basic", "basic_auth"):
        strategy = ConnectorAuthStrategy.BASIC_AUTH
    elif auth_type in ("api_key", "api_key_header"):
        strategy = ConnectorAuthStrategy.API_KEY_HEADER
    elif auth_type == "api_key_query":
        strategy = ConnectorAuthStrategy.API_KEY_QUERY
    elif auth_type in ("oauth2", "oauth2_client_credentials", "client_credentials"):
        strategy = ConnectorAuthStrategy.OAUTH2_CLIENT_CREDENTIALS
    else:
        strategy = ConnectorAuthStrategy.NONE

    # Build extra dict that includes token_url for OAuth2
    creds_extra = dict(merged_config)
    token_url = raw_creds.get("token_url") or merged_config.get("token_url")
    if token_url:
        creds_extra["token_url"] = token_url

    credentials = ConnectorCredentials(
        strategy=strategy,
        token=token,
        api_key=api_key,
        api_key_header_name=merged_config.get("api_key_header_name", "X-API-Key"),
        username=username,
        password=password,
        client_id=raw_creds.get("client_id") or merged_config.get("client_id"),
        client_secret=raw_creds.get("client_secret") or merged_config.get("client_secret"),
        extra=creds_extra,
    )

    return connector_config, credentials, merged_config, raw_creds


def _classify_metric_severity(value: float, warning: Optional[float], critical: Optional[float]) -> str:
    """Classify a metric value into severity level."""
    if critical is not None and value >= critical:
        return "critical"
    if warning is not None and value >= warning:
        return "warning"
    return "healthy"


def _compute_health_score_from_metrics(metrics_list: List[HealthMetric]) -> Dict[str, float]:
    """Derive per-category health scores from collected metrics."""
    scores: Dict[str, List[float]] = {
        "api": [],
        "jvm": [],
        "database": [],
        "mq": [],
        "kubernetes": [],
        "application": [],
    }

    for m in metrics_list:
        category = m.labels.get("metric_category", "")
        scope = m.labels.get("metric_scope", "")
        name = m.name

        if name.endswith(".health_score"):
            scores["application"].append(m.value)
        elif scope == "api" or category in ("latency", "errors", "throughput"):
            if "error_rate" in name:
                scores["api"].append(max(0, 100 - m.value * 2))
            elif "response_time" in name and "avg" in name:
                scores["api"].append(max(0, 100 - (m.value / 10)))
        elif scope == "jvm":
            if "heap_utilization" in name:
                scores["jvm"].append(max(0, 100 - m.value))
        elif scope == "database":
            if "avg_query" in name:
                scores["database"].append(max(0, 100 - (m.value / 10)))
        elif scope == "mq":
            if "queue_depth" in name:
                scores["mq"].append(max(0, 100 - (m.value / 10)))
        elif scope == "kubernetes":
            if "failed_pods" in name:
                scores["kubernetes"].append(max(0, 100 - (m.value * 20)))

    result: Dict[str, float] = {}
    for cat, vals in scores.items():
        result[cat] = round(sum(vals) / len(vals), 1) if vals else 100.0

    all_vals = [v for v in result.values()]
    result["overall"] = round(sum(all_vals) / len(all_vals), 1) if all_vals else 100.0
    return result


class ConnectorAgentService:
    """Service that runs connector agents and records results."""

    async def _load_proxy_settings(self, db: AsyncSession) -> tuple[Optional[str], bool]:
        """Load platform proxy settings from DB. Returns (proxy_url, proxy_strict_ssl)."""
        try:
            from app.models.platform_proxy import PlatformProxySettings
            result = await db.execute(
                select(PlatformProxySettings).where(PlatformProxySettings.id == "default")
            )
            proxy_settings = result.scalar_one_or_none()
            if proxy_settings and proxy_settings.is_enabled and proxy_settings.proxy_url:
                return proxy_settings.proxy_url, proxy_settings.proxy_strict_ssl
        except Exception as exc:
            logger.warning("Failed to load proxy settings: %s", exc)
        return None, True

    async def test_connection(
        self,
        db: AsyncSession,
        pc_id: str,
        override_config: Optional[Dict[str, Any]] = None,
        override_credentials: Optional[Dict[str, Any]] = None,
        triggered_by: ExecutionTrigger = ExecutionTrigger.API,
        executor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        pc = await self._load_pc(db, pc_id)
        if not pc:
            return {"success": False, "error": "Project connector not found"}

        if not pc.catalog_entry:
            return {"success": False, "error": "Catalog entry not found for this connector"}

        proxy_url, proxy_strict_ssl = await self._load_proxy_settings(db)
        connector_config, credentials, merged_config, _ = _build_config_and_credentials(
            pc, override_config, override_credentials,
            proxy_url=proxy_url, proxy_strict_ssl=proxy_strict_ssl,
        )

        if not connector_config.base_url:
            return {
                "success": False,
                "error": "No base URL configured. Please configure the connector first.",
                "details": {},
            }

        catalog_slug = pc.catalog_entry.slug if pc.catalog_entry else ""
        catalog_category = (
            pc.catalog_entry.category.value
            if pc.catalog_entry and hasattr(pc.catalog_entry.category, "value")
            else str(pc.catalog_entry.category if pc.catalog_entry else "custom")
        )
        resolved_slug = _resolve_connector_slug(catalog_slug, catalog_category)
        connector_instance = ConnectorRegistry.build(resolved_slug, connector_config, credentials)

        if not connector_instance:
            return {"success": False, "error": f"No connector implementation for slug '{resolved_slug}'"}

        validation_errors = connector_instance.validate_config()
        if validation_errors:
            return {
                "success": False,
                "error": "Configuration validation failed: " + "; ".join(validation_errors),
                "details": {"validation_errors": validation_errors},
            }

        try:
            result: ConnectorTestResult = await connector_instance.test_connection()
        except Exception as exc:
            logger.exception("Unhandled exception in connector test_connection for %s", pc_id)
            result = ConnectorTestResult(
                success=False,
                error=f"Internal error: {exc}",
            )

        outcome = ExecutionOutcome.SUCCESS if result.success else ExecutionOutcome.FAILURE
        if result.error and "timed out" in (result.error or "").lower():
            outcome = ExecutionOutcome.TIMEOUT
        elif result.error and "auth" in (result.error or "").lower():
            outcome = ExecutionOutcome.AUTH_ERROR

        log = ConnectorExecutionLog(
            id=str(uuid.uuid4()),
            project_connector_id=pc_id,
            triggered_by=triggered_by,
            outcome=outcome,
            response_time_ms=result.response_time_ms,
            error_message=result.error,
            raw_response_snippet=json.dumps(result.details)[:2000] if result.details else None,
            executed_by=executor_id,
            executed_at=datetime.utcnow(),
        )
        db.add(log)

        pc.last_test_at = datetime.utcnow()
        pc.last_test_success = result.success
        pc.last_test_error = result.error
        pc.last_test_response_ms = result.response_time_ms
        pc.status = (
            ProjectConnectorStatus.CONFIGURED if result.success
            else ProjectConnectorStatus.ERROR
        )

        await self._upsert_agent_status(
            db,
            pc_id,
            health_status=AgentHealthStatus.HEALTHY if result.success else AgentHealthStatus.DOWN,
            outcome=outcome,
            response_ms=result.response_time_ms,
            error=result.error,
        )

        await db.flush()
        return {
            "success": result.success,
            "response_time_ms": result.response_time_ms,
            "status_code": result.status_code,
            "error": result.error,
            "details": result.details,
            "authenticated": result.authenticated,
            "connector_slug": resolved_slug,
            "executed_at": log.executed_at.isoformat(),
        }

    async def sync_health(
        self,
        db: AsyncSession,
        pc_id: str,
        triggered_by: ExecutionTrigger = ExecutionTrigger.API,
        executor_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run a full health sync for a project connector.

        Returns normalized health result and persists:
        - execution log + agent status
        - application runtime metrics (per HealthMetric with labels)
        - application metric history (hourly rollup)
        - application health snapshot
        """
        pc = await self._load_pc(db, pc_id)
        if not pc:
            return {"success": False, "error": "Project connector not found"}

        if not pc.catalog_entry:
            return {"success": False, "error": "Catalog entry not found"}

        if not pc.is_enabled:
            return {"success": False, "error": "Connector is disabled", "skipped": True}

        proxy_url, proxy_strict_ssl = await self._load_proxy_settings(db)
        connector_config, credentials, merged_config, _ = _build_config_and_credentials(
            pc, proxy_url=proxy_url, proxy_strict_ssl=proxy_strict_ssl
        )
        if not connector_config.base_url:
            return {
                "success": False,
                "error": "No base URL configured",
                "health_status": AgentHealthStatus.UNCONFIGURED.value,
            }

        catalog_slug = pc.catalog_entry.slug if pc.catalog_entry else ""
        catalog_category = (
            pc.catalog_entry.category.value
            if pc.catalog_entry and hasattr(pc.catalog_entry.category, "value")
            else str(pc.catalog_entry.category if pc.catalog_entry else "custom")
        )
        resolved_slug = _resolve_connector_slug(catalog_slug, catalog_category)
        connector_instance = ConnectorRegistry.build(resolved_slug, connector_config, credentials)

        if not connector_instance:
            return {"success": False, "error": f"No connector implementation for '{resolved_slug}'"}

        try:
            health_result: ConnectorHealthResult = await connector_instance.fetch_health()
        except Exception as exc:
            logger.exception("Unhandled exception in connector fetch_health for %s", pc_id)
            health_result = ConnectorHealthResult(
                status=ConnectorHealthStatus.ERROR,
                response_time_ms=0,
                error=f"Internal error: {exc}",
            )

        outcome = _OUTCOME_MAP.get(health_result.status.value, ExecutionOutcome.FAILURE)
        agent_status = _STATUS_MAP.get(health_result.status.value, AgentHealthStatus.UNKNOWN)

        metrics_list: List[HealthMetric] = []
        try:
            metrics_list = await connector_instance.fetch_metrics()
        except Exception as exc:
            logger.warning("Failed to fetch metrics for %s: %s", pc_id, exc)

        metrics_snapshot = None
        if metrics_list:
            metrics_snapshot = json.dumps([
                {
                    "name": m.name,
                    "value": m.value,
                    "unit": m.unit,
                    "description": m.description,
                }
                for m in metrics_list
            ])

        raw_snippet = None
        if health_result.raw_response:
            try:
                raw_snippet = json.dumps(health_result.raw_response)[:2000]
            except Exception:
                pass

        log = ConnectorExecutionLog(
            id=str(uuid.uuid4()),
            project_connector_id=pc_id,
            triggered_by=triggered_by,
            outcome=outcome,
            response_time_ms=health_result.response_time_ms,
            error_message=health_result.error,
            raw_response_snippet=raw_snippet,
            metrics_snapshot=metrics_snapshot,
            executed_by=executor_id,
            executed_at=datetime.utcnow(),
        )
        db.add(log)

        await self._upsert_agent_status(
            db,
            pc_id,
            health_status=agent_status,
            outcome=outcome,
            response_ms=health_result.response_time_ms,
            error=health_result.error,
            metrics_snapshot=metrics_snapshot,
        )

        # Persist application-level runtime metrics and snapshots
        app_name = merged_config.get("application_name", "")
        env = merged_config.get("environment", "production")
        if app_name and metrics_list:
            await self._persist_application_metrics(
                db=db,
                pc_id=pc_id,
                connector_slug=resolved_slug,
                app_name=app_name,
                env=env,
                metrics_list=metrics_list,
                merged_config=merged_config,
            )

        await db.flush()

        return {
            "success": health_result.status in (
                ConnectorHealthStatus.HEALTHY, ConnectorHealthStatus.DEGRADED
            ),
            "health_status": health_result.status.value,
            "response_time_ms": health_result.response_time_ms,
            "message": health_result.message,
            "error": health_result.error,
            "metrics": [
                {"name": m.name, "value": m.value, "unit": m.unit}
                for m in metrics_list
            ],
            "connector_slug": resolved_slug,
            "executed_at": log.executed_at.isoformat(),
            "application_name": app_name or None,
            "environment": env,
        }

    async def _persist_application_metrics(
        self,
        db: AsyncSession,
        pc_id: str,
        connector_slug: str,
        app_name: str,
        env: str,
        metrics_list: List[HealthMetric],
        merged_config: Dict[str, Any],
    ) -> None:
        """Persist application-scoped runtime metrics to the database."""
        from app.models.application_runtime import (
            ApplicationRuntimeMetric,
            ApplicationMetricHistory,
            ApplicationHealthSnapshot,
        )

        now = datetime.utcnow()
        service_name = merged_config.get("service_name", "")
        namespace = merged_config.get("namespace", "")

        # Default thresholds per category
        DEFAULT_THRESHOLDS: Dict[str, tuple[float, float]] = {
            "error_rate_pct": (5.0, 15.0),
            "avg_response_time_ms": (500.0, 2000.0),
            "p95_response_time_ms": (1000.0, 5000.0),
            "jvm_heap_utilization_pct": (70.0, 90.0),
            "k8s_failed_pods": (1.0, 3.0),
            "db_avg_query_ms": (200.0, 1000.0),
        }

        app_runtime_metrics: List[ApplicationRuntimeMetric] = []
        history_metrics: List[ApplicationMetricHistory] = []
        health_score = 100.0
        avg_rt = None
        p95_rt = None
        p99_rt = None
        total_req = None
        failed_req = None

        for m in metrics_list:
            labels = m.labels or {}
            if not labels.get("application_name"):
                continue

            metric_key = m.name.split(".")[-1] if "." in m.name else m.name
            warning_t, critical_t = DEFAULT_THRESHOLDS.get(metric_key, (None, None))
            severity = _classify_metric_severity(m.value, warning_t, critical_t)

            if metric_key == "health_score":
                health_score = m.value

            # Capture key metrics for snapshot
            if "avg_response_time" in metric_key:
                avg_rt = m.value
            elif "p95_response_time" in metric_key:
                p95_rt = m.value
            elif "p99_response_time" in metric_key:
                p99_rt = m.value
            elif "calls_per_minute" in metric_key or "tps" in metric_key:
                total_req = int(m.value * 15) if m.value else None
            elif "errors_per_minute" in metric_key:
                failed_req = int(m.value * 15) if m.value else None

            app_runtime_metrics.append(ApplicationRuntimeMetric(
                id=str(uuid.uuid4()),
                project_connector_id=pc_id,
                connector_type=connector_slug,
                application_name=app_name,
                environment=env,
                service_name=service_name,
                namespace=namespace,
                metric_category=labels.get("metric_category", ""),
                metric_key=metric_key,
                metric_name=m.name,
                metric_scope=labels.get("metric_scope", ""),
                metric_value=m.value,
                metric_unit=m.unit,
                warning_threshold=warning_t,
                critical_threshold=critical_t,
                health_score=health_score if metric_key == "health_score" else None,
                severity=severity,
                source_index=merged_config.get("index", merged_config.get("index_name", "")),
                source_entity=labels.get("app_id", ""),
                collected_at=now,
                created_at=now,
            ))

            history_metrics.append(ApplicationMetricHistory(
                id=str(uuid.uuid4()),
                application_name=app_name,
                environment=env,
                metric_key=metric_key,
                metric_value=m.value,
                metric_unit=m.unit,
                aggregation_type="latest",
                min_value=m.value,
                max_value=m.value,
                avg_value=m.value,
                p95_value=m.value,
                p99_value=m.value,
                collected_at=now,
            ))

        for arm in app_runtime_metrics:
            db.add(arm)
        for hm in history_metrics:
            db.add(hm)

        # Compute per-category scores and persist snapshot
        score_map = _compute_health_score_from_metrics(metrics_list)
        snapshot = ApplicationHealthSnapshot(
            id=str(uuid.uuid4()),
            application_name=app_name,
            environment=env,
            project_connector_id=pc_id,
            overall_health_score=score_map.get("overall", health_score),
            runtime_health_score=score_map.get("application", health_score),
            infrastructure_health_score=score_map.get("kubernetes", 100.0),
            api_health_score=score_map.get("api", 100.0),
            database_health_score=score_map.get("database", 100.0),
            mq_health_score=score_map.get("mq", 100.0),
            active_alerts=sum(1 for m in app_runtime_metrics if m.severity in ("warning", "critical")),
            critical_alerts=sum(1 for m in app_runtime_metrics if m.severity == "critical"),
            total_requests=total_req,
            failed_requests=failed_req,
            avg_response_time=avg_rt,
            p95_response_time=p95_rt,
            p99_response_time=p99_rt,
            snapshot_timestamp=now,
        )
        db.add(snapshot)

    async def get_application_metrics(
        self,
        db: AsyncSession,
        application_name: str,
        environment: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Return recent application runtime metrics."""
        from app.models.application_runtime import ApplicationRuntimeMetric
        from sqlalchemy import desc

        query = (
            select(ApplicationRuntimeMetric)
            .where(ApplicationRuntimeMetric.application_name == application_name)
        )
        if environment:
            query = query.where(ApplicationRuntimeMetric.environment == environment)
        query = query.order_by(desc(ApplicationRuntimeMetric.collected_at)).limit(limit)

        result = await db.execute(query)
        rows = result.scalars().all()
        return [
            {
                "id": r.id,
                "application_name": r.application_name,
                "environment": r.environment,
                "service_name": r.service_name,
                "namespace": r.namespace,
                "metric_category": r.metric_category,
                "metric_key": r.metric_key,
                "metric_name": r.metric_name,
                "metric_scope": r.metric_scope,
                "metric_value": r.metric_value,
                "metric_unit": r.metric_unit,
                "severity": r.severity,
                "health_score": r.health_score,
                "collected_at": r.collected_at.isoformat() if r.collected_at else None,
            }
            for r in rows
        ]

    async def get_application_health_snapshot(
        self,
        db: AsyncSession,
        application_name: str,
        environment: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Return the latest health snapshot for an application."""
        from app.models.application_runtime import ApplicationHealthSnapshot
        from sqlalchemy import desc

        query = (
            select(ApplicationHealthSnapshot)
            .where(ApplicationHealthSnapshot.application_name == application_name)
        )
        if environment:
            query = query.where(ApplicationHealthSnapshot.environment == environment)
        query = query.order_by(desc(ApplicationHealthSnapshot.snapshot_timestamp)).limit(1)

        result = await db.execute(query)
        snap = result.scalar_one_or_none()
        if not snap:
            return None
        return {
            "application_name": snap.application_name,
            "environment": snap.environment,
            "overall_health_score": snap.overall_health_score,
            "runtime_health_score": snap.runtime_health_score,
            "infrastructure_health_score": snap.infrastructure_health_score,
            "api_health_score": snap.api_health_score,
            "database_health_score": snap.database_health_score,
            "mq_health_score": snap.mq_health_score,
            "active_alerts": snap.active_alerts,
            "critical_alerts": snap.critical_alerts,
            "total_requests": snap.total_requests,
            "failed_requests": snap.failed_requests,
            "avg_response_time": snap.avg_response_time,
            "p95_response_time": snap.p95_response_time,
            "p99_response_time": snap.p99_response_time,
            "snapshot_timestamp": snap.snapshot_timestamp.isoformat() if snap.snapshot_timestamp else None,
        }

    async def get_application_metric_history(
        self,
        db: AsyncSession,
        application_name: str,
        metric_key: str,
        environment: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Return historical metric values for trend analysis."""
        from app.models.application_runtime import ApplicationMetricHistory
        from sqlalchemy import desc

        query = (
            select(ApplicationMetricHistory)
            .where(
                ApplicationMetricHistory.application_name == application_name,
                ApplicationMetricHistory.metric_key == metric_key,
            )
        )
        if environment:
            query = query.where(ApplicationMetricHistory.environment == environment)
        query = query.order_by(desc(ApplicationMetricHistory.collected_at)).limit(limit)

        result = await db.execute(query)
        rows = result.scalars().all()
        return [
            {
                "metric_key": r.metric_key,
                "metric_value": r.metric_value,
                "metric_unit": r.metric_unit,
                "avg_value": r.avg_value,
                "min_value": r.min_value,
                "max_value": r.max_value,
                "p95_value": r.p95_value,
                "p99_value": r.p99_value,
                "collected_at": r.collected_at.isoformat() if r.collected_at else None,
            }
            for r in rows
        ]

    async def get_project_application_names(
        self, db: AsyncSession, project_id: str
    ) -> List[str]:
        """Return distinct application names that have been synced for a project."""
        from app.models.application_runtime import ApplicationRuntimeMetric
        from sqlalchemy import distinct

        result = await db.execute(
            select(distinct(ApplicationRuntimeMetric.application_name))
            .join(
                ProjectConnector,
                ApplicationRuntimeMetric.project_connector_id == ProjectConnector.id,
            )
            .where(ProjectConnector.project_id == project_id)
        )
        return [row[0] for row in result.all() if row[0]]

    async def get_status(
        self, db: AsyncSession, pc_id: str
    ) -> Optional[Dict[str, Any]]:
        result = await db.execute(
            select(ConnectorAgentStatus).where(
                ConnectorAgentStatus.project_connector_id == pc_id
            )
        )
        status_record = result.scalar_one_or_none()
        if not status_record:
            return None
        return {
            "project_connector_id": pc_id,
            "health_status": status_record.health_status.value,
            "last_sync_at": status_record.last_sync_at.isoformat() if status_record.last_sync_at else None,
            "last_sync_outcome": status_record.last_sync_outcome.value if status_record.last_sync_outcome else None,
            "last_sync_response_ms": status_record.last_sync_response_ms,
            "last_error": status_record.last_error,
            "last_error_at": status_record.last_error_at.isoformat() if status_record.last_error_at else None,
            "consecutive_failures": status_record.consecutive_failures,
            "total_executions": status_record.total_executions,
            "total_failures": status_record.total_failures,
            "uptime_percentage": status_record.uptime_percentage,
            "updated_at": status_record.updated_at.isoformat() if status_record.updated_at else None,
        }

    async def get_execution_logs(
        self,
        db: AsyncSession,
        pc_id: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        from sqlalchemy import desc
        result = await db.execute(
            select(ConnectorExecutionLog)
            .where(ConnectorExecutionLog.project_connector_id == pc_id)
            .order_by(desc(ConnectorExecutionLog.executed_at))
            .limit(limit)
        )
        logs = result.scalars().all()
        return [
            {
                "id": log.id,
                "triggered_by": log.triggered_by.value,
                "outcome": log.outcome.value,
                "response_time_ms": log.response_time_ms,
                "http_status_code": log.http_status_code,
                "error_message": log.error_message,
                "executed_at": log.executed_at.isoformat() if log.executed_at else None,
            }
            for log in logs
        ]

    async def get_project_statuses(
        self, db: AsyncSession, project_id: str
    ) -> List[Dict[str, Any]]:
        result = await db.execute(
            select(ConnectorAgentStatus)
            .join(
                ProjectConnector,
                ConnectorAgentStatus.project_connector_id == ProjectConnector.id,
            )
            .where(ProjectConnector.project_id == project_id)
        )
        statuses = result.scalars().all()
        return [
            {
                "project_connector_id": s.project_connector_id,
                "health_status": s.health_status.value,
                "last_sync_at": s.last_sync_at.isoformat() if s.last_sync_at else None,
                "last_sync_outcome": s.last_sync_outcome.value if s.last_sync_outcome else None,
                "last_sync_response_ms": s.last_sync_response_ms,
                "last_error": s.last_error,
                "last_error_at": s.last_error_at.isoformat() if s.last_error_at else None,
                "consecutive_failures": s.consecutive_failures,
                "total_executions": s.total_executions,
                "total_failures": s.total_failures,
                "uptime_percentage": s.uptime_percentage,
                "last_metrics_snapshot": s.last_metrics_snapshot,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in statuses
        ]

    async def _load_pc(self, db: AsyncSession, pc_id: str) -> Optional[ProjectConnector]:
        result = await db.execute(
            select(ProjectConnector)
            .options(selectinload(ProjectConnector.catalog_entry))
            .where(ProjectConnector.id == pc_id)
        )
        return result.scalar_one_or_none()

    async def _upsert_agent_status(
        self,
        db: AsyncSession,
        pc_id: str,
        health_status: AgentHealthStatus,
        outcome: ExecutionOutcome,
        response_ms: Optional[int],
        error: Optional[str],
        metrics_snapshot: Optional[str] = None,
    ) -> None:
        result = await db.execute(
            select(ConnectorAgentStatus).where(
                ConnectorAgentStatus.project_connector_id == pc_id
            )
        )
        status_record = result.scalar_one_or_none()
        now = datetime.utcnow()

        if status_record is None:
            status_record = ConnectorAgentStatus(
                id=str(uuid.uuid4()),
                project_connector_id=pc_id,
                health_status=health_status,
                last_sync_at=now,
                last_sync_outcome=outcome,
                last_sync_response_ms=response_ms,
                last_error=error if outcome != ExecutionOutcome.SUCCESS else None,
                last_error_at=now if outcome != ExecutionOutcome.SUCCESS else None,
                consecutive_failures=0 if outcome == ExecutionOutcome.SUCCESS else 1,
                total_executions=1,
                total_failures=0 if outcome == ExecutionOutcome.SUCCESS else 1,
                uptime_percentage=100 if outcome == ExecutionOutcome.SUCCESS else 0,
                last_metrics_snapshot=metrics_snapshot,
                updated_at=now,
            )
            db.add(status_record)
        else:
            total = (status_record.total_executions or 0) + 1
            total_fail = (status_record.total_failures or 0) + (
                0 if outcome == ExecutionOutcome.SUCCESS else 1
            )
            consec_fail = (
                0 if outcome == ExecutionOutcome.SUCCESS
                else (status_record.consecutive_failures or 0) + 1
            )
            uptime = int(((total - total_fail) / total) * 100) if total > 0 else 0

            status_record.health_status = health_status
            status_record.last_sync_at = now
            status_record.last_sync_outcome = outcome
            status_record.last_sync_response_ms = response_ms
            status_record.consecutive_failures = consec_fail
            status_record.total_executions = total
            status_record.total_failures = total_fail
            status_record.uptime_percentage = uptime
            status_record.updated_at = now
            if outcome != ExecutionOutcome.SUCCESS:
                status_record.last_error = error
                status_record.last_error_at = now
            if metrics_snapshot:
                status_record.last_metrics_snapshot = metrics_snapshot

        await db.flush()


connector_agent_service = ConnectorAgentService()
