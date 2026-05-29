"""
MongoDB Connector Agent.

Connects to the mongodb-service microservice which proxies replica set
status. Falls back to sample CSV data with explicit INFERRED labeling
when the service is unavailable (polled every 60 seconds due to fast
replica state changes).
"""

from __future__ import annotations

import csv
import logging
import os
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

_SAMPLES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..",
                 "healthmesh-connectors", "samples")
)

_WIP_GAP_NOTE = (
    "MongoDB replica set API unavailable — using sample CSV data. "
    "Confidence capped at MEDIUM (INFERRED source)."
)


def _load_sample_mongodb_csv() -> List[Dict[str, Any]]:
    """Parse mongodb_info.csv from the samples directory."""
    path = os.path.join(_SAMPLES_DIR, "mongodb_info.csv")
    if not os.path.exists(path):
        return []
    try:
        with open(path, encoding="utf-8") as f:
            reader = csv.DictReader(f)
            return [row for row in reader]
    except Exception as exc:
        logger.warning("MongoDB sample CSV load failed: %s", exc)
        return []


@ConnectorRegistry.register("mongodb")
class MongoDBConnector(BaseConnector):
    """
    MongoDB replica set connector agent.

    Connects to the mongodb-service microservice (default port 1003).
    Polled every 60 seconds due to fast replica state changes.
    Falls back to sample CSV with explicit WIP labeling when unavailable.

    Required config: base_url (http://mongodb-service:1003)
    """

    CONNECTOR_NAME = "MongoDB"
    CONNECTOR_VERSION = "6.x"

    SOURCE_TYPE_LIVE = "DETERMINISTIC"
    SOURCE_TYPE_MOCK = "INFERRED"

    # Polling interval hint (seconds) — consumed by aggregation scheduler
    POLL_INTERVAL_SECONDS = 60

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
            rows = _load_sample_mongodb_csv()
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
                error=f"MongoDB service returned HTTP {resp.status_code}",
            )
        except Exception as exc:
            rows = _load_sample_mongodb_csv()
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
                pass

        return self._mock_health()

    async def fetch_metrics(self) -> List[HealthMetric]:
        metrics: List[HealthMetric] = []

        if not self._force_mock:
            try:
                resp, _ = await self._client.get("/analytics", timeout_override=15)
                if resp.status_code == 200:
                    data = resp.json()
                    metrics.append(metric(
                        name="mongodb.replica.avg_read_latency_ms",
                        value=float(data.get("average_read_latency_ms", 0)),
                        unit="ms",
                        description="Average read latency across replica nodes",
                    ))
                    metrics.append(metric(
                        name="mongodb.replica.avg_write_latency_ms",
                        value=float(data.get("average_write_latency_ms", 0)),
                        unit="ms",
                        description="Average write latency across replica nodes",
                    ))
                    metrics.append(metric(
                        name="mongodb.replica.avg_sync_lag_seconds",
                        value=float(data.get("average_sync_lag_seconds", 0)),
                        unit="seconds",
                        description="Average replica sync lag",
                    ))
                    return metrics
            except Exception:
                pass

        # Mock metrics from sample CSV
        rows = _load_sample_mongodb_csv()
        primaries = sum(
            1 for r in rows
            if str(r.get("replica_state", r.get("cl_role", ""))).lower() == "primary"
        )
        secondaries = sum(
            1 for r in rows
            if str(r.get("replica_state", r.get("cl_role", ""))).lower() == "secondary"
        )
        metrics.append(metric(
            name="mongodb.nodes.primary",
            value=float(primaries),
            unit="count",
            description="Primary nodes (from sample CSV)",
            labels={"source_type": self.SOURCE_TYPE_MOCK},
        ))
        metrics.append(metric(
            name="mongodb.nodes.secondary",
            value=float(secondaries),
            unit="count",
            description="Secondary nodes (from sample CSV)",
            labels={"source_type": self.SOURCE_TYPE_MOCK},
        ))
        return metrics

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        elapsed_ms: int = raw.get("_elapsed_ms", 0)
        source = raw.get("_source", "live")

        if source == "mock":
            rows = _load_sample_mongodb_csv()
            primaries = sum(
                1 for r in rows
                if str(r.get("replica_state", r.get("cl_role", ""))).lower() == "primary"
            )
            total = len(rows)
            status = ConnectorHealthStatus.HEALTHY if primaries > 0 else ConnectorHealthStatus.DEGRADED
            return ConnectorHealthResult(
                status=status,
                response_time_ms=elapsed_ms,
                message=f"MongoDB (mock): {primaries} primary nodes from {total} records. {_WIP_GAP_NOTE}",
                raw_response={
                    "source_type": self.SOURCE_TYPE_MOCK,
                    "gap_note": _WIP_GAP_NOTE,
                    "confidence_cap": "MEDIUM",
                    "total_records": total,
                    "primary_count": primaries,
                },
            )

        # Live data from microservice /summary
        alert_count: int = raw.get("active_alerts_count", 0)
        rs_count: int = raw.get("replica_sets_count", 0)
        node_count: int = raw.get("nodes_count", 0)
        status = ConnectorHealthStatus.DEGRADED if alert_count > 0 else ConnectorHealthStatus.HEALTHY
        return ConnectorHealthResult(
            status=status,
            response_time_ms=elapsed_ms,
            message=f"MongoDB: {rs_count} replica sets, {node_count} nodes, {alert_count} active alerts",
            raw_response={
                "source_type": self.SOURCE_TYPE_LIVE,
                **{k: v for k, v in raw.items() if not k.startswith("_")},
            },
        )

    def _mock_health(self, reason: str = "") -> ConnectorHealthResult:
        rows = _load_sample_mongodb_csv()
        primaries = sum(
            1 for r in rows
            if str(r.get("replica_state", r.get("cl_role", ""))).lower() == "primary"
        )
        total = len(rows)
        status = ConnectorHealthStatus.HEALTHY if primaries > 0 else ConnectorHealthStatus.UNKNOWN
        suffix = f" (fallback: {reason})" if reason else ""
        return ConnectorHealthResult(
            status=status,
            response_time_ms=0,
            message=f"MongoDB (sample CSV{suffix}): {primaries} primaries from {total} records. {_WIP_GAP_NOTE}",
            raw_response={
                "source_type": self.SOURCE_TYPE_MOCK,
                "gap_note": _WIP_GAP_NOTE,
                "confidence_cap": "MEDIUM",
                "total_records": total,
                "primary_count": primaries,
            },
        )
