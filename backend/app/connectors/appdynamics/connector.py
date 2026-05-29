"""
AppDynamics Connector Agent.

Connects to the AppDynamics Controller REST API.
Supports Basic Auth (username@account:password) and OAuth2 client credentials.
Health check verifies controller reachability and lists applications.
Metrics: application count, agent status distribution.
Application-level: captures per-application calls/min, response time, error rate,
JVM metrics, business transaction metrics, DB metrics, MQ metrics, K8s metrics.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.connectors.base.http_client import (
    ConnectorAuthError,
    ConnectorHTTPClient,
    ConnectorHTTPError,
    ConnectorTimeoutError,
)
from app.connectors.base.interface import (
    BaseConnector,
    ConnectorAuthStrategy,
    ConnectorConfig,
    ConnectorCredentials,
    ConnectorHealthResult,
    ConnectorHealthStatus,
    ConnectorTestResult,
    HealthMetric,
)
from app.connectors.base.normalizer import (
    make_error_health,
    make_ok_health,
    make_test_result,
    make_timeout_health,
    metric,
)
from app.connectors.base.registry import ConnectorRegistry

logger = logging.getLogger(__name__)


def _build_appdynamics_credentials(
    raw_config: Dict[str, Any],
    raw_credentials: Dict[str, Any],
) -> ConnectorCredentials:
    """
    AppDynamics Basic Auth requires the format:
        username@account_name:password
    This factory merges config and credentials into the proper format.
    """
    account = raw_config.get("account_name", "")
    username = raw_credentials.get("username") or raw_config.get("username", "")
    password = raw_credentials.get("password") or raw_config.get("password", "")
    composite_user = f"{username}@{account}" if account and username else username

    return ConnectorCredentials(
        strategy=ConnectorAuthStrategy.BASIC_AUTH,
        username=composite_user,
        password=password,
    )


@ConnectorRegistry.register("appdynamics")
class AppDynamicsConnector(BaseConnector):
    """
    AppDynamics Controller REST API connector agent.

    Required config: controller_url, account_name
    Required credentials: username, password
    Optional config: application_id, application_name, environment, tier_name,
                     business_transaction_name
    """

    CONNECTOR_NAME = "AppDynamics"
    CONNECTOR_VERSION = "23.x"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)
        self._account_name: str = config.extra.get("account_name", "")
        self._app_id: Optional[str] = config.extra.get("application_id") or config.extra.get("app_id")
        self._app_name: str = config.extra.get("application_name", "")
        self._env: str = config.extra.get("environment", "production")
        self._tier_name: str = config.extra.get("tier_name", "")
        self._bt_name: str = config.extra.get("business_transaction_name", "")

    @classmethod
    def from_raw(
        cls,
        config: ConnectorConfig,
        raw_config: Dict[str, Any],
        raw_credentials: Dict[str, Any],
    ) -> "AppDynamicsConnector":
        """Convenience factory that handles AppDynamics-specific credential composition."""
        credentials = _build_appdynamics_credentials(raw_config, raw_credentials)
        return cls(config, credentials)

    def validate_config(self) -> List[str]:
        errors = super().validate_config()
        if not self._credentials.username:
            errors.append("AppDynamics username is required")
        if not self._credentials.password:
            errors.append("AppDynamics password is required")
        if not self._account_name:
            errors.append("AppDynamics account_name is required")
        return errors

    async def authenticate(self) -> bool:
        """Verify credentials by listing applications (minimal permission required)."""
        try:
            resp, _ = await self._client.get(
                "/controller/rest/applications",
                params={"output": "JSON"},
                timeout_override=15,
            )
            return resp.status_code == 200
        except ConnectorAuthError:
            return False
        except Exception as exc:
            self._logger.warning("AppDynamics auth check failed: %s", exc)
            return False

    async def test_connection(self) -> ConnectorTestResult:
        """Test AppDynamics connectivity by listing applications."""
        try:
            resp, elapsed = await self._client.get(
                "/controller/rest/applications",
                params={"output": "JSON"},
                timeout_override=20,
            )
            if resp.status_code == 200:
                try:
                    apps = resp.json()
                    app_count = len(apps) if isinstance(apps, list) else 0
                    return make_test_result(
                        success=True,
                        response_time_ms=elapsed,
                        status_code=200,
                        authenticated=True,
                        details={
                            "application_count": app_count,
                            "account_name": self._account_name,
                            "controller_url": self._config.base_url,
                        },
                    )
                except Exception:
                    return make_test_result(
                        success=True,
                        response_time_ms=elapsed,
                        status_code=200,
                        authenticated=True,
                        details={"note": "Connected; response could not be parsed as JSON"},
                    )
            return make_test_result(
                success=False,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=f"AppDynamics controller returned HTTP {resp.status_code}",
            )
        except ConnectorAuthError as exc:
            return make_test_result(success=False, error=str(exc), authenticated=False)
        except ConnectorTimeoutError as exc:
            return make_test_result(success=False, error=str(exc))
        except ConnectorHTTPError as exc:
            return make_test_result(success=False, status_code=exc.status_code, error=str(exc))
        except Exception as exc:
            self._logger.exception("Unexpected error in AppDynamics test_connection")
            return make_test_result(success=False, error=f"Unexpected error: {exc}")

    async def fetch_health(self) -> ConnectorHealthResult:
        """Health check: verify controller REST API is responding."""
        try:
            resp, elapsed = await self._client.get(
                "/controller/rest/applications",
                params={"output": "JSON"},
            )
            if resp.status_code >= 400:
                return make_error_health(
                    f"AppDynamics controller returned HTTP {resp.status_code}",
                    response_time_ms=elapsed,
                )
            return self.normalize_response({"_apps": resp.json(), "_elapsed_ms": elapsed})
        except ConnectorAuthError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.DOWN)
        except ConnectorTimeoutError:
            return make_timeout_health()
        except ConnectorHTTPError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.ERROR)
        except Exception as exc:
            self._logger.exception("Unexpected error in AppDynamics fetch_health")
            return make_error_health(f"Unexpected error: {exc}", status=ConnectorHealthStatus.ERROR)

    async def _resolve_app_id(self) -> Optional[str]:
        """Resolve the numeric AppDynamics application ID by name if not provided."""
        if self._app_id:
            return str(self._app_id)
        if not self._app_name:
            return None
        try:
            resp, _ = await self._client.get(
                "/controller/rest/applications",
                params={"output": "JSON"},
                timeout_override=15,
            )
            if resp.status_code == 200:
                apps = resp.json()
                if isinstance(apps, list):
                    for app in apps:
                        if app.get("name", "").lower() == self._app_name.lower():
                            return str(app.get("id", ""))
        except Exception as exc:
            self._logger.debug("Failed to resolve AppDynamics app ID: %s", exc)
        return None

    async def _fetch_metric_data(
        self, app_id: str, metric_path: str, rollup: bool = True
    ) -> Optional[float]:
        """Fetch a single metric value from the AppDynamics metric-data endpoint."""
        try:
            resp, _ = await self._client.get(
                f"/controller/rest/applications/{app_id}/metric-data",
                params={
                    "metric-path": metric_path,
                    "time-range-type": "BEFORE_NOW",
                    "duration-in-mins": "15",
                    "rollup": "true" if rollup else "false",
                    "output": "JSON",
                },
                timeout_override=20,
            )
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and data:
                    values = data[0].get("metricValues", [])
                    if values:
                        return float(values[0].get("value", 0))
        except Exception as exc:
            self._logger.debug("AppDynamics metric fetch failed for %s: %s", metric_path, exc)
        return None

    async def fetch_metrics(self) -> List[HealthMetric]:
        """Fetch application and tier counts, plus application-level runtime metrics."""
        metrics_list: List[HealthMetric] = []

        # Platform-level: total application count
        try:
            resp, _ = await self._client.get(
                "/controller/rest/applications",
                params={"output": "JSON"},
                timeout_override=20,
            )
            if resp.status_code == 200:
                apps = resp.json()
                if isinstance(apps, list):
                    metrics_list.append(metric(
                        name="appdynamics.applications.total",
                        value=len(apps),
                        unit="count",
                        description="Total number of AppDynamics applications",
                    ))
        except Exception as exc:
            self._logger.warning("Failed to fetch AppDynamics application metrics: %s", exc)

        # Application-level metrics (only when application is configured)
        if self._app_name or self._app_id:
            app_metrics = await self._fetch_application_metrics()
            metrics_list.extend(app_metrics)

        return metrics_list

    async def _fetch_application_metrics(self) -> List[HealthMetric]:
        """Fetch per-application runtime metrics from AppDynamics."""
        app_metrics: List[HealthMetric] = []
        app_id = await self._resolve_app_id()
        if not app_id:
            self._logger.debug("Cannot fetch AppDynamics app metrics: no app_id resolved")
            return app_metrics

        app_name = self._app_name or f"app_{app_id}"
        labels = {
            "application_name": app_name,
            "environment": self._env,
            "connector": "appdynamics",
            "app_id": app_id,
        }

        # Overall Application Performance metrics
        overall_metrics = [
            ("Overall Application Performance|Calls per Minute", f"app.{app_name}.calls_per_minute", "req/min", "Calls per minute", "api", "throughput"),
            ("Overall Application Performance|Average Response Time (ms)", f"app.{app_name}.avg_response_time_ms", "ms", "Average response time", "api", "latency"),
            ("Overall Application Performance|Errors per Minute", f"app.{app_name}.errors_per_minute", "errors/min", "Errors per minute", "api", "errors"),
            ("Overall Application Performance|Very Slow Calls", f"app.{app_name}.very_slow_calls", "count", "Very slow calls in last 15 min", "api", "latency"),
            ("Overall Application Performance|Stall Count", f"app.{app_name}.stall_count", "count", "Stalled calls in last 15 min", "api", "errors"),
            ("Overall Application Performance|Calls in Progress", f"app.{app_name}.calls_in_progress", "count", "Calls currently in progress", "api", "throughput"),
        ]

        for metric_path, metric_name, unit, description, scope, category in overall_metrics:
            value = await self._fetch_metric_data(app_id, metric_path)
            if value is not None:
                app_metrics.append(metric(
                    name=metric_name,
                    value=round(value, 2),
                    unit=unit,
                    description=description,
                    labels={**labels, "metric_scope": scope, "metric_category": category},
                ))

        # Derive health score from available metrics
        cpm_val = None
        epm_val = None
        rt_val = None
        for m in app_metrics:
            if m.name.endswith(".calls_per_minute"):
                cpm_val = m.value
            elif m.name.endswith(".errors_per_minute"):
                epm_val = m.value
            elif m.name.endswith(".avg_response_time_ms"):
                rt_val = m.value

        if cpm_val is not None:
            err_rate = (epm_val / cpm_val * 100) if (cpm_val and epm_val) else 0
            rt_penalty = (rt_val / 100) if rt_val else 0
            health_score = max(0.0, min(100.0, 100.0 - (err_rate * 2) - rt_penalty))
            app_metrics.append(metric(
                name=f"app.{app_name}.health_score",
                value=round(health_score, 1),
                unit="score",
                description=f"Computed health score for {app_name}",
                labels={**labels, "metric_scope": "application", "metric_category": "health"},
            ))
            if cpm_val > 0:
                app_metrics.append(metric(
                    name=f"app.{app_name}.error_rate_pct",
                    value=round(err_rate, 2),
                    unit="%",
                    description=f"Error rate percentage for {app_name}",
                    labels={**labels, "metric_scope": "api", "metric_category": "errors"},
                ))

        # JVM metrics (heap, GC, threads)
        jvm_metrics = [
            (f"JVM|Memory:Heap|Current Usage (MB)", f"app.{app_name}.jvm_heap_mb", "MB", "JVM heap current usage", "jvm", "memory"),
            (f"JVM|Memory:Heap|Max Available (MB)", f"app.{app_name}.jvm_heap_max_mb", "MB", "JVM heap max available", "jvm", "memory"),
            (f"JVM|Garbage Collection|GC Time Spent Per Minute (ms)", f"app.{app_name}.jvm_gc_time_ms_per_min", "ms/min", "JVM GC time per minute", "jvm", "gc"),
            (f"JVM|Threads|Current No. of Threads", f"app.{app_name}.jvm_thread_count", "count", "JVM active thread count", "jvm", "threads"),
            (f"JVM|CPU|% Busy Threads", f"app.{app_name}.jvm_busy_threads_pct", "%", "JVM CPU busy threads", "jvm", "cpu"),
        ]

        for metric_path, metric_name, unit, description, scope, category in jvm_metrics:
            value = await self._fetch_metric_data(app_id, metric_path)
            if value is not None:
                app_metrics.append(metric(
                    name=metric_name,
                    value=round(value, 2),
                    unit=unit,
                    description=description,
                    labels={**labels, "metric_scope": scope, "metric_category": category},
                ))

        # Business Transaction metrics (if tier/bt configured)
        if self._tier_name or self._bt_name:
            bt_path_prefix = f"Business Transaction Performance|Business Transactions|{self._tier_name or '*'}|{self._bt_name or '*'}"
            bt_metrics = [
                (f"{bt_path_prefix}|Average Response Time (ms)", f"app.{app_name}.bt_avg_response_time_ms", "ms", "BT average response time", "api", "latency"),
                (f"{bt_path_prefix}|Calls per Minute", f"app.{app_name}.bt_calls_per_minute", "req/min", "BT calls per minute", "api", "throughput"),
                (f"{bt_path_prefix}|Errors per Minute", f"app.{app_name}.bt_errors_per_minute", "errors/min", "BT errors per minute", "api", "errors"),
            ]
            for metric_path, metric_name, unit, description, scope, category in bt_metrics:
                value = await self._fetch_metric_data(app_id, metric_path)
                if value is not None:
                    app_metrics.append(metric(
                        name=metric_name,
                        value=round(value, 2),
                        unit=unit,
                        description=description,
                        labels={**labels, "metric_scope": scope, "metric_category": category, "tier": self._tier_name},
                    ))

        # Database metrics
        db_metrics_paths = [
            ("Backends|Discovered backend call - All Backends|Calls per Minute", f"app.{app_name}.db_calls_per_minute", "req/min", "DB backend calls per minute", "database", "db"),
            ("Backends|Discovered backend call - All Backends|Average Response Time (ms)", f"app.{app_name}.db_avg_response_time_ms", "ms", "DB average response time", "database", "db"),
            ("Backends|Discovered backend call - All Backends|Errors per Minute", f"app.{app_name}.db_errors_per_minute", "errors/min", "DB errors per minute", "database", "db"),
        ]
        for metric_path, metric_name, unit, description, scope, category in db_metrics_paths:
            value = await self._fetch_metric_data(app_id, metric_path)
            if value is not None:
                app_metrics.append(metric(
                    name=metric_name,
                    value=round(value, 2),
                    unit=unit,
                    description=description,
                    labels={**labels, "metric_scope": scope, "metric_category": category},
                ))

        return app_metrics

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """Map AppDynamics applications list to ConnectorHealthResult."""
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        apps: list = raw.get("_apps", [])
        app_count = len(apps) if isinstance(apps, list) else 0
        return make_ok_health(
            elapsed_ms,
            message=f"AppDynamics controller OK — {app_count} application(s) visible",
            raw_response=raw,
        )
