"""
Splunk Connector Agent.

Connects to Splunk Enterprise or Splunk Cloud via the REST API (port 8089).
Authenticates using a Splunk session token (Bearer Splunk <token>).
Health check validates server info endpoint and index availability.
Metrics: number of healthy indexes, search head cluster status.
Application-level: captures per-application health, API latency, TPS, error rate,
JVM metrics, pod failures, MQ metrics, DB latency — all scoped to application_name + environment.
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


def _build_splunk_search_query(spl: str) -> str:
    """Wrap a raw SPL query into the search endpoint payload format."""
    return f"search {spl}" if not spl.strip().lower().startswith("search ") else spl


@ConnectorRegistry.register("splunk")
class SplunkConnector(BaseConnector):
    """
    Splunk Enterprise / Cloud connector agent.

    Required config: base_url (https://splunk-host:8089)
    Required credentials: token (Splunk auth token)
    Optional config: index (default index to check), verify_ssl,
                     application_name, environment, service_name, namespace
    """

    CONNECTOR_NAME = "Splunk"
    CONNECTOR_VERSION = "9.x"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)
        self._app_name: str = config.extra.get("application_name", "")
        self._env: str = config.extra.get("environment", "production")
        self._index: str = config.extra.get("index", config.extra.get("index_name", "main"))
        self._namespace: str = config.extra.get("namespace", "")
        self._service_name: str = config.extra.get("service_name", "")

    def validate_config(self) -> List[str]:
        errors = super().validate_config()
        if not self._credentials.token:
            errors.append("Splunk auth token is required")
        return errors

    async def authenticate(self) -> bool:
        """Verify token validity by hitting /services/authentication/current-context."""
        try:
            resp, _ = await self._client.get(
                "/services/authentication/current-context",
                params={"output_mode": "json"},
                timeout_override=10,
            )
            return resp.status_code == 200
        except ConnectorAuthError:
            return False
        except Exception as exc:
            self._logger.warning("Splunk auth check failed: %s", exc)
            return False

    async def test_connection(self) -> ConnectorTestResult:
        """Test Splunk connectivity via /services/server/info."""
        try:
            resp, elapsed = await self._client.get(
                "/services/server/info",
                params={"output_mode": "json"},
                timeout_override=15,
            )
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    entry = data.get("entry", [{}])[0]
                    content = entry.get("content", {})
                    version = content.get("version", "unknown")
                    build = content.get("build", "unknown")
                    server_name = content.get("serverName", "unknown")
                    return make_test_result(
                        success=True,
                        response_time_ms=elapsed,
                        status_code=200,
                        authenticated=True,
                        details={
                            "version": version,
                            "build": build,
                            "server_name": server_name,
                            "product_type": content.get("product_type", ""),
                        },
                    )
                except Exception:
                    return make_test_result(
                        success=True,
                        response_time_ms=elapsed,
                        status_code=resp.status_code,
                        authenticated=True,
                        details={"note": "Connected but response parsing failed"},
                    )
            return make_test_result(
                success=False,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=f"Unexpected HTTP {resp.status_code}",
            )
        except ConnectorAuthError as exc:
            return make_test_result(success=False, error=str(exc), authenticated=False)
        except ConnectorTimeoutError as exc:
            return make_test_result(success=False, error=str(exc))
        except ConnectorHTTPError as exc:
            return make_test_result(
                success=False,
                status_code=exc.status_code,
                error=str(exc),
            )
        except Exception as exc:
            self._logger.exception("Unexpected error in Splunk test_connection")
            return make_test_result(success=False, error=f"Unexpected error: {exc}")

    async def fetch_health(self) -> ConnectorHealthResult:
        """Fetch Splunk server health from /services/server/health/splunkd."""
        try:
            resp, elapsed = await self._client.get(
                "/services/server/health/splunkd",
                params={"output_mode": "json"},
            )
            if resp.status_code >= 400:
                return make_error_health(
                    f"Splunk health endpoint returned HTTP {resp.status_code}",
                    response_time_ms=elapsed,
                )
            return self.normalize_response({**resp.json(), "_elapsed_ms": elapsed})
        except ConnectorAuthError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.DOWN)
        except ConnectorTimeoutError:
            return make_timeout_health()
        except ConnectorHTTPError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.ERROR)
        except Exception as exc:
            self._logger.exception("Unexpected error in Splunk fetch_health")
            return make_error_health(f"Unexpected error: {exc}", status=ConnectorHealthStatus.ERROR)

    async def _run_oneshot_search(self, spl: str, timeout: int = 20) -> Optional[Dict[str, Any]]:
        """Execute a Splunk one-shot search using the REST API via form-encoded POST."""
        import httpx
        import time
        from app.connectors.base.http_client import ConnectorAuthStrategy

        url = self._client._config.base_url.rstrip("/") + "/services/search/jobs/oneshot"
        headers: Dict[str, str] = {}
        if self._credentials.token:
            headers["Authorization"] = f"Splunk {self._credentials.token}"

        payload = {
            "search": _build_splunk_search_query(spl),
            "output_mode": "json",
            "earliest_time": "-15m",
            "latest_time": "now",
        }

        try:
            async with httpx.AsyncClient(
                timeout=timeout,
                verify=self._client._config.verify_ssl,
                follow_redirects=True,
            ) as client:
                resp = await client.post(url, data=payload, headers=headers)
                if resp.status_code == 200:
                    return resp.json()
        except Exception as exc:
            self._logger.debug("Splunk oneshot search failed: %s", exc)
        return None

    def _extract_field(self, result_data: Optional[Dict[str, Any]], field_name: str, default: float = 0.0) -> float:
        """Extract a numeric field from Splunk search results."""
        if not result_data:
            return default
        try:
            results = result_data.get("results", [])
            if results:
                val = results[0].get(field_name)
                if val is not None:
                    return float(val)
        except (ValueError, TypeError, IndexError):
            pass
        return default

    async def fetch_metrics(self) -> List[HealthMetric]:
        """Fetch Splunk index metrics, search performance, and application-level metrics."""
        metrics: List[HealthMetric] = []

        # Platform-level index metrics
        try:
            resp, elapsed = await self._client.get(
                "/services/data/indexes",
                params={"output_mode": "json", "count": 50},
                timeout_override=20,
            )
            if resp.status_code == 200:
                data = resp.json()
                entries = data.get("entry", [])
                healthy_indexes = sum(
                    1 for e in entries
                    if e.get("content", {}).get("health", "") in ("", "green")
                )
                metrics.append(metric(
                    name="splunk.indexes.total",
                    value=len(entries),
                    unit="count",
                    description="Total number of Splunk indexes",
                ))
                metrics.append(metric(
                    name="splunk.indexes.healthy",
                    value=healthy_indexes,
                    unit="count",
                    description="Number of healthy Splunk indexes",
                ))
        except Exception as exc:
            self._logger.warning("Failed to fetch Splunk index metrics: %s", exc)

        try:
            resp2, _ = await self._client.get(
                "/services/search/jobs",
                params={"output_mode": "json", "count": 1},
                timeout_override=10,
            )
            if resp2.status_code == 200:
                data2 = resp2.json()
                total_jobs = data2.get("paging", {}).get("total", 0)
                metrics.append(metric(
                    name="splunk.search_jobs.total",
                    value=total_jobs,
                    unit="count",
                    description="Total active/recent search jobs",
                ))
        except Exception as exc:
            self._logger.warning("Failed to fetch Splunk search job metrics: %s", exc)

        # Application-level metrics (only when application_name is configured)
        if self._app_name:
            app_metrics = await self._fetch_application_metrics()
            metrics.extend(app_metrics)

        return metrics

    async def _fetch_application_metrics(self) -> List[HealthMetric]:
        """Fetch per-application runtime metrics from Splunk."""
        app_metrics: List[HealthMetric] = []
        idx = self._index
        app = self._app_name
        env = self._env
        ns = self._namespace

        labels = {
            "application_name": app,
            "environment": env,
            "connector": "splunk",
        }

        # API latency (avg, p95, p99)
        latency_spl = (
            f'index={idx} application={app} environment={env} response_time=* '
            f'| stats avg(response_time) as avg_rt perc95(response_time) as p95_rt '
            f'perc99(response_time) as p99_rt'
        )
        latency_data = await self._run_oneshot_search(latency_spl)
        if latency_data:
            avg_rt = self._extract_field(latency_data, "avg_rt")
            p95_rt = self._extract_field(latency_data, "p95_rt")
            p99_rt = self._extract_field(latency_data, "p99_rt")
            if avg_rt > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.avg_response_time_ms",
                    value=round(avg_rt, 2),
                    unit="ms",
                    description=f"Average API response time for {app}",
                    labels={**labels, "metric_scope": "api", "metric_category": "latency"},
                ))
            if p95_rt > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.p95_response_time_ms",
                    value=round(p95_rt, 2),
                    unit="ms",
                    description=f"P95 API response time for {app}",
                    labels={**labels, "metric_scope": "api", "metric_category": "latency"},
                ))
            if p99_rt > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.p99_response_time_ms",
                    value=round(p99_rt, 2),
                    unit="ms",
                    description=f"P99 API response time for {app}",
                    labels={**labels, "metric_scope": "api", "metric_category": "latency"},
                ))

        # Error rate
        error_spl = (
            f'index={idx} application={app} environment={env} '
            f'| stats count as total count(eval(log_level="ERROR")) as errors '
            f'| eval error_rate=if(total>0, round((errors/total)*100,2), 0)'
        )
        error_data = await self._run_oneshot_search(error_spl)
        if error_data:
            total = self._extract_field(error_data, "total")
            error_rate = self._extract_field(error_data, "error_rate")
            if total > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.error_rate_pct",
                    value=round(error_rate, 2),
                    unit="%",
                    description=f"Error rate percentage for {app}",
                    labels={**labels, "metric_scope": "api", "metric_category": "errors"},
                ))
                app_metrics.append(metric(
                    name=f"app.{app}.total_log_events",
                    value=total,
                    unit="count",
                    description=f"Total log events for {app}",
                    labels={**labels, "metric_scope": "api", "metric_category": "throughput"},
                ))

        # TPS (transactions per second)
        tps_spl = (
            f'index={idx} application={app} environment={env} '
            f'| bin _time span=1s '
            f'| stats count by _time '
            f'| stats avg(count) as tps'
        )
        tps_data = await self._run_oneshot_search(tps_spl)
        if tps_data:
            tps = self._extract_field(tps_data, "tps")
            if tps > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.tps",
                    value=round(tps, 2),
                    unit="req/s",
                    description=f"Transactions per second for {app}",
                    labels={**labels, "metric_scope": "api", "metric_category": "throughput"},
                ))

        # Overall app health score
        health_spl = (
            f'index={idx} application={app} environment={env} '
            f'| stats count as total count(eval(log_level="ERROR")) as errors avg(response_time) as avg_rt '
            f'| eval health_score=max(0, min(100, 100-(errors*2)-(coalesce(avg_rt,0)/100)))'
        )
        health_data = await self._run_oneshot_search(health_spl)
        if health_data:
            health_score = self._extract_field(health_data, "health_score", default=100.0)
            app_metrics.append(metric(
                name=f"app.{app}.health_score",
                value=round(health_score, 1),
                unit="score",
                description=f"Computed health score for {app}",
                labels={**labels, "metric_scope": "application", "metric_category": "health"},
            ))

        # JVM metrics
        jvm_spl = (
            f'index={idx} application={app} environment={env} jvm_heap_used=* '
            f'| stats avg(jvm_heap_used) as avg_heap avg(jvm_heap_max) as max_heap'
        )
        jvm_data = await self._run_oneshot_search(jvm_spl)
        if jvm_data:
            avg_heap = self._extract_field(jvm_data, "avg_heap")
            max_heap = self._extract_field(jvm_data, "max_heap")
            if avg_heap > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.jvm_heap_used_bytes",
                    value=round(avg_heap, 0),
                    unit="bytes",
                    description=f"Average JVM heap used for {app}",
                    labels={**labels, "metric_scope": "jvm", "metric_category": "memory"},
                ))
            if max_heap > 0:
                heap_pct = round((avg_heap / max_heap) * 100, 1) if max_heap > 0 else 0
                app_metrics.append(metric(
                    name=f"app.{app}.jvm_heap_utilization_pct",
                    value=heap_pct,
                    unit="%",
                    description=f"JVM heap utilization percentage for {app}",
                    labels={**labels, "metric_scope": "jvm", "metric_category": "memory"},
                ))

        # Kubernetes pod failures (if namespace configured)
        if ns:
            pod_spl = (
                f'index={idx} namespace={ns} '
                f'(pod_status=CrashLoopBackOff OR pod_restart_count>5) '
                f'| stats count as failed_pods'
            )
            pod_data = await self._run_oneshot_search(pod_spl)
            if pod_data:
                failed_pods = self._extract_field(pod_data, "failed_pods")
                app_metrics.append(metric(
                    name=f"app.{app}.k8s_failed_pods",
                    value=failed_pods,
                    unit="count",
                    description=f"Kubernetes pods in failed/crash state for namespace {ns}",
                    labels={**labels, "metric_scope": "kubernetes", "metric_category": "infrastructure", "namespace": ns},
                ))

        # MQ queue depth
        mq_spl = (
            f'index={idx} application={app} mq_queue=* '
            f'| stats latest(queue_depth) as queue_depth by mq_queue'
        )
        mq_data = await self._run_oneshot_search(mq_spl)
        if mq_data:
            results = (mq_data.get("results") or [])
            total_depth = sum(float(r.get("queue_depth", 0)) for r in results if r.get("queue_depth"))
            if total_depth > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.mq_total_queue_depth",
                    value=round(total_depth, 0),
                    unit="messages",
                    description=f"Total MQ queue depth for {app}",
                    labels={**labels, "metric_scope": "mq", "metric_category": "messaging"},
                ))

        # DB query latency
        db_spl = (
            f'index={idx} application={app} db_instance=* query_duration=* '
            f'| stats avg(query_duration) as avg_query_ms perc95(query_duration) as p95_query_ms'
        )
        db_data = await self._run_oneshot_search(db_spl)
        if db_data:
            avg_q = self._extract_field(db_data, "avg_query_ms")
            p95_q = self._extract_field(db_data, "p95_query_ms")
            if avg_q > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.db_avg_query_ms",
                    value=round(avg_q, 2),
                    unit="ms",
                    description=f"Average DB query duration for {app}",
                    labels={**labels, "metric_scope": "database", "metric_category": "db"},
                ))
            if p95_q > 0:
                app_metrics.append(metric(
                    name=f"app.{app}.db_p95_query_ms",
                    value=round(p95_q, 2),
                    unit="ms",
                    description=f"P95 DB query duration for {app}",
                    labels={**labels, "metric_scope": "database", "metric_category": "db"},
                ))

        return app_metrics

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """Map Splunk /services/server/health/splunkd response to ConnectorHealthResult."""
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        try:
            entry = raw.get("entry", [{}])[0]
            content = entry.get("content", {})
            health = content.get("health", "green")
            status_map = {
                "green": ConnectorHealthStatus.HEALTHY,
                "yellow": ConnectorHealthStatus.DEGRADED,
                "red": ConnectorHealthStatus.DOWN,
            }
            status = status_map.get(health.lower(), ConnectorHealthStatus.UNKNOWN)
            messages = [
                f"{k}: {v.get('health', '?')}"
                for k, v in content.get("feature_flags", {}).items()
                if isinstance(v, dict)
            ]
            message = ", ".join(messages) if messages else f"Splunk health: {health}"
            return ConnectorHealthResult(
                status=status,
                response_time_ms=elapsed_ms,
                message=message,
                raw_response=raw,
            )
        except (KeyError, IndexError, TypeError) as exc:
            self._logger.warning("Failed to parse Splunk health response: %s", exc)
            return make_ok_health(elapsed_ms, message="Splunk reachable (response unparseable)")
