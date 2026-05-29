"""
AVI Load Balancer (Avi Networks / NSX ALB) Connector Agent — WIP / Labeled Stub.

Attempts to connect to the Avi Controller REST API.
When the API is unavailable (WIP in most environments), falls back to
load_balancer_report.csv with explicit INFERRED labeling and confidence
capped at MEDIUM.

Gap matrix entry: AVI LB is WIP — Controller API requires NSX license and
network access. Confidence model: INFERRED, cap = MEDIUM.
"""

from __future__ import annotations

import csv
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
    ConnectorConfig,
    ConnectorCredentials,
    ConnectorHealthResult,
    ConnectorHealthStatus,
    ConnectorTestResult,
    HealthMetric,
)
from app.connectors.base.normalizer import (
    make_error_health,
    make_test_result,
    metric,
)
from app.connectors.base.registry import ConnectorRegistry

logger = logging.getLogger(__name__)

_SAMPLES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..",
                 "healthmesh-connectors", "samples")
)

# Gap matrix entry for confidence engine
GAP_ENTRY = {
    "connector": "avi_lb",
    "display_name": "AVI Load Balancer",
    "wip": True,
    "gap_note": (
        "AVI Controller API unavailable (WIP) — using sample CSV, "
        "confidence capped at MEDIUM"
    ),
    "source_type": "INFERRED",
    "confidence_cap": "MEDIUM",
    "topology_confidence": 2,    # Low — proprietary tool, limited access
    "traffic_confidence": 3,     # Moderate — traffic data available via CSV
}


def _load_sample_lb_csv() -> List[Dict[str, Any]]:
    """Parse load_balancer_report.csv from the samples directory."""
    for fname in ("load_balancer_report.csv",):
        path = os.path.join(_SAMPLES_DIR, fname)
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    return [row for row in reader]
            except Exception as exc:
                logger.warning("AVI LB sample CSV load failed: %s", exc)
    return []


class AVIConnectionError(Exception):
    """Raised when AVI Controller API is unreachable."""


