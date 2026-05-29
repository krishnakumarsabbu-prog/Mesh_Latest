"""
Runtime Location Agent — answers "where is X primary?" questions
by querying live RuntimeAsset and ApplicationIntent data.
"""
import logging
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.agents.base_agent import BaseHealthMeshAgent
from app.models.runtime import RuntimeAsset, ApplicationIntent, RuntimeAuditLog

logger = logging.getLogger(__name__)


async def _get_application_location(db: AsyncSession, application_id: Optional[str] = None) -> dict[str, Any]:
    """
    Returns a summary of where applications are currently running.
    If application_id is provided, returns detail for that app only.
    """
    asset_res = await db.execute(select(RuntimeAsset))
    assets = asset_res.scalars().all()

    intent_res = await db.execute(select(ApplicationIntent))
    intents = intent_res.scalars().all()
    intent_map = {i.application_id: i for i in intents}

    if application_id:
        app_assets = [a for a in assets if (
            (a.metadata_json or {}).get("application_id") == application_id or
            application_id.upper() in (a.metadata_json or {}).get("application_id", "").upper()
        )]
        if not app_assets:
            # Try fuzzy match by data_source or metadata
            fuzzy = application_id.lower()
            app_assets = [a for a in assets if fuzzy in (a.name or "").lower()]
    else:
        app_assets = assets

    if not app_assets:
        return {
            "found": False,
            "message": f"No runtime assets found for '{application_id}'. Data may be UNKNOWN or WIP.",
        }

    # Build per-DC summary
    dc_summary: dict[str, dict] = {}
    for a in app_assets:
        dc = a.data_center_short or "UNKNOWN"
        if dc not in dc_summary:
            dc_summary[dc] = {"assets": 0, "primaries": [], "roles": set()}
        dc_summary[dc]["assets"] += 1
        if a.write_authority and a.latest_operational_state == "ACTIVE":
            dc_summary[dc]["primaries"].append(a.name)
        dc_summary[dc]["roles"].add(a.latest_replication_role or "NONE")

    # Find primary write DC
    primary_dc = None
    for dc, info in dc_summary.items():
        if info["primaries"]:
            primary_dc = dc
            break

    intent = intent_map.get(application_id or "")
    intended_primary = intent.intended_primary_dc if intent else None
    drift_status = "UNKNOWN"
    if primary_dc and intended_primary:
        drift_status = "ALIGNED" if primary_dc == intended_primary else "DRIFTED"
    elif primary_dc:
        drift_status = "NO_INTENT_DEFINED"

    return {
        "found": True,
        "application_id": application_id,
        "primary_write_dc": primary_dc or "UNKNOWN",
        "intended_primary_dc": intended_primary or "UNKNOWN",
        "drift_status": drift_status,
        "active_data_centers": list(dc_summary.keys()),
        "dc_breakdown": {
            dc: {
                "asset_count": info["assets"],
                "has_primary": bool(info["primaries"]),
                "roles": list(info["roles"]),
            }
            for dc, info in dc_summary.items()
        },
        "total_assets": len(app_assets),
    }


async def _get_drift_summary(db: AsyncSession) -> dict[str, Any]:
    """Returns recent CRITICAL drift events from audit log."""
    since = datetime.utcnow() - timedelta(hours=24)
    log_res = await db.execute(
        select(RuntimeAuditLog)
        .where(
            RuntimeAuditLog.event_type == "DRIFT_DETECTED",
            RuntimeAuditLog.occurred_at >= since,
        )
        .order_by(RuntimeAuditLog.occurred_at.desc())
        .limit(10)
    )
    logs = log_res.scalars().all()

    if not logs:
        return {"drift_events_24h": 0, "message": "No drift events in last 24 hours."}

    return {
        "drift_events_24h": len(logs),
        "events": [
            {
                "application_id": log.application_id,
                "description": log.description,
                "occurred_at": log.occurred_at.isoformat() if log.occurred_at else None,
            }
            for log in logs
        ],
    }


async def _get_all_primary_locations(db: AsyncSession) -> dict[str, Any]:
    """Returns a table of all applications and their current primary write DC."""
    asset_res = await db.execute(select(RuntimeAsset))
    assets = asset_res.scalars().all()

    intent_res = await db.execute(select(ApplicationIntent))
    intents = intent_res.scalars().all()

    # Group assets by application_id from metadata
    app_groups: dict[str, list] = {}
    for a in assets:
        app_id = (a.metadata_json or {}).get("application_id", "INFRASTRUCTURE")
        if app_id not in app_groups:
            app_groups[app_id] = []
        app_groups[app_id].append(a)

    intent_map = {i.application_id: i for i in intents}
    rows = []

    for app_id, app_assets in app_groups.items():
        primary = next(
            (a for a in app_assets if a.write_authority and a.latest_operational_state == "ACTIVE"),
            None,
        )
        primary_dc = primary.data_center_short if primary else "UNKNOWN"
        intent = intent_map.get(app_id)
        intended = intent.intended_primary_dc if intent else "NO INTENT"
        dcs = list({a.data_center_short for a in app_assets if a.data_center_short})

        rows.append({
            "application_id": app_id,
            "primary_write_dc": primary_dc,
            "intended_primary_dc": intended,
            "active_dcs": dcs,
            "asset_count": len(app_assets),
        })

    if not rows:
        return {"message": "No runtime assets loaded. Data is UNKNOWN — import CSV files to populate."}

    return {"applications": rows, "total": len(rows)}


