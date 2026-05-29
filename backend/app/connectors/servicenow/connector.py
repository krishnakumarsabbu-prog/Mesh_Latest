"""
ServiceNow Connector Agent.

Connects to ServiceNow REST API using Basic Auth or OAuth2.
Health check verifies instance availability and open incident count.
Metrics: open P1/P2 incident counts, change request queue depth,
         average incident resolution time.
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

_INCIDENT_ACTIVE_QUERY = (
    "active=true^priority=1^ORpriority=2"
    "^stateNOT IN6,7"
)
_CHANGE_ACTIVE_QUERY = "active=true^stateNOT IN-5,3,4"


@ConnectorRegistry.register("servicenow")
class ServiceNowConnector(BaseConnector):
    """
    ServiceNow REST API connector agent.

    Required config: instance_url (https://company.service-now.com)
    Required credentials: username, password (Basic Auth)
    Optional credentials: client_id, client_secret (for OAuth2 — future)
    """

    CONNECTOR_NAME = "ServiceNow"
    CONNECTOR_VERSION = "Vancouver+"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)

    def validate_config(self) -> List[str]:
        errors = super().validate_config()
        if not self._credentials.username:
            errors.append("ServiceNow username is required")
        if not self._credentials.password:
            errors.append("ServiceNow password is required")
        return errors

    async def authenticate(self) -> bool:
        """Verify credentials by calling /api/now/table/sys_user with sysparm_limit=1."""
        try:
            resp, _ = await self._client.get(
                "/api/now/table/sys_user",
                params={"sysparm_limit": "1", "sysparm_fields": "sys_id"},
                timeout_override=15,
            )
            return resp.status_code == 200
        except ConnectorAuthError:
            return False
        except Exception as exc:
            self._logger.warning("ServiceNow auth check failed: %s", exc)
            return False

    async def test_connection(self) -> ConnectorTestResult:
        """Test ServiceNow connectivity using a minimal table API call."""
        try:
            resp, elapsed = await self._client.get(
                "/api/now/table/sys_db_object",
                params={"sysparm_limit": "1"},
                timeout_override=20,
            )
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    record_count = len(data.get("result", []))
                    resp2, _ = await self._client.get(
                        "/api/now/table/sys_user",
                        params={"sysparm_limit": "1", "sysparm_fields": "sys_id,user_name"},
                        timeout_override=10,
                    )
                    username_seen = ""
                    if resp2.status_code == 200:
                        results = resp2.json().get("result", [])
                        username_seen = results[0].get("user_name", "") if results else ""
                    return make_test_result(
                        success=True,
                        response_time_ms=elapsed,
                        status_code=200,
                        authenticated=True,
                        details={
                            "instance_url": self._config.base_url,
                            "api_accessible": True,
                            "sample_records": record_count,
                            "authenticated_as": self._credentials.username,
                        },
                    )
                except Exception:
                    return make_test_result(
                        success=True,
                        response_time_ms=elapsed,
                        status_code=200,
                        authenticated=True,
                        details={"note": "Connected; response parse error"},
                    )
            return make_test_result(
                success=False,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=f"ServiceNow returned HTTP {resp.status_code}",
            )
        except ConnectorAuthError as exc:
            return make_test_result(success=False, error=str(exc), authenticated=False)
        except ConnectorTimeoutError as exc:
            return make_test_result(success=False, error=str(exc))
        except ConnectorHTTPError as exc:
            return make_test_result(success=False, status_code=exc.status_code, error=str(exc))
        except Exception as exc:
            self._logger.exception("Unexpected error in ServiceNow test_connection")
            return make_test_result(success=False, error=f"Unexpected error: {exc}")

    async def fetch_health(self) -> ConnectorHealthResult:
        """
        Health check: verify instance is up and REST API is responding.
        A degraded state is indicated if critical incidents are present.
        """
        try:
            resp, elapsed = await self._client.get(
                "/api/now/table/incident",
                params={
                    "sysparm_limit": "1",
                    "sysparm_fields": "sys_id",
                    "sysparm_query": "active=true^priority=1^stateNOT IN6,7",
                },
            )
            if resp.status_code >= 400:
                return make_error_health(
                    f"ServiceNow REST API returned HTTP {resp.status_code}",
                    response_time_ms=elapsed,
                )
            data = resp.json()
            p1_incidents = len(data.get("result", []))
            return self.normalize_response({
                "p1_count": p1_incidents,
                "_elapsed_ms": elapsed,
                "_status_code": resp.status_code,
            })
        except ConnectorAuthError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.DOWN)
        except ConnectorTimeoutError:
            return make_timeout_health()
        except ConnectorHTTPError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.ERROR)
        except Exception as exc:
            self._logger.exception("Unexpected error in ServiceNow fetch_health")
            return make_error_health(f"Unexpected error: {exc}", status=ConnectorHealthStatus.ERROR)

    async def fetch_metrics(self) -> List[HealthMetric]:
        """Fetch ServiceNow ITSM metrics: incidents and change requests."""
        metrics_list: List[HealthMetric] = []

        try:
            resp, _ = await self._client.get(
                "/api/now/table/incident",
                params={
                    "sysparm_count": "true",
                    "sysparm_limit": "1",
                    "sysparm_query": "active=true^stateNOT IN6,7",
                },
                timeout_override=20,
            )
            if resp.status_code == 200:
                total = int(resp.headers.get("X-Total-Count", 0))
                metrics_list.append(metric(
                    name="servicenow.incidents.open",
                    value=total,
                    unit="count",
                    description="Total open incidents",
                ))
        except Exception as exc:
            self._logger.warning("Failed to fetch ServiceNow incident metrics: %s", exc)

        try:
            resp2, _ = await self._client.get(
                "/api/now/table/incident",
                params={
                    "sysparm_count": "true",
                    "sysparm_limit": "1",
                    "sysparm_query": "active=true^priority=1^stateNOT IN6,7",
                },
                timeout_override=15,
            )
            if resp2.status_code == 200:
                p1_total = int(resp2.headers.get("X-Total-Count", 0))
                metrics_list.append(metric(
                    name="servicenow.incidents.p1",
                    value=p1_total,
                    unit="count",
                    description="Open Priority 1 incidents",
                    labels={"priority": "1"},
                ))
        except Exception as exc:
            self._logger.warning("Failed to fetch ServiceNow P1 incident metrics: %s", exc)

        try:
            resp3, _ = await self._client.get(
                "/api/now/table/change_request",
                params={
                    "sysparm_count": "true",
                    "sysparm_limit": "1",
                    "sysparm_query": _CHANGE_ACTIVE_QUERY,
                },
                timeout_override=15,
            )
            if resp3.status_code == 200:
                cr_total = int(resp3.headers.get("X-Total-Count", 0))
                metrics_list.append(metric(
                    name="servicenow.change_requests.open",
                    value=cr_total,
                    unit="count",
                    description="Active open change requests",
                ))
        except Exception as exc:
            self._logger.warning("Failed to fetch ServiceNow change request metrics: %s", exc)

        return metrics_list

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """Map ServiceNow health probe data to ConnectorHealthResult."""
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        p1_count: int = raw.get("p1_count", 0)

        if p1_count > 0:
            return ConnectorHealthResult(
                status=ConnectorHealthStatus.DEGRADED,
                response_time_ms=elapsed_ms,
                message=f"ServiceNow accessible — {p1_count} open P1 incident(s)",
                raw_response=raw,
            )
        return make_ok_health(
            elapsed_ms,
            message="ServiceNow REST API is healthy",
            raw_response=raw,
        )
