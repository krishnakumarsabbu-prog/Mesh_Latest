"""
Custom / Universal REST Connector Agent.

A flexible connector for any HTTP/REST endpoint. Supports all major
authentication strategies (Bearer, Basic, API Key header/query, None).
Configuration drives behavior: health path, auth type, custom headers,
expected status codes, and timeout.

This connector is the fallback for catalog entries without a dedicated
connector implementation and for the 'universal-rest' catalog slug.
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
    classify_http_status,
    make_error_health,
    make_test_result,
    make_timeout_health,
    metric,
)
from app.connectors.base.registry import ConnectorRegistry

logger = logging.getLogger(__name__)

_DEFAULT_HEALTH_PATH = "/health"
_DEFAULT_EXPECTED_STATUSES = [200, 201, 204]
_DEFAULT_TIMEOUT = 30


def _resolve_credentials(raw_config: Dict[str, Any], raw_creds: Dict[str, Any]) -> ConnectorCredentials:
    """Build ConnectorCredentials from raw config and credentials dicts."""
    auth_type: str = raw_config.get("auth_type", "none").lower()
    strategy_map = {
        "bearer": ConnectorAuthStrategy.BEARER_TOKEN,
        "bearer_token": ConnectorAuthStrategy.BEARER_TOKEN,
        "basic": ConnectorAuthStrategy.BASIC_AUTH,
        "basic_auth": ConnectorAuthStrategy.BASIC_AUTH,
        "api_key": ConnectorAuthStrategy.API_KEY_HEADER,
        "api_key_header": ConnectorAuthStrategy.API_KEY_HEADER,
        "api_key_query": ConnectorAuthStrategy.API_KEY_QUERY,
        "none": ConnectorAuthStrategy.NONE,
    }
    strategy = strategy_map.get(auth_type, ConnectorAuthStrategy.NONE)

    return ConnectorCredentials(
        strategy=strategy,
        token=raw_creds.get("token") or raw_creds.get("api_key") or raw_config.get("token"),
        api_key=raw_creds.get("api_key") or raw_creds.get("token") or raw_config.get("api_key"),
        api_key_header_name=raw_config.get("api_key_header_name", "X-API-Key"),
        username=raw_creds.get("username") or raw_config.get("username"),
        password=raw_creds.get("password") or raw_config.get("password"),
    )


@ConnectorRegistry.register("universal-rest")
@ConnectorRegistry.register("custom")
class CustomRestConnector(BaseConnector):
    """
    Universal REST / Custom HTTP connector agent.

    Supports arbitrary HTTP endpoints with configurable:
    - Authentication strategy (none, bearer, basic, api_key_header)
    - Health check path
    - Expected status codes
    - Custom request headers
    - Timeout
    """

    CONNECTOR_NAME = "Universal REST Connector"
    CONNECTOR_VERSION = "1.0"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)
        self._health_path: str = config.extra.get("health_path", _DEFAULT_HEALTH_PATH)
        self._expected_statuses: List[int] = config.extra.get(
            "expected_statuses", _DEFAULT_EXPECTED_STATUSES
        )
        self._custom_headers: Dict[str, str] = config.extra.get("custom_headers") or {}
        self._api_key_query_name: Optional[str] = config.extra.get("api_key_query_param")
        self._api_key_query_value: Optional[str] = (
            credentials.api_key or credentials.token
        )

    @classmethod
    def from_raw(
        cls,
        config: ConnectorConfig,
        raw_config: Dict[str, Any],
        raw_creds: Dict[str, Any],
    ) -> "CustomRestConnector":
        credentials = _resolve_credentials(raw_config, raw_creds)
        config.extra["health_path"] = raw_config.get("health_path", _DEFAULT_HEALTH_PATH)
        config.extra["custom_headers"] = raw_config.get("custom_headers") or {}
        config.extra["expected_statuses"] = raw_config.get("expected_statuses", _DEFAULT_EXPECTED_STATUSES)
        config.extra["api_key_query_param"] = raw_config.get("api_key_query_param")
        return cls(config, credentials)

    def validate_config(self) -> List[str]:
        errors = super().validate_config()
        if not self._health_path:
            errors.append("health_path is required")
        return errors

    async def authenticate(self) -> bool:
        """Perform a lightweight request to verify auth succeeds."""
        try:
            resp, _ = await self._client.get(
                self._health_path,
                extra_headers=self._custom_headers,
                params=self._api_key_query_params(),
                timeout_override=10,
            )
            return resp.status_code < 400
        except ConnectorAuthError:
            return False
        except Exception as exc:
            self._logger.warning("Custom connector auth check failed: %s", exc)
            return False

    async def test_connection(self) -> ConnectorTestResult:
        """Test connectivity against the configured health path."""
        try:
            resp, elapsed = await self._client.get(
                self._health_path,
                extra_headers=self._custom_headers,
                params=self._api_key_query_params(),
                timeout_override=15,
            )
            success = resp.status_code in self._expected_statuses
            error: Optional[str] = None
            if not success:
                error = (
                    f"HTTP {resp.status_code} — expected one of "
                    f"{self._expected_statuses}"
                )
            details: Dict[str, Any] = {
                "url": f"{self._config.base_url.rstrip('/')}/{self._health_path.lstrip('/')}",
                "status_code": resp.status_code,
                "content_type": resp.headers.get("content-type", ""),
                "auth_strategy": self._credentials.strategy.value,
            }
            return make_test_result(
                success=success,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=error,
                authenticated=success,
                details=details,
            )
        except ConnectorAuthError as exc:
            return make_test_result(success=False, error=str(exc), authenticated=False)
        except ConnectorTimeoutError as exc:
            return make_test_result(success=False, error=str(exc))
        except ConnectorHTTPError as exc:
            return make_test_result(success=False, status_code=exc.status_code, error=str(exc))
        except Exception as exc:
            self._logger.exception("Unexpected error in CustomRestConnector test_connection")
            return make_test_result(success=False, error=f"Unexpected error: {exc}")

    async def fetch_health(self) -> ConnectorHealthResult:
        """Fetch health by performing a GET to the health path."""
        try:
            resp, elapsed = await self._client.get(
                self._health_path,
                extra_headers=self._custom_headers,
                params=self._api_key_query_params(),
            )
            return self.normalize_response({
                "_status_code": resp.status_code,
                "_elapsed_ms": elapsed,
                "_body": _safe_parse_json(resp),
            })
        except ConnectorAuthError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.DOWN)
        except ConnectorTimeoutError:
            return make_timeout_health()
        except ConnectorHTTPError as exc:
            return make_error_health(str(exc), status=ConnectorHealthStatus.ERROR)
        except Exception as exc:
            self._logger.exception("Unexpected error in CustomRestConnector fetch_health")
            return make_error_health(f"Unexpected error: {exc}", status=ConnectorHealthStatus.ERROR)

    async def fetch_metrics(self) -> List[HealthMetric]:
        """Custom REST connectors expose basic response time as a metric."""
        metrics_list: List[HealthMetric] = []
        try:
            _, elapsed = await self._client.get(
                self._health_path,
                extra_headers=self._custom_headers,
                params=self._api_key_query_params(),
                timeout_override=15,
            )
            metrics_list.append(metric(
                name="custom.response_time_ms",
                value=elapsed,
                unit="ms",
                description="Health endpoint response time",
                labels={"path": self._health_path},
            ))
        except Exception as exc:
            self._logger.debug("Custom connector metrics fetch failed: %s", exc)
        return metrics_list

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """Classify health from HTTP status code and response time."""
        status_code: int = raw.get("_status_code", 200)
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        health_status = classify_http_status(status_code, elapsed_ms)

        if health_status == ConnectorHealthStatus.DOWN:
            return ConnectorHealthResult(
                status=health_status,
                response_time_ms=elapsed_ms,
                message=f"Endpoint returned HTTP {status_code}",
                raw_response=raw,
            )

        message = f"HTTP {status_code} in {elapsed_ms}ms"
        body = raw.get("_body")
        if isinstance(body, dict):
            status_field = body.get("status") or body.get("health") or ""
            if status_field:
                message = f"{status_field} ({elapsed_ms}ms)"

        return ConnectorHealthResult(
            status=health_status,
            response_time_ms=elapsed_ms,
            message=message,
            raw_response=raw,
        )

    def _api_key_query_params(self) -> Optional[Dict[str, str]]:
        if (
            self._credentials.strategy == ConnectorAuthStrategy.API_KEY_QUERY
            and self._api_key_query_name
            and self._api_key_query_value
        ):
            return {self._api_key_query_name: self._api_key_query_value}
        return None


def _safe_parse_json(resp: Any) -> Optional[Dict[str, Any]]:
    try:
        return resp.json()
    except Exception:
        return None