class RuntimeLocationAgent(BaseHealthMeshAgent):
    connector_slug = "runtime-location"
    display_name = "Runtime Location"
    system_prompt = (
        "You specialise in answering questions about where applications are running: "
        "which data centre holds the primary write, whether topology has drifted from intent, "
        "and what the live runtime state is."
    )

    def _register_tools(self) -> None:
        self.register_tool(
            "get_application_location",
            "Get the current primary write DC and DC breakdown for a specific application.",
            _get_application_location,
        )
        self.register_tool(
            "get_all_primary_locations",
            "List all tracked applications with their current and intended primary write DC.",
            _get_all_primary_locations,
        )
        self.register_tool(
            "get_drift_summary",
            "Get recent CRITICAL drift events from the last 24 hours.",
            _get_drift_summary,
        )

    def _select_tools(self, query: str) -> list[str]:
        q = query.lower()
        tools = []
        if any(kw in q for kw in ["where is", "primary", "location", "which dc", "data center", "datacenter", "running"]):
            tools.append("get_application_location")
        if any(kw in q for kw in ["all applications", "all apps", "list", "overview", "summary", "all primary"]):
            tools.append("get_all_primary_locations")
        if any(kw in q for kw in ["drift", "wrong", "mismatch", "drifted", "aligned", "intent"]):
            tools.append("get_drift_summary")
        return tools if tools else ["get_all_primary_locations"]

    def _build_args(self, tool_name: str, query: str) -> dict:
        if tool_name == "get_application_location":
            # Attempt to extract application name from query
            import re
            patterns = [
                r"where is ([A-Z][A-Z0-9_\-]+)",
                r"primary (?:for|of) ([A-Z][A-Z0-9_\-]+)",
                r"location of ([A-Z][A-Z0-9_\-]+)",
                r"([A-Z][A-Z0-9_\-]+) (?:primary|running|location)",
            ]
            for p in patterns:
                m = re.search(p, query, re.IGNORECASE)
                if m:
                    return {"application_id": m.group(1).upper()}
            return {"application_id": None}
        return {}

    def _summarize(self, data: dict, query: str) -> str:
        parts = ["## Runtime Location Data"]

        if "get_application_location" in data:
            loc = data["get_application_location"]
            if loc.get("found"):
                app_id = loc.get("application_id") or "Application"
                primary = loc.get("primary_write_dc", "UNKNOWN")
                intended = loc.get("intended_primary_dc", "UNKNOWN")
                drift = loc.get("drift_status", "UNKNOWN")
                dcs = ", ".join(loc.get("active_data_centers", []))
                parts.append(f"- **{app_id}**: Primary write DC = **{primary}** (intended: {intended})")
                parts.append(f"  - Alignment: {drift}")
                parts.append(f"  - Active DCs: {dcs or 'UNKNOWN'}")
            else:
                parts.append(f"- {loc.get('message', 'No data')}")

        if "get_all_primary_locations" in data:
            overview = data["get_all_primary_locations"]
            if "applications" in overview:
                parts.append(f"\n### All Applications ({overview['total']} tracked)")
                for row in overview["applications"][:10]:
                    status = "ALIGNED" if row["primary_write_dc"] == row["intended_primary_dc"] else "DRIFTED"
                    parts.append(
                        f"- **{row['application_id']}**: primary={row['primary_write_dc']} "
                        f"(intended={row['intended_primary_dc']}) [{status}]"
                    )
            else:
                parts.append(f"- {overview.get('message', 'No data')}")

        if "get_drift_summary" in data:
            drift_data = data["get_drift_summary"]
            if drift_data.get("drift_events_24h", 0) > 0:
                parts.append(f"\n### Recent Drift Events ({drift_data['drift_events_24h']} in last 24h)")
                for ev in (drift_data.get("events") or [])[:5]:
                    parts.append(f"- **{ev['application_id']}**: {ev['description']}")
            else:
                parts.append(f"\n- {drift_data.get('message', 'No drift events.')}")

        return "\n".join(parts)
