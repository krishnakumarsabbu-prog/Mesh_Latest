"""
Shared response normalization utilities for connector agents.

Provides helpers for classifying health status from HTTP responses,
building HealthMetric objects, and constructing standard error results.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.connectors.base.interface import (
    ConnectorHealthResult,
    ConnectorHealthStatus,
    ConnectorTestResult,
    HealthMetric,
)


def classify_http_status(
    http_status_code: int,
    response_time_ms: int,
    degraded_threshold_ms: int = 2000,
) -> ConnectorHealthStatus:
    """
    Classify health status from HTTP response code and response time.

    Rules:
    - 4xx/5xx → DOWN
    - response_time_ms >= degraded_threshold_ms → DEGRADED
    - Otherwise → HEALTHY
    """
    if http_status_code >= 400:
        return ConnectorHealthStatus.DOWN
    if response_time_ms >= degraded_threshold_ms:
        return ConnectorHealthStatus.DEGRADED
    return ConnectorHealthStatus.HEALTHY


def make_ok_health(
    response_time_ms: int,
    message: str = "OK",
    metrics: Optional[List[HealthMetric]] = None,
    raw_response: Optional[Dict[str, Any]] = None,
    degraded_threshold_ms: int = 2000,
) -> ConnectorHealthResult:
    """Build a HEALTHY or DEGRADED health result for a successful response."""
    status = (
        ConnectorHealthStatus.DEGRADED
        if response_time_ms >= degraded_threshold_ms
        else ConnectorHealthStatus.HEALTHY
    )
    return ConnectorHealthResult(
        status=status,
        response_time_ms=response_time_ms,
        message=message,
        metrics=metrics or [],
        raw_response=raw_response,
        checked_at=datetime.utcnow(),
    )


def make_error_health(
    error: str,
    response_time_ms: int = 0,
    status: ConnectorHealthStatus = ConnectorHealthStatus.DOWN,
) -> ConnectorHealthResult:
    """Build a DOWN/ERROR/TIMEOUT health result."""
    return ConnectorHealthResult(
        status=status,
        response_time_ms=response_time_ms,
        message=error,
        error=error,
        checked_at=datetime.utcnow(),
    )


def make_timeout_health(response_time_ms: int = 0) -> ConnectorHealthResult:
    return make_error_health(
        "Connection timed out",
        response_time_ms=response_time_ms,
        status=ConnectorHealthStatus.TIMEOUT,
    )


def make_test_result(
    success: bool,
    response_time_ms: Optional[int] = None,
    status_code: Optional[int] = None,
    error: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    authenticated: bool = False,
) -> ConnectorTestResult:
    return ConnectorTestResult(
        success=success,
        response_time_ms=response_time_ms,
        status_code=status_code,
        error=error,
        details=details or {},
        authenticated=authenticated,
        tested_at=datetime.utcnow(),
    )


def metric(
    name: str,
    value: float,
    unit: str,
    description: str = "",
    labels: Optional[Dict[str, str]] = None,
) -> HealthMetric:
    return HealthMetric(
        name=name,
        value=value,
        unit=unit,
        description=description,
        labels=labels or {},
        timestamp=datetime.utcnow(),
    )
