"""
IBM MQ Connector Agent.

Connects to the IBM MQ microservice (ibm-mq-service) which proxies
Queue Manager status from the QMGR API. Falls back to sample CSV data
with an explicit INFERRED label and confidence cap when the service is
unavailable.
"""

from __future__ import annotations

import csv
import io
import logging
import os
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

_SAMPLES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..",
                 "healthmesh-connectors", "samples")
)

# Gap metadata attached to fallback results
_WIP_GAP_NOTE = (
    "IBM MQ QMGR API unavailable — using sample CSV data. "
    "Confidence capped at MEDIUM (INFERRED source)."
)


def _load_sample_qmgr_csv() -> List[Dict[str, Any]]:
    """Parse ibmmq_qmgr_status.csv from the samples directory."""
    path = os.path.join(_SAMPLES_DIR, "ibmmq_qmgr_status.csv")
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [row for row in reader]
    except Exception as exc:
        logger.warning("IBM MQ sample CSV load failed: %s", exc)
        return []


def _load_sample_queue_depth_csv() -> List[Dict[str, Any]]:
    """Parse queue_depth_samples.xlsx (CSV fallback) from samples directory."""
    for fname in ("queue_depth_samples.csv", "ibmmq_qmgr_status.csv"):
        path = os.path.join(_SAMPLES_DIR, fname)
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    return [row for row in reader]
            except Exception as exc:
                logger.warning("IBM MQ queue depth CSV load failed: %s", exc)
    return []


