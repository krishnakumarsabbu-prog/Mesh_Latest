import asyncio
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.runtime import RuntimeAsset, ApplicationIntent, RuntimeAuditLog

logger = logging.getLogger(__name__)


def _broadcast_drifts(application_id: str, application_name: str, drifts: List[Dict[str, Any]]) -> None:
    """Fire-and-forget broadcast of drift events to connected WS clients."""
    async def _push():
        try:
            from app.api.v1.endpoints.websocket import broadcast_runtime_event
            for d in drifts:
                if d["severity"] in ("CRITICAL", "HIGH"):
                    await broadcast_runtime_event({
                        "type": "drift_detected",
                        "application_id": application_id,
                        "application_name": application_name,
                        "drift_type": d["drift_type"],
                        "detected_dc": d.get("actual"),
                        "expected_dc": d.get("intended"),
                        "description": d["description"],
                        "severity": d["severity"],
                        "detected_at": d["detected_at"],
                    })
        except Exception as exc:
            logger.debug("Drift broadcast skipped: %s", exc)

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_push())
    except Exception:
        pass


# ─── Drift result types ───────────────────────────────────────────────────────

DRIFT_SEVERITY = {
    "WRONG_PRIMARY":     "CRITICAL",
    "MISSING_DC":        "HIGH",
    "EXTRA_DC":          "MEDIUM",
    "MISSING_COMPONENT": "MEDIUM",
    "ROLE_MISMATCH":     "HIGH",
    "STALE_DATA":        "LOW",
}


def _build_drift(
    application_id: str,
    environment: str,
    drift_type: str,
    description: str,
    intended: str,
    actual: str,
) -> Dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "application_id": application_id,
        "environment": environment,
        "drift_type": drift_type,
        "description": description,
        "severity": DRIFT_SEVERITY.get(drift_type, "MEDIUM"),
        "intended": intended,
        "actual": actual,
        "detected_at": datetime.utcnow().isoformat() + "Z",
    }


async def run_drift_detection(
    db: AsyncSession,
    application_id: str,
    environment: str = "PRODUCTION",
    persist_critical: bool = True,
) -> List[Dict[str, Any]]:
    """
    Runs deterministic drift detection for a single application.
    Compares ApplicationIntent (design) against live RuntimeAssets (actual).
    Persists CRITICAL drifts to RuntimeAuditLog.
    """

    # Load intent for this application
    intent_res = await db.execute(
        select(ApplicationIntent).where(ApplicationIntent.application_id == application_id)
    )
    intent: Optional[ApplicationIntent] = intent_res.scalar_one_or_none()

    if intent is None:
        return []

    # Load all live assets for this application+environment
    asset_res = await db.execute(select(RuntimeAsset))
    all_assets = asset_res.scalars().all()

    app_assets = []
    for a in all_assets:
        is_match = False
        if a.metadata_json and a.metadata_json.get("application_id") == application_id:
            is_match = True
        elif application_id == "MQ_INFRA" and a.data_source == "ibm_mq":
            is_match = True
        elif application_id == "MONGO_INFRA" and a.data_source == "mongodb":
            is_match = True
        elif application_id == "ORACLE_INFRA" and a.data_source == "oracle_oem":
            is_match = True
        if is_match and a.environment == environment:
            app_assets.append(a)

    if not app_assets:
        return []

    drifts: List[Dict[str, Any]] = []

    actual_dcs = set(a.data_center_short for a in app_assets if a.data_center_short)
    actual_stacks = set(a.tech_stack for a in app_assets)

    # Find the actual primary write DC
    primary_asset = next(
        (a for a in app_assets if a.write_authority and a.latest_operational_state == "ACTIVE"),
        None,
    )
    actual_primary_dc = primary_asset.data_center_short if primary_asset else None

    intended_dcs = set(intent.intended_active_dcs or [])

    # Check: missing DCs (intended but not found)
    for dc in intended_dcs:
        if dc not in actual_dcs:
            drifts.append(_build_drift(
                application_id, environment,
                "MISSING_DC",
                f"App should have assets in {dc} but none found",
                dc, "NOT FOUND",
            ))

    # Check: extra DCs (present but not intended)
    for dc in actual_dcs:
        if dc not in intended_dcs:
            drifts.append(_build_drift(
                application_id, environment,
                "EXTRA_DC",
                f"Assets found in {dc} but this DC is not in intended topology",
                ", ".join(sorted(intended_dcs)), dc,
            ))

    # Check: WRONG_PRIMARY (most severe — CRITICAL)
    if intent.intended_primary_dc and actual_primary_dc:
        if actual_primary_dc != intent.intended_primary_dc:
            drifts.append(_build_drift(
                application_id, environment,
                "WRONG_PRIMARY",
                f"Primary write DC is {actual_primary_dc}, should be {intent.intended_primary_dc}",
                intent.intended_primary_dc, actual_primary_dc,
            ))

    # Check: missing required tech stacks
    for stack in (intent.required_tech_stacks or []):
        if stack not in actual_stacks:
            drifts.append(_build_drift(
                application_id, environment,
                "MISSING_COMPONENT",
                f"Required tech stack {stack} has no assets found",
                stack, "NOT FOUND",
            ))

    # Persist CRITICAL drifts to RuntimeAuditLog
    if persist_critical:
        critical = [d for d in drifts if d["severity"] == "CRITICAL"]
        for d in critical:
            audit = RuntimeAuditLog(
                id=str(uuid.uuid4()),
                event_type="DRIFT_DETECTED",
                description=d["description"],
                application_id=application_id,
            )
            db.add(audit)
        if critical:
            try:
                await db.commit()
            except Exception as e:
                logger.warning(f"Failed to persist drift audit logs: {e}")
                await db.rollback()

    # Broadcast high-severity drifts to connected WebSocket clients
    if drifts:
        _broadcast_drifts(application_id, application_id, drifts)

    return drifts


async def run_drift_detection_all(
    db: AsyncSession,
    environment: str = "PRODUCTION",
) -> Dict[str, List[Dict[str, Any]]]:
    """Run drift detection for all applications that have an intent defined."""
    intent_res = await db.execute(select(ApplicationIntent))
    intents = intent_res.scalars().all()

    results: Dict[str, List[Dict[str, Any]]] = {}
    for intent in intents:
        drifts = await run_drift_detection(db, intent.application_id, environment, persist_critical=True)
        if drifts:
            results[intent.application_id] = drifts

    return results


def compute_alignment_status(drifts: List[Dict[str, Any]]) -> str:
    """
    Given drift results for an app, compute its alignment status.
    ALIGNED | DRIFTED | UNKNOWN
    """
    if not drifts:
        return "ALIGNED"
    severities = {d["severity"] for d in drifts}
    if "CRITICAL" in severities or "HIGH" in severities:
        return "DRIFTED"
    return "DRIFTED"
