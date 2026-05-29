"""
Linborg Connector Agent — Placeholder Implementation.

Linborg is an enterprise integration and data orchestration platform.
This connector is a placeholder for the official Linborg API integration.
It provides the full interface but marks itself clearly as a placeholder
in all status messages and test results.

When Linborg API documentation becomes available, the implementation
of authenticate(), fetch_metrics(), and normalize_response() should be
updated to match the actual API contract.
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

_PLACEHOLDER_NOTE = (
    "Linborg connector is in preview. Full integration will be available "
    "when the Linborg API specification is finalized."
)


@ConnectorRegistry.register("linborg")
class LinborgConnector(BaseConnector):
    """
    Linborg integration platform connector agent (placeholder).

    Required config: base_url
    Required credentials: api_key
    Optional config: workspace_id

    NOTE: This is a placeholder implementation. It performs a generic
    HTTP GET to the configured base_url/api/v1/status endpoint and
    returns a normalized health result. Connector-specific logic will
    be added once the official Linborg API is documented.
    """

    CONNECTOR_NAME = "Linborg"
    CONNECTOR_VERSION = "4.x"

    _STATUS_PATH = "/api/v1/status"
    _PIPELINES_PATH = "/api/v1/pipelines"
    _WORKSPACES_PATH = "/api/v1/workspaces"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)
        self._workspace_id: str = config.extra.get("workspace_id", "")

    def validate_config(self) -> List[str]:
        errors = super().validate_config()
        if not self._credentials.api_key and not self._credentials.token:
            errors.append("Linborg API key is required")
        return errors

    async def authenticate(self) -> bool:
        """
        Attempt to authenticate against the Linborg status endpoint.
        Falls back gracefully if the endpoint is not yet defined.
        """
        try:
            resp, _ = await self._client.get(self._STATUS_PATH, timeout_override=10)
            return resp.status_code in (200, 204)
        except ConnectorAuthError:
            return False
        except Exception as exc:
            self._logger.warning("Linborg auth check failed: %s", exc)
            return False

    async def test_connection(self) -> ConnectorTestResult:
        """
        Test Linborg platform connectivity via the /api/v1/status endpoint.

        Returns a test result with a note that this is a placeholder connector
        and the full integration is pending API documentation.
        """
        try:
            resp, elapsed = await self._client.get(
                self._STATUS_PATH,
                timeout_override=15,
            )
            if resp.status_code in (200, 204):
                details: Dict[str, Any] = {
                    "status_code": resp.status_code,
                    "connector_type": "placeholder",
                    "note": _PLACEHOLDER_NOTE,
                }
                try:
                    payload = resp.json()
                    details["platform_status"] = payload.get("status", "unknown")
                    details["platform_version"] = payload.get("version", "unknown")
                except Exception:
                    details["response_content_type"] = resp.headers.get("content-type", "unknown")
                return make_test_result(
                    success=True,
                    response_time_ms=elapsed,
                    status_code=resp.status_code,
                    authenticated=True,
                    details=details,
                )
            return make_test_result(
                success=False,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=f"Linborg returned HTTP {resp.status_code}",
                details={"note": _PLACEHOLDER_NOTE},
            )
        except ConnectorAuthError as exc:
            return make_test_result(
                success=False,
                error=str(exc),
                authenticated=False,
                details={"note": _PLACEHOLDER_NOTE},
            )
        except ConnectorTimeoutError as exc:
            return make_test_result(
                success=False,
                error=str(exc),
                details={"note": _PLACEHOLDER_NOTE},
            )
        except ConnectorHTTPError as exc:
            return make_test_result(
                success=False,
                status_code=exc.status_code,
                error=str(exc),
                details={"note": _PLACEHOLDER_NOTE},
            )
        except Exception as exc:
            self._logger.warning("Linborg test_connection error: %s", exc)
            return make_test_result(
                success=False,
                error=f"Unexpected error: {exc}",
                details={"note": _PLACEHOLDER_NOTE},
            )

    async def fetch_health(self) -> ConnectorHealthResult:
        """Fetch Linborg platform health from the /api/v1/status endpoint."""
        try:
            resp, elapsed = await self._client.get(self._STATUS_PATH)
            if resp.status_code >= 400:
                return make_error_health(
                    f"Linborg status endpoint returned HTTP {resp.status_code}",
                    response_time_ms=elapsed,
                )
            try:
                data = resp.json()
            except Exception:
                data = {}
            return self.normalize_response({**data, "_elapsed_ms": elapsed})
        except ConnectorAuthError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.DOWN)
        except ConnectorTimeoutError:
            return make_timeout_health()
        except ConnectorHTTPError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.ERROR)
        except Exception as exc:
            self._logger.warning("Linborg fetch_health error: %s", exc)
            return make_error_health(f"Unexpected error: {exc}", status=ConnectorHealthStatus.ERROR)

    async def fetch_metrics(self) -> List[HealthMetric]:
        """
        Fetch Linborg pipeline metrics.

        Placeholder: attempts to retrieve pipeline list from /api/v1/pipelines.
        Returns empty list if the endpoint is unavailable.
        """
        metrics_list: List[HealthMetric] = []
        try:
            resp, _ = await self._client.get(self._PIPELINES_PATH, timeout_override=15)
            if resp.status_code == 200:
                try:
                    data = resp.json()
                    pipelines = data.get("pipelines", data) if isinstance(data, dict) else data
                    if isinstance(pipelines, list):
                        metrics_list.append(metric(
                            name="linborg.pipelines.total",
                            value=len(pipelines),
                            unit="count",
                            description="Total Linborg pipelines",
                        ))
                        active = sum(
                            1 for p in pipelines
                            if isinstance(p, dict) and p.get("status", "").lower() in ("active", "running")
                        )
                        metrics_list.append(metric(
                            name="linborg.pipelines.active",
                            value=active,
                            unit="count",
                            description="Active/running Linborg pipelines",
                        ))
                except Exception as exc:
                    self._logger.debug("Linborg pipeline parse error: %s", exc)
        except Exception as exc:
            self._logger.debug("Linborg pipeline fetch skipped: %s", exc)

        return metrics_list

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """Map Linborg /api/v1/status response to ConnectorHealthResult."""
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        platform_status: str = raw.get("status", "ok")

        status_map = {
            "ok": ConnectorHealthStatus.HEALTHY,
            "healthy": ConnectorHealthStatus.HEALTHY,
            "operational": ConnectorHealthStatus.HEALTHY,
            "degraded": ConnectorHealthStatus.DEGRADED,
            "partial": ConnectorHealthStatus.DEGRADED,
            "down": ConnectorHealthStatus.DOWN,
            "error": ConnectorHealthStatus.DOWN,
        }
        health_status = status_map.get(platform_status.lower(), ConnectorHealthStatus.UNKNOWN)
        message = f"Linborg status: {platform_status} [{_PLACEHOLDER_NOTE[:50]}...]"
        return ConnectorHealthResult(
            status=health_status,
            response_time_ms=elapsed_ms,
            message=message,
            raw_response=raw,
        )