@ConnectorRegistry.register("ibmmq")
class IBMMQConnector(BaseConnector):
    """
    IBM MQ connector agent.

    Connects to the ibm-mq-service microservice (default port 1001) which
    exposes queue manager status. When the microservice is unavailable the
    connector falls back to sample CSV data with explicit WIP labeling.

    Required config:  base_url (http://ibm-mq-service:1001)
    Optional config:  extra.use_mock (bool, force mock mode for testing)
    """

    CONNECTOR_NAME = "IBM MQ"
    CONNECTOR_VERSION = "9.x"

    # Source type used in ConnectorHealthResult.raw_response for confidence engine
    SOURCE_TYPE_LIVE = "DETERMINISTIC"
    SOURCE_TYPE_MOCK = "INFERRED"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)
        self._force_mock: bool = bool(config.extra.get("use_mock", False))

    # ── BaseConnector interface ────────────────────────────────────────────────

    async def authenticate(self) -> bool:
        if self._force_mock:
            return True
        try:
            resp, _ = await self._client.get("/health", timeout_override=8)
            return resp.status_code == 200
        except Exception:
            return False

    async def test_connection(self) -> ConnectorTestResult:
        if self._force_mock:
            rows = _load_sample_qmgr_csv()
            return make_test_result(
                success=True,
                authenticated=True,
                details={
                    "mode": "mock",
                    "source_type": self.SOURCE_TYPE_MOCK,
                    "gap_note": _WIP_GAP_NOTE,
                    "sample_rows": len(rows),
                },
            )
        try:
            resp, elapsed = await self._client.get("/health", timeout_override=10)
            if resp.status_code == 200:
                summary_resp, _ = await self._client.get("/summary", timeout_override=10)
                details: Dict[str, Any] = {"mode": "live", "source_type": self.SOURCE_TYPE_LIVE}
                if summary_resp.status_code == 200:
                    details.update(summary_resp.json())
                return make_test_result(
                    success=True,
                    response_time_ms=elapsed,
                    status_code=200,
                    authenticated=True,
                    details=details,
                )
            return make_test_result(
                success=False,
                response_time_ms=elapsed,
                status_code=resp.status_code,
                error=f"IBM MQ service returned HTTP {resp.status_code}",
            )
        except (ConnectorTimeoutError, ConnectorHTTPError, ConnectorAuthError, Exception) as exc:
            # Fall back to mock on any connectivity failure
            rows = _load_sample_qmgr_csv()
            return make_test_result(
                success=True,
                authenticated=True,
                details={
                    "mode": "mock_fallback",
                    "source_type": self.SOURCE_TYPE_MOCK,
                    "gap_note": _WIP_GAP_NOTE,
                    "sample_rows": len(rows),
                    "fallback_reason": str(exc),
                },
            )

    async def fetch_health(self) -> ConnectorHealthResult:
        if not self._force_mock:
            try:
                resp, elapsed = await self._client.get("/summary", timeout_override=15)
                if resp.status_code == 200:
                    return self.normalize_response({**resp.json(), "_elapsed_ms": elapsed, "_source": "live"})
            except ConnectorTimeoutError:
                return self._mock_health(reason="timeout")
            except ConnectorAuthError as exc:
                return make_error_health(str(exc), status=ConnectorHealthStatus.DOWN)
            except Exception:
                pass  # Fall through to mock

        return self._mock_health()

    async def fetch_metrics(self) -> List[HealthMetric]:
        metrics: List[HealthMetric] = []

        if not self._force_mock:
            try:
                resp, _ = await self._client.get("/analytics", timeout_override=15)
                if resp.status_code == 200:
                    data = resp.json()
                    metrics.append(metric(
                        name="ibmmq.queue.avg_depth",
                        value=float(data.get("average_queue_depth", 0)),
                        unit="messages",
                        description="Average queue depth across all queues",
                    ))
                    metrics.append(metric(
                        name="ibmmq.message.in_rate",
                        value=float(data.get("total_incoming_message_rate", 0)),
                        unit="msg/s",
                        description="Total incoming message rate",
                    ))
                    metrics.append(metric(
                        name="ibmmq.message.out_rate",
                        value=float(data.get("total_outgoing_message_rate", 0)),
                        unit="msg/s",
                        description="Total outgoing message rate",
                    ))
                    return metrics
            except Exception:
                pass  # Fall through to mock metrics

        # Mock metrics from sample CSV
        rows = _load_sample_qmgr_csv()
        running = sum(
            1 for r in rows
            if str(r.get("Value", r.get("value", "2"))).strip() in ("1", "2")
        )
        metrics.append(metric(
            name="ibmmq.qmgr.total",
            value=float(len(rows)),
            unit="count",
            description="Total Queue Managers (from sample CSV)",
            labels={"source_type": self.SOURCE_TYPE_MOCK},
        ))
        metrics.append(metric(
            name="ibmmq.qmgr.running",
            value=float(running),
            unit="count",
            description="Running Queue Managers (from sample CSV)",
            labels={"source_type": self.SOURCE_TYPE_MOCK},
        ))
        return metrics

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        source = raw.get("_source", "live")

        if source == "mock":
            rows = _load_sample_qmgr_csv()
            running = sum(
                1 for r in rows
                if str(r.get("Value", r.get("value", "2"))).strip() in ("1", "2")
            )
            total = len(rows)
            status = ConnectorHealthStatus.HEALTHY if running == total else ConnectorHealthStatus.DEGRADED
            return ConnectorHealthResult(
                status=status,
                response_time_ms=elapsed_ms,
                message=f"IBM MQ (mock): {running}/{total} QMgrs running. {_WIP_GAP_NOTE}",
                raw_response={
                    "source_type": self.SOURCE_TYPE_MOCK,
                    "gap_note": _WIP_GAP_NOTE,
                    "confidence_cap": "MEDIUM",
                    "qmgr_total": total,
                    "qmgr_running": running,
                },
            )

        # Live data from microservice /summary
        alert_count: int = raw.get("active_alerts_count", 0)
        qmgr_count: int = raw.get("queue_managers_count", 0)
        status = ConnectorHealthStatus.DEGRADED if alert_count > 0 else ConnectorHealthStatus.HEALTHY
        return ConnectorHealthResult(
            status=status,
            response_time_ms=elapsed_ms,
            message=f"IBM MQ: {qmgr_count} QMgrs, {alert_count} active alerts",
            raw_response={
                "source_type": self.SOURCE_TYPE_LIVE,
                **{k: v for k, v in raw.items() if not k.startswith("_")},
            },
        )

    # ── Internal helpers ───────────────────────────────────────────────────────

    def _mock_health(self, reason: str = "") -> ConnectorHealthResult:
        rows = _load_sample_qmgr_csv()
        running = sum(
            1 for r in rows
            if str(r.get("Value", r.get("value", "2"))).strip() in ("1", "2")
        )
        total = len(rows)
        status = ConnectorHealthStatus.HEALTHY if running > 0 else ConnectorHealthStatus.UNKNOWN
        suffix = f" (fallback: {reason})" if reason else ""
        return ConnectorHealthResult(
            status=status,
            response_time_ms=0,
            message=f"IBM MQ (sample CSV{suffix}): {running}/{total} QMgrs running. {_WIP_GAP_NOTE}",
            raw_response={
                "source_type": self.SOURCE_TYPE_MOCK,
                "gap_note": _WIP_GAP_NOTE,
                "confidence_cap": "MEDIUM",
                "qmgr_total": total,
                "qmgr_running": running,
            },
        )
