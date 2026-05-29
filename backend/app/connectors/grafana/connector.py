"""
Grafana Connector Agent.

Connects to a Grafana instance via the HTTP API.
Authenticates using a Grafana service account token (Bearer).
Health check uses /api/health and /api/datasources/proxy validation.
Metrics: alert rule counts by state, datasource health summary.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

from app.connectors.base.http_client import (
    ConnectorAuthError,
    ConnectorHTTPClient,
    ConnectorHTTPError,
    ConnectorTimeoutError,
)
from app.connectors.base.interface import (
    BaseConnector,
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


@ConnectorRegistry.register("grafana")
class GrafanaConnector(BaseConnector):
    """
    Grafana HTTP API connector agent.

    Required config: base_url (http://grafana-host:3000)
    Required credentials: token (Grafana service account API key)
    Optional config: org_id (default "1")
    """

    CONNECTOR_NAME = "Grafana"
    CONNECTOR_VERSION = "10.x"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)

    def validate_config(self) -> List[str]:
        errors = super().validate_config()
        if not self._credentials.token:
            errors.append("Grafana API key/token is required")
        return errors

    async def authenticate(self) -> bool:
        """Verify API key by calling /api/org."""
        try:
            resp, _ = await self._client.get("/api/org", timeout_override=10)
            return resp.status_code == 200
        except ConnectorAuthError:
            return False
        except Exception as exc:
            self._logger.warning("Grafana auth check failed: %s", exc)
            return False

    async def test_connection(self) -> ConnectorTestResult:
        """Test Grafana connectivity via /api/health and /api/org."""
        try:
            resp, elapsed = await self._client.get("/api/health", timeout_override=15)
            if resp.status_code == 200:
                health_data = resp.json()
                commit = health_data.get("commit", "unknown")
                version = health_data.get("version", "unknown")
                db_status = health_data.get("database", "unknown")

                resp2, _ = await self._client.get("/api/org", timeout_override=10)
                org_name = ""
                if resp2.status_code == 200:
                    org_name = resp2.json().get("name", "")

                return make_test_result(
                    success=True,
                    response_time_ms=elapsed,
                    status_code=200,
                    authenticated=resp2.status_code == 200,
                    details={
                        "version": version,
                        "commit": commit,
                        "database": db_status,
                        "org_name": org_name,
                    },
                )
            return make_test_result(
                success=False,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=f"Grafana health returned HTTP {resp.status_code}",
            )
        except ConnectorAuthError as exc:
            return make_test_result(success=False, error=str(exc), authenticated=False)
        except ConnectorTimeoutError as exc:
            return make_test_result(success=False, error=str(exc))
        except ConnectorHTTPError as exc:
            return make_test_result(success=False, status_code=exc.status_code, error=str(exc))
        except Exception as exc:
            self._logger.exception("Unexpected error in Grafana test_connection")
            return make_test_result(success=False, error=f"Unexpected error: {exc}")

    async def fetch_health(self) -> ConnectorHealthResult:
        """Fetch Grafana health from /api/health."""
        try:
            resp, elapsed = await self._client.get("/api/health")
            if resp.status_code >= 400:
                return make_error_health(
                    f"Grafana health endpoint returned HTTP {resp.status_code}",
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
            self._logger.exception("Unexpected error in Grafana fetch_health")
            return make_error_health(f"Unexpected error: {exc}", status=ConnectorHealthStatus.ERROR)

    async def fetch_metrics(self) -> List[HealthMetric]:
        """Fetch Grafana datasource health and alert counts."""
        metrics_list: List[HealthMetric] = []

        try:
            resp, _ = await self._client.get("/api/datasources", timeout_override=20)
            if resp.status_code == 200:
                datasources = resp.json()
                metrics_list.append(metric(
                    name="grafana.datasources.total",
                    value=len(datasources),
                    unit="count",
                    description="Total Grafana data sources",
                ))
        except Exception as exc:
            self._logger.warning("Failed to fetch Grafana datasource metrics: %s", exc)

        try:
            resp2, _ = await self._client.get(
                "/api/ruler/grafana/api/v1/rules",
                params={"subtype": "cortex"},
                timeout_override=15,
            )
            if resp2.status_code == 200:
                rules_data = resp2.json()
                total_rules = sum(
                    len(group.get("rules", []))
                    for ns_groups in rules_data.values()
                    for group in ns_groups
                    if isinstance(group, dict)
                )
                metrics_list.append(metric(
                    name="grafana.alert_rules.total",
                    value=total_rules,
                    unit="count",
                    description="Total Grafana alert rules",
                ))
        except Exception as exc:
            self._logger.debug("Grafana alert rules fetch skipped or failed: %s", exc)

        try:
            resp3, _ = await self._client.get("/api/dashboards/tags", timeout_override=10)
            if resp3.status_code == 200:
                tags_data = resp3.json()
                metrics_list.append(metric(
                    name="grafana.dashboard_tags.total",
                    value=len(tags_data),
                    unit="count",
                    description="Number of distinct dashboard tags",
                ))
        except Exception as exc:
            self._logger.debug("Grafana dashboard tags fetch failed: %s", exc)

        return metrics_list

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """Map Grafana /api/health response to ConnectorHealthResult."""
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        db_status: str = raw.get("database", "ok")
        is_db_ok = db_status.lower() in ("ok", "")

        if not is_db_ok:
            return ConnectorHealthResult(
                status=ConnectorHealthStatus.DEGRADED,
                response_time_ms=elapsed_ms,
                message=f"Grafana database status: {db_status}",
                raw_response=raw,
            )

        return make_ok_health(
            elapsed_ms,
            message=f"Grafana OK — version {raw.get('version', 'unknown')}",
            raw_response=raw,
        )
