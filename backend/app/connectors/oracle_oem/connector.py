"""
Oracle OEM Connector Agent — WIP / Labeled Stub.

Attempts to connect to Oracle Enterprise Manager (OEM) REST API.
When the API is unavailable (expected in most environments), the connector
falls back to sample CSV data with explicit WIP labeling and confidence
capped at MEDIUM.

Gap matrix entry: Oracle OEM is WIP — API proprietary and often unavailable.
Confidence model: INFERRED, cap = MEDIUM (score ≤ 65).
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
    make_test_result,
    metric,
)
from app.connectors.base.registry import ConnectorRegistry

logger = logging.getLogger(__name__)

_SAMPLES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "..",
                 "healthmesh-connectors", "samples")
)

# Gap matrix entry — attached to every result from this connector
GAP_ENTRY = {
    "connector": "oracle_oem",
    "display_name": "Oracle OEM",
    "wip": True,
    "gap_note": (
        "Oracle OEM API unavailable (WIP) — using sample CSV, "
        "confidence capped at MEDIUM"
    ),
    "source_type": "INFERRED",
    "confidence_cap": "MEDIUM",
    "topology_confidence": 3,    # Moderate — OEM reads directly from DB
    "traffic_confidence": 2,     # Low — traffic data not standardized
}


def _load_sample_oem_csv() -> List[Dict[str, Any]]:
    """Parse oem_db_role.csv from the samples directory."""
    for fname in ("oem_db_role.csv",):
        path = os.path.join(_SAMPLES_DIR, fname)
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    reader = csv.DictReader(f)
                    return [row for row in reader]
            except Exception as exc:
                logger.warning("Oracle OEM sample CSV load failed: %s", exc)
    return []


class OEMConnectionError(Exception):
    """Raised when Oracle OEM API is unreachable."""


@ConnectorRegistry.register("oracle_oem")
class OracleOEMConnector(BaseConnector):
    """
    Oracle Enterprise Manager connector (WIP — labeled stub).

    Attempts OEM REST API at base_url/em/websvcs/restful/extdst/restservice/.
    When unavailable, falls back to oem_db_role.csv with INFERRED confidence
    capped at MEDIUM. Gap is explicitly tracked in the gap matrix.

    Required config: base_url (https://oem-host:7803)
    Optional config: extra.username, extra.password for OEM basic auth
    """

    CONNECTOR_NAME = "Oracle OEM"
    CONNECTOR_VERSION = "13.x"

    SOURCE_TYPE_LIVE = "DETERMINISTIC"
    SOURCE_TYPE_MOCK = "INFERRED"

    def __init__(self, config: ConnectorConfig, credentials: ConnectorCredentials) -> None:
        super().__init__(config, credentials)
        self._client = ConnectorHTTPClient(config, credentials)

    # ── BaseConnector interface ────────────────────────────────────────────────

    async def authenticate(self) -> bool:
        try:
            resp, _ = await self._client.get(
                "/em/websvcs/restful/extdst/restservice/",
                timeout_override=8,
            )
            return resp.status_code in (200, 401)  # 401 means reachable but auth needed
        except Exception:
            return False

    async def test_connection(self) -> ConnectorTestResult:
        try:
            result = await self._try_oem_api()
            if result is not None:
                return make_test_result(
                    success=True,
                    authenticated=True,
                    details={"mode": "live", "source_type": self.SOURCE_TYPE_LIVE, **result},
                )
        except OEMConnectionError as exc:
            logger.info("Oracle OEM API unavailable: %s — using sample CSV (WIP)", exc)

        rows = _load_sample_oem_csv()
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
            result = await self._try_oem_api()
            if result is not None:
                return ConnectorHealthResult(
                    status=ConnectorHealthStatus.HEALTHY,
                    response_time_ms=result.get("response_time_ms", 0),
                    message=f"Oracle OEM connected: {result.get('target_count', 0)} targets",
                    raw_response={"source_type": self.SOURCE_TYPE_LIVE, **result},
                )
        except OEMConnectionError as exc:
            logger.info("Oracle OEM API unavailable: %s — using WIP fallback", exc)

        return self._wip_fallback_health()

    async def fetch_metrics(self) -> List[HealthMetric]:
        try:
            result = await self._try_oem_api()
            if result is not None:
                return [
                    metric(
                        name="oracle_oem.targets.total",
                        value=float(result.get("target_count", 0)),
                        unit="count",
                        description="Total OEM managed targets",
                    )
                ]
        except OEMConnectionError:
            pass

        # Mock metrics from sample CSV
        rows = _load_sample_oem_csv()
        primaries = sum(
            1 for r in rows
            if str(r.get("db_role", r.get("DB_ROLE", ""))).upper() in ("PRIMARY", "PRIMARY CANDIDATE")
        )
        standbys = sum(
            1 for r in rows
            if "STANDBY" in str(r.get("db_role", r.get("DB_ROLE", ""))).upper()
        )
        return [
            metric(
                name="oracle_oem.db.primary_count",
                value=float(primaries),
                unit="count",
                description="Primary databases (from sample CSV — WIP)",
                labels={"source_type": self.SOURCE_TYPE_MOCK, "wip": "true"},
            ),
            metric(
                name="oracle_oem.db.standby_count",
                value=float(standbys),
                unit="count",
                description="Standby databases (from sample CSV — WIP)",
                labels={"source_type": self.SOURCE_TYPE_MOCK, "wip": "true"},
            ),
        ]

    def normalize_response(self, raw: Dict[str, Any]) -> ConnectorHealthResult:
        if raw.get("source_type") == self.SOURCE_TYPE_MOCK:
            return self._wip_fallback_health()

        return ConnectorHealthResult(
            status=ConnectorHealthStatus.HEALTHY,
            response_time_ms=raw.get("_elapsed_ms", 0),
            message="Oracle OEM: live data",
            raw_response=raw,
        )

    # ── Internal helpers ───────────────────────────────────────────────────────

    async def _try_oem_api(self) -> Dict[str, Any] | None:
        """
        Attempt Oracle OEM REST API. Raises OEMConnectionError if unavailable.
        Returns parsed result dict on success, None if endpoint not found.
        """
        try:
            resp, elapsed = await self._client.get(
                "/em/websvcs/restful/extdst/restservice/db/ra/latestData/allTargets",
                timeout_override=12,
            )
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "response_time_ms": elapsed,
                    "target_count": len(data.get("data", data.get("targets", []))),
                    "raw": data,
                }
            if resp.status_code == 404:
                return None
            raise OEMConnectionError(f"OEM API returned HTTP {resp.status_code}")
        except (ConnectorTimeoutError, ConnectorHTTPError) as exc:
            raise OEMConnectionError(str(exc)) from exc
        except OEMConnectionError:
            raise
        except Exception as exc:
            raise OEMConnectionError(str(exc)) from exc

    def _wip_fallback_health(self) -> ConnectorHealthResult:
        rows = _load_sample_oem_csv()
        primaries = sum(
            1 for r in rows
            if str(r.get("db_role", r.get("DB_ROLE", ""))).upper() in ("PRIMARY", "PRIMARY CANDIDATE")
        )
        total = len(rows)
        return ConnectorHealthResult(
            status=ConnectorHealthStatus.DEGRADED,
            response_time_ms=0,
            message=(
                f"Oracle OEM: WIP — API unavailable. "
                f"Sample CSV: {primaries}/{total} primary DBs. "
                f"{GAP_ENTRY['gap_note']}"
            ),
            raw_response={
                "source_type": self.SOURCE_TYPE_MOCK,
                "wip": True,
                "gap_note": GAP_ENTRY["gap_note"],
                "confidence_cap": "MEDIUM",
                "topology_confidence": GAP_ENTRY["topology_confidence"],
                "traffic_confidence": GAP_ENTRY["traffic_confidence"],
                "db_total": total,
                "db_primary": primaries,
            },
        )

    @classmethod
    def gap_matrix_entry(cls) -> Dict[str, Any]:
        """Return the gap matrix entry for the confidence engine."""
        return dict(GAP_ENTRY)