@ConnectorRegistry.register("avi_lb")
class AVILoadBalancerConnector(BaseConnector):
    """
    AVI Networks (NSX ALB) Load Balancer connector (WIP — labeled stub).

    Attempts Avi Controller REST API at base_url/api/.
    When unavailable, falls back to load_balancer_report.csv with INFERRED
    confidence capped at MEDIUM. Gap is explicitly tracked in gap matrix.

    Required config: base_url (https://avi-controller:443)
    Optional credentials: username / password for Avi session auth
    """

    CONNECTOR_NAME = "AVI Load Balancer"
    CONNECTOR_VERSION = "22.x"

    SOURCE_TYPE_LIVE = "DETERMINISTIC"
    SOURCE_TYPE_MOCK = "INFERRED"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)
        self._session_cookie: Optional[str] = None

    # ── BaseConnector interface ────────────────────────────────────────────────

    async def authenticate(self) -> bool:
        try:
            resp, _ = await self._client.get("/api/", timeout_override=8)
            return resp.status_code in (200, 302, 401)
        except Exception:
            return False

    async def test_connection(self) -> ConnectorTestResult:
        try:
            result = await self._try_avi_api()
            if result is not None:
                return make_test_result(
                    success=True,
                    authenticated=True,
                    details={"mode": "live", "source_type": self.SOURCE_TYPE_LIVE, **result},
                )
        except AVIConnectionError as exc:
            logger.info("AVI Controller API unavailable: %s — using sample CSV (WIP)", exc)

        rows = _load_sample_lb_csv()
        return make_test_result(
            success=True,
            authenticated=False,
            details={
                "mode": "wip_fallback",
                "source_type": self.SOURCE_TYPE_MOCK,
                "gap_note": GAP_ENTRY["gap_note"],
                "confidence_cap": GAP_ENTRY["confidence_cap"],
                "sample_rows": len(rows),
                "wip": True,
            },
        )

    async def fetch_health(self) -> ConnectorHealthResult:
        try:
            result = await self._try_avi_api()
            if result is not None:
                return ConnectorHealthResult(
                    status=ConnectorHealthStatus.HEALTHY,
                    response_time_ms=result.get("response_time_ms", 0),
                    message=f"AVI LB: {result.get('vs_count', 0)} virtual services active",
                    raw_response={"source_type": self.SOURCE_TYPE_LIVE, **result},
                )
        except AVIConnectionError as exc:
            logger.info("AVI Controller API unavailable: %s — using WIP fallback", exc)

        return self._wip_fallback_health()

    async def fetch_metrics(self) -> List[HealthMetric]:
        try:
            result = await self._try_avi_api()
            if result is not None:
                return [
                    metric(
                        name="avi_lb.virtual_services.total",
                        value=float(result.get("vs_count", 0)),
                        unit="count",
                        description="Total AVI virtual services",
                    ),
                    metric(
                        name="avi_lb.pools.total",
                        value=float(result.get("pool_count", 0)),
                        unit="count",
                        description="Total AVI pool configurations",
                    ),
                ]
        except AVIConnectionError:
            pass

        # Mock metrics from sample CSV
        rows = _load_sample_lb_csv()
        active = sum(
            1 for r in rows
            if str(r.get("status", r.get("Status", ""))).upper() in ("ACTIVE", "UP", "ONLINE", "OK")
        )
        return [
            metric(
                name="avi_lb.nodes.total",
                value=float(len(rows)),
                unit="count",
                description="Total LB nodes (from sample CSV — WIP)",
                labels={"source_type": self.SOURCE_TYPE_MOCK, "wip": "true"},
            ),
            metric(
                name="avi_lb.nodes.active",
                value=float(active),
                unit="count",
                description="Active LB nodes (from sample CSV — WIP)",
                labels={"source_type": self.SOURCE_TYPE_MOCK, "wip": "true"},
            ),
        ]

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        if raw.get("source_type") == self.SOURCE_TYPE_MOCK:
            return self._wip_fallback_health()

        return ConnectorHealthResult(
            status=ConnectorHealthStatus.HEALTHY,
            response_time_ms=raw.get("_elapsed_ms", 0),
            message="AVI LB: live data",
            raw_response=raw,
        )

    # ── Internal helpers ───────────────────────────────────────────────────────

    async def _try_avi_api(self) -> Optional[Dict[str, Any]]:
        """
        Attempt Avi Controller API. Raises AVIConnectionError if unavailable.
        """
        try:
            resp, elapsed = await self._client.get(
                "/api/virtualservice",
                params={"page_size": "1"},
                timeout_override=12,
            )
            if resp.status_code == 200:
                data = resp.json()
                vs_count = data.get("count", len(data.get("results", [])))

                pool_resp, _ = await self._client.get(
                    "/api/pool",
                    params={"page_size": "1"},
                    timeout_override=8,
                )
                pool_count = 0
                if pool_resp.status_code == 200:
                    pool_data = pool_resp.json()
                    pool_count = pool_data.get("count", 0)

                return {
                    "response_time_ms": elapsed,
                    "vs_count": vs_count,
                    "pool_count": pool_count,
                }
            if resp.status_code == 401:
                raise AVIConnectionError("AVI Controller authentication failed")
            raise AVIConnectionError(f"AVI API returned HTTP {resp.status_code}")
        except (ConnectorTimeoutError, ConnectorHTTPError) as exc:
            raise AVIConnectionError(str(exc)) from exc
        except AVIConnectionError:
            raise
        except Exception as exc:
            raise AVIConnectionError(str(exc)) from exc

    def _wip_fallback_health(self) -> ConnectorHealthResult:
        rows = _load_sample_lb_csv()
        active = sum(
            1 for r in rows
            if str(r.get("status", r.get("Status", ""))).upper() in ("ACTIVE", "UP", "ONLINE", "OK")
        )
        total = len(rows)
        return ConnectorHealthResult(
            status=ConnectorHealthStatus.DEGRADED,
            response_time_ms=0,
            message=(
                f"AVI LB: WIP — Controller API unavailable. "
                f"Sample CSV: {active}/{total} active nodes. "
                f"{GAP_ENTRY['gap_note']}"
            ),
            raw_response={
                "source_type": self.SOURCE_TYPE_MOCK,
                "wip": True,
                "gap_note": GAP_ENTRY["gap_note"],
                "confidence_cap": "MEDIUM",
                "topology_confidence": GAP_ENTRY["topology_confidence"],
                "traffic_confidence": GAP_ENTRY["traffic_confidence"],
                "lb_total": total,
                "lb_active": active,
            },
        )

    @classmethod
    def gap_matrix_entry(cls) -> Dict[str, Any]:
        """Return the gap matrix entry for the confidence engine."""
        return dict(GAP_ENTRY)
