"""
Gap Analysis Agent — explains missing, stale, or incomplete data signals
so the AI can explicitly say "UNKNOWN" or "WIP" instead of hallucinating.
"""
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.runtime import DataSourceImport, RuntimeAsset, ApplicationIntent

logger = logging.getLogger(__name__)

_EXPECTED_SOURCES = ["ibm_mq", "mongodb", "oracle_oem", "cmdb", "scom", "ocp", "avi_loadbalancer", "batch", "appdynamics"]
_FRESHNESS_THRESHOLD_HOURS = 24


async def _get_data_source_coverage(db: AsyncSession) -> dict[str, Any]:
    """
    Returns which data sources have been imported and when,
    identifying stale or missing sources.
    """
    import_res = await db.execute(
        select(DataSourceImport)
        .order_by(DataSourceImport.imported_at.desc())
    )
    imports = import_res.scalars().all()

    # Latest import per source
    latest: dict[str, DataSourceImport] = {}
    for imp in imports:
        if imp.source_name not in latest:
            latest[imp.source_name] = imp

    now = datetime.utcnow()
    threshold = now - timedelta(hours=_FRESHNESS_THRESHOLD_HOURS)

    present_sources = set(latest.keys())
    missing_sources = [s for s in _EXPECTED_SOURCES if s not in present_sources]

    stale_sources = []
    fresh_sources = []
    for source, imp in latest.items():
        age_hours = (now - imp.imported_at).total_seconds() / 3600 if imp.imported_at else 9999
        entry = {
            "source": source,
            "last_imported": imp.imported_at.isoformat() if imp.imported_at else None,
            "age_hours": round(age_hours, 1),
            "record_count": imp.record_count,
            "status": imp.status,
        }
        if imp.imported_at and imp.imported_at < threshold:
            stale_sources.append(entry)
        else:
            fresh_sources.append(entry)

    return {
        "total_sources_expected": len(_EXPECTED_SOURCES),
        "sources_present": len(present_sources),
        "sources_missing": missing_sources,
        "stale_sources": stale_sources,
        "fresh_sources": fresh_sources,
        "data_quality": "UNKNOWN" if missing_sources else ("DEGRADED" if stale_sources else "GOOD"),
    }


async def _get_asset_gaps(db: AsyncSession) -> dict[str, Any]:
    """
    Identifies applications that have intents defined but missing or incomplete asset data.
    Explicitly surfaces UNKNOWN states so the AI can communicate them.
    """
    intent_res = await db.execute(select(ApplicationIntent))
    intents = intent_res.scalars().all()

    if not intents:
        return {
            "message": "No application intents defined. Runtime location state is UNKNOWN for all applications.",
            "gaps": [],
        }

    asset_res = await db.execute(select(RuntimeAsset))
    assets = asset_res.scalars().all()

    gaps = []
    for intent in intents:
        app_id = intent.application_id
        app_assets = [
            a for a in assets
            if (a.metadata_json or {}).get("application_id") == app_id
        ]

        has_primary = any(
            a.write_authority and a.latest_operational_state == "ACTIVE"
            for a in app_assets
        )

        missing_stacks = [
            s for s in (intent.required_tech_stacks or [])
            if not any(a.tech_stack == s for a in app_assets)
        ]

        actual_dcs = list({a.data_center_short for a in app_assets if a.data_center_short})
        intended_dcs = intent.intended_active_dcs or []
        missing_dcs = [dc for dc in intended_dcs if dc not in actual_dcs]

        confidence_levels = [a.latest_confidence_level for a in app_assets if a.latest_confidence_level]
        avg_confidence = round(sum(confidence_levels) / len(confidence_levels), 1) if confidence_levels else None

        if not app_assets or not has_primary or missing_stacks or missing_dcs:
            gaps.append({
                "application_id": app_id,
                "asset_count": len(app_assets),
                "has_primary_signal": has_primary,
                "missing_tech_stacks": missing_stacks,
                "missing_dcs": missing_dcs,
                "avg_confidence": avg_confidence,
                "state": "UNKNOWN" if not app_assets else ("WIP" if not has_primary else "PARTIAL"),
                "explanation": (
                    f"No assets found — data is UNKNOWN" if not app_assets
                    else f"Assets present but no primary write signal detected — WIP"
                    if not has_primary
                    else f"Missing data for: {', '.join(missing_stacks + missing_dcs)}"
                ),
            })

    return {
        "total_apps_with_intent": len(intents),
        "apps_with_gaps": len(gaps),
        "gaps": gaps,
    }


