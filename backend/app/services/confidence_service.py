import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field

from app.models.runtime import RuntimeAsset


# ─── WIP Gap Matrix ───────────────────────────────────────────────────────────
# Connectors that are WIP or have limited API access get an explicit gap entry.
# Confidence is capped at MEDIUM (score ≤ 65) for INFERRED sources.

WIP_GAP_MATRIX: Dict[str, Dict[str, Any]] = {
    "oracle_oem": {
        "display_name": "Oracle OEM",
        "wip": True,
        "gap_note": (
            "Oracle OEM API unavailable (WIP) — using sample CSV, "
            "confidence capped at MEDIUM"
        ),
        "source_type": "INFERRED",
        "confidence_cap": "MEDIUM",
        "topology_confidence": 3,
        "traffic_confidence": 2,
    },
    "avi_lb": {
        "display_name": "AVI Load Balancer",
        "wip": True,
        "gap_note": (
            "AVI Controller API unavailable (WIP) — using sample CSV, "
            "confidence capped at MEDIUM"
        ),
        "source_type": "INFERRED",
        "confidence_cap": "MEDIUM",
        "topology_confidence": 2,
        "traffic_confidence": 3,
    },
}


def get_gap_entry(connector_slug: str) -> Optional[Dict[str, Any]]:
    """Return the WIP gap matrix entry for a connector slug, or None."""
    return WIP_GAP_MATRIX.get(connector_slug)


def apply_wip_confidence_cap(score: int, connector_slug: str) -> int:
    """Cap confidence score to MEDIUM (65) for WIP connectors using INFERRED data."""
    entry = WIP_GAP_MATRIX.get(connector_slug)
    if entry and entry.get("confidence_cap") == "MEDIUM":
        return min(score, 65)
    return score


# ─── Data structures ─────────────────────────────────────────────────────────

@dataclass
class Signal:
    asset_id: str
    asset_name: str
    data_source: str
    is_deterministic: bool
    source_type: str          # DETERMINISTIC | INFERRED | CMDB | UNKNOWN
    conclusion: str           # e.g. role@dc e.g. "PRIMARY@IBB1"
    base_score: int
    freshness_penalty: int
    last_seen_at: datetime


@dataclass
class ConfidenceResult:
    level: str                # HIGH | MEDIUM | LOW | CONFLICT | UNKNOWN
    score: int                # 0-100
    primary_signal: Optional[Signal] = None
    conflicts: List[Signal] = field(default_factory=list)


# ─── Engine ───────────────────────────────────────────────────────────────────

class ConfidenceEngine:
    """
    Deterministic confidence scoring engine.
    Implements freshness time-decay, source type weighting, and conflict detection.
    """

    FRESHNESS_PENALTIES = [
        (0,    5,    0),     # 0-5 min: no penalty
        (5,    30,   10),    # 5-30 min: -10 points
        (30,   120,  25),    # 30min-2h: -25 points
        (120,  1440, 50),    # 2h-24h: -50 points
        (1440, math.inf, 100),  # >24h: treat as UNKNOWN
    ]

    SOURCE_BASE_SCORES = {
        "DETERMINISTIC": 90,   # Live API direct query
        "INFERRED": 65,        # Hostname pattern / indirect
        "CMDB": 55,            # Configuration database
        "UNKNOWN": 0,          # No data
    }

    def _classify_source_type(self, asset: RuntimeAsset) -> str:
        if asset.is_deterministic:
            return "DETERMINISTIC"
        if asset.data_source in ("cmdb",):
            return "CMDB"
        return "INFERRED"

    def _freshness_penalty(self, last_seen_at: datetime) -> int:
        now = datetime.now(timezone.utc)
        # Make last_seen_at timezone-aware if naive
        if last_seen_at.tzinfo is None:
            last_seen_at = last_seen_at.replace(tzinfo=timezone.utc)
        age_minutes = (now - last_seen_at).total_seconds() / 60

        for low, high, penalty in self.FRESHNESS_PENALTIES:
            if low <= age_minutes < high:
                return penalty
        return 100  # fallback: treat as UNKNOWN

    def _asset_conclusion(self, asset: RuntimeAsset) -> str:
        role = asset.latest_replication_role or "NONE"
        dc = asset.data_center_short or "UNK"
        return f"{role}@{dc}"

    def build_signals(self, assets: List[RuntimeAsset]) -> List[Signal]:
        signals = []
        for asset in assets:
            source_type = self._classify_source_type(asset)
            base_score = self.SOURCE_BASE_SCORES[source_type]
            penalty = self._freshness_penalty(asset.last_seen_at)
            signals.append(Signal(
                asset_id=asset.id,
                asset_name=asset.name,
                data_source=asset.data_source,
                is_deterministic=asset.is_deterministic,
                source_type=source_type,
                conclusion=self._asset_conclusion(asset),
                base_score=base_score,
                freshness_penalty=penalty,
                last_seen_at=asset.last_seen_at,
            ))
        return signals

    def score(self, signals: List[Signal]) -> ConfidenceResult:
        if not signals:
            return ConfidenceResult(level="UNKNOWN", score=0)

        # Filter out fully stale signals (penalty == 100 means >24h old)
        active_signals = [s for s in signals if s.freshness_penalty < 100]
        if not active_signals:
            return ConfidenceResult(level="UNKNOWN", score=0)

        # Conflict check: do different signals reach different conclusions?
        conclusions = {s.conclusion for s in active_signals}
        if len(conclusions) > 1:
            return ConfidenceResult(
                level="CONFLICT",
                score=0,
                conflicts=active_signals,
            )

        # Best signal wins (highest net score)
        best = max(active_signals, key=lambda s: s.base_score - s.freshness_penalty)
        final_score = max(0, best.base_score - best.freshness_penalty)

        if final_score >= 80:
            level = "HIGH"
        elif final_score >= 60:
            level = "MEDIUM"
        elif final_score >= 40:
            level = "LOW"
        else:
            level = "UNKNOWN"

        return ConfidenceResult(level=level, score=final_score, primary_signal=best)

    def score_application(self, assets: List[RuntimeAsset]) -> ConfidenceResult:
        """Score an entire application by taking the worst-case signal set."""
        if not assets:
            return ConfidenceResult(level="UNKNOWN", score=0)

        signals = self.build_signals(assets)
        result = self.score(signals)
        return result

    def score_numeric(self, assets: List[RuntimeAsset]) -> int:
        """Return legacy 1-4 numeric confidence level for backward compat."""
        result = self.score_application(assets)
        level_map = {
            "HIGH": 4,
            "MEDIUM": 3,
            "LOW": 2,
            "CONFLICT": 2,
            "UNKNOWN": 1,
        }
        return level_map.get(result.level, 1)


# Module-level singleton
engine = ConfidenceEngine()
