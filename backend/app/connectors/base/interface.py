"""
Abstract base interface for all HealthMesh connector agents.

Every connector must implement this interface to ensure consistent behavior
across the platform. Connectors are responsible for authentication, health
checks, metric collection, and response normalization.
"""

from __future__ import annotations

import abc
import enum
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class ConnectorHealthStatus(str, enum.Enum):
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    DOWN = "down"
    TIMEOUT = "timeout"
    ERROR = "error"
    UNKNOWN = "unknown"


class ConnectorAuthStrategy(str, enum.Enum):
    NONE = "none"
    BEARER_TOKEN = "bearer_token"
    BASIC_AUTH = "basic_auth"
    API_KEY_HEADER = "api_key_header"
    API_KEY_QUERY = "api_key_query"
    OAUTH2_CLIENT_CREDENTIALS = "oauth2_client_credentials"
    SPLUNK_TOKEN = "splunk_token"
    CUSTOM = "custom"


@dataclass
class ConnectorCredentials:
    """Validated and resolved credential bag for a connector."""

    strategy: ConnectorAuthStrategy
    token: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    api_key: Optional[str] = None
    api_key_header_name: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ConnectorConfig:
    """Resolved configuration for a connector instance."""

    base_url: str
    timeout_seconds: int = 30
    max_retries: int = 3
    retry_backoff_factor: float = 1.5
    verify_ssl: bool = True
    proxy_url: Optional[str] = None
    proxy_strict_ssl: bool = True
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class HealthMetric:
    """A single health metric emitted by a connector."""

    name: str
    value: float
    unit: str
    description: str = ""
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ConnectorTestResult:
    """Result of a connector connectivity test."""

    success: bool
    response_time_ms: Optional[int] = None
    status_code: Optional[int] = None
    error: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)
    authenticated: bool = False
    tested_at: datetime = field(default_factory=datetime.utcnow)


@dataclass
class ConnectorHealthResult:
    """Normalized health result from a connector fetch."""

    status: ConnectorHealthStatus
    response_time_ms: int
    message: str = ""
    metrics: List[HealthMetric] = field(default_factory=list)
    raw_response: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    checked_at: datetime = field(default_factory=datetime.utcnow)


class BaseConnector(abc.ABC):
    """
    Abstract base class for all HealthMesh connector agents.

    Subclasses must implement all abstract methods to provide a complete
    connector implementation. The framework handles retry logic, logging,
    and execution tracking — connectors focus on business logic only.
    """

    CONNECTOR_SLUG: str = ""
    CONNECTOR_NAME: str = ""
    CONNECTOR_VERSION: str = "1.0"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        self._config = config
        self._credentials = credentials
        self._logger = logging.getLogger(
            f"healthmesh.connector.{self.CONNECTOR_SLUG or self.__class__.__name__}"
        )

    @property
    def config(self) -> ConnectorConfig:
        return self._config

    @property
    def credentials(self) -> ConnectorCredentials:
        return self._credentials

    @abc.abstractmethod
    async def authenticate(self) -> bool:
        """
        Validate credentials against the remote system.

        Returns True if authentication succeeded, False otherwise.
        Should not raise exceptions for expected auth failures.
        """

    @abc.abstractmethod
    async def test_connection(self) -> ConnectorTestResult:
        """
        Perform a lightweight connectivity and auth test.

        This is called by the UI 'Test Connection' button and should
        complete quickly (< 10s) and return actionable error messages.
        """

    @abc.abstractmethod
    async def fetch_health(self) -> ConnectorHealthResult:
        """
        Fetch the current health status from the remote system.

        This is the primary health-check method called during monitoring
        cycles. Should be idempotent and side-effect-free.
        """

    @abc.abstractmethod
    async def fetch_metrics(self) -> List[HealthMetric]:
        """
        Fetch detailed metrics from the remote system.

        Returns a list of normalized HealthMetric objects. May return
        an empty list if metrics are not applicable or unavailable.
        """

    @abc.abstractmethod
    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        """
        Normalize a raw API response into a ConnectorHealthResult.

        Each connector defines how to interpret its vendor-specific
        response schema and map it to the common HealthMesh schema.
        """

    def validate_config(self) -> List[str]:
        """
        Validate the connector configuration.

        Returns a list of validation error messages.
        Override in subclasses to add connector-specific validation.
        """
        errors: List[str] = []
        if not self._config.base_url:
            errors.append("base_url is required")
        if self._config.timeout_seconds <= 0:
            errors.append("timeout_seconds must be positive")
        return errors

    def __repr__(self) -> str:
        return (
            f"<{self.__class__.__name__} slug={self.CONNECTOR_SLUG!r} "
            f"base_url={self._config.base_url!r}>"
        )