async def _get_confidence_breakdown(db: AsyncSession) -> dict[str, Any]:
    """Returns asset confidence distribution to indicate data quality."""
    res = await db.execute(
        select(
            RuntimeAsset.confidence_label,
            func.count(RuntimeAsset.id).label("count"),
        ).group_by(RuntimeAsset.confidence_label)
    )
    rows = res.all()

    if not rows:
        return {"message": "No runtime assets loaded. All confidence data is UNKNOWN."}

    breakdown = {row.confidence_label: row.count for row in rows}
    total = sum(breakdown.values())
    high_pct = round((breakdown.get("HIGH", 0) / total) * 100, 1) if total else 0

    return {
        "total_assets": total,
        "confidence_breakdown": breakdown,
        "high_confidence_pct": high_pct,
        "summary": (
            "Data quality HIGH" if high_pct >= 70
            else "Data quality MEDIUM — some signals are LOW confidence"
            if high_pct >= 40
            else "Data quality LOW — most signals have LOW or UNKNOWN confidence"
        ),
    }


class GapAnalysisAgent(BaseHealthMeshAgent):
    connector_slug = "gap-analysis"
    display_name = "Gap Analysis"
    system_prompt = (
        "You specialise in identifying missing, stale, or incomplete data. "
        "When data is absent or low-confidence, you say UNKNOWN or WIP explicitly "
        "rather than guessing. You explain what is missing and why."
    )

    def _register_tools(self) -> None:
        self.register_tool(
            "get_data_source_coverage",
            "Check which data sources have been imported and identify missing or stale ones.",
            _get_data_source_coverage,
        )
        self.register_tool(
            "get_asset_gaps",
            "Find applications with missing or incomplete asset data (UNKNOWN / WIP states).",
            _get_asset_gaps,
        )
        self.register_tool(
            "get_confidence_breakdown",
            "Get the confidence level distribution across all runtime assets.",
            _get_confidence_breakdown,
        )

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = []
        if any(kw in q for kw in ["missing", "stale", "coverage", "source", "import", "wip", "unknown", "gap"]):
            tools.append("get_data_source_coverage")
        if any(kw in q for kw in ["gap", "incomplete", "unknown", "wip", "missing data", "partial"]):
            tools.append("get_asset_gaps")
        if any(kw in q for kw in ["confidence", "quality", "reliable", "trust"]):
            tools.append("get_confidence_breakdown")
        return tools if tools else ["get_data_source_coverage", "get_asset_gaps"]

    def _build_args(self, tool_name: str, query: str) -> dict:
        return {}

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## Data Gap Analysis"]

        if "get_data_source_coverage" in data:
            cov = data["get_data_source_coverage"]
            quality = cov.get("data_quality", "UNKNOWN")
            parts.append(f"- Data quality: **{quality}**")
            missing = cov.get("sources_missing", [])
            if missing:
                parts.append(f"- **MISSING sources** (no data imported): {', '.join(missing)}")
                parts.append("  - These sources are UNKNOWN — do not infer their state")
            stale = cov.get("stale_sources", [])
            if stale:
                parts.append(f"- **Stale sources** (>24h old): {', '.join(s['source'] for s in stale)}")
            fresh = cov.get("fresh_sources", [])
            if fresh:
                parts.append(f"- Fresh sources ({len(fresh)}): {', '.join(s['source'] for s in fresh)}")

        if "get_asset_gaps" in data:
            gaps_data = data["get_asset_gaps"]
            if gaps_data.get("message"):
                parts.append(f"- {gaps_data['message']}")
            elif gaps_data.get("gaps"):
                parts.append(f"\n### Application Gaps ({gaps_data['apps_with_gaps']} of {gaps_data['total_apps_with_intent']})")
                for g in gaps_data["gaps"][:8]:
                    state = g.get("state", "UNKNOWN")
                    parts.append(f"- **{g['application_id']}** [{state}]: {g['explanation']}")

        if "get_confidence_breakdown" in data:
            cb = data["get_confidence_breakdown"]
            if cb.get("message"):
                parts.append(f"- {cb['message']}")
            else:
                parts.append(f"\n### Asset Confidence: {cb.get('summary', 'UNKNOWN')}")
                breakdown = cb.get("confidence_breakdown", {})
                for level, count in sorted(breakdown.items()):
                    parts.append(f"  - {level}: {count} assets")

        return "\n".join(parts)
