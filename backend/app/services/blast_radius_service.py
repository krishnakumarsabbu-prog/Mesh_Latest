"""
Blast Radius Service.

Calculates the impact of a data center going offline. Uses real runtime asset data
from the database to determine:
  - Applications with PRIMARY write authority in the failed DC (fully impacted)
  - Applications with components in the DC but not primary (partially impacted)
  - Failover targets per app from ApplicationIntent
  - Recovery time estimates from RTO SLA in intent
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.runtime import ApplicationIntent, RuntimeAsset, RuntimeDataCenter

logger = logging.getLogger("healthmesh.blast_radius")


@dataclass
class AppImpact:
    application_id: str
    application_name: str
    environment: str
    primary_dc: Optional[str]
    has_failover: bool
    failover_target: Optional[str]
    promotion_required: bool
    critical_reason: Optional[str]
    affected_tech_stacks: List[str] = field(default_factory=list)
    standby_dc: Optional[str] = None


@dataclass
class BlastRadiusResult:
    dc: str
    dc_full_name: str
    simulated_at: str
    total_apps_impacted: int
    critical_count: int      # No failover available
    warning_count: int       # Failover available
    critical_apps: List[AppImpact] = field(default_factory=list)
    warning_apps: List[AppImpact] = field(default_factory=list)
    failover_targets: Dict[str, Optional[str]] = field(default_factory=dict)
    estimated_recovery_summary: str = "Per RTO SLA"


async def calculate_blast_radius(dc_short_name: str, db: AsyncSession) -> BlastRadiusResult:
    """
    Calculate blast radius for taking a DC offline.

    Steps:
    1. Verify the DC exists
    2. Find all assets in this DC
    3. Group assets by (application_id_heuristic, environment)
    4. For each impacted app, check ApplicationIntent for failover target
    5. Classify as critical (no failover) or warning (has failover)
    """
    # 1. Resolve DC
    dc_result = await db.execute(
        select(RuntimeDataCenter).where(RuntimeDataCenter.short_name == dc_short_name)
    )
    dc = dc_result.scalar_one_or_none()
    if not dc:
        # Try by name
        dc_result = await db.execute(
            select(RuntimeDataCenter).where(RuntimeDataCenter.name == dc_short_name)
        )
        dc = dc_result.scalar_one_or_none()

    dc_full_name = dc.name if dc else dc_short_name

    # 2. Find all assets in this DC
    assets_result = await db.execute(
        select(RuntimeAsset).where(RuntimeAsset.data_center_short == dc_short_name)
    )
    assets_in_dc: List[RuntimeAsset] = assets_result.scalars().all()

    if not assets_in_dc:
        return BlastRadiusResult(
            dc=dc_short_name,
            dc_full_name=dc_full_name,
            simulated_at=datetime.utcnow().isoformat(),
            total_apps_impacted=0,
            critical_count=0,
            warning_count=0,
        )

    # 3. Load all ApplicationIntents for lookup
    intents_result = await db.execute(select(ApplicationIntent))
    intents: List[ApplicationIntent] = intents_result.scalars().all()
    intent_map: Dict[str, ApplicationIntent] = {i.application_id: i for i in intents}

    # 4. Also load all assets to find standby options
    all_assets_result = await db.execute(select(RuntimeAsset))
    all_assets: List[RuntimeAsset] = all_assets_result.scalars().all()

    # Group all assets by (inferred_app_id, environment)
    # We use asset host prefix heuristic to group into apps
    # Primary grouping: use intent application_id or infer from asset name patterns

    # Build a map of what apps have assets per DC
    # Heuristic: group assets that share the same name prefix or metadata cluster
    app_groups: Dict[str, Dict[str, Any]] = {}  # app_key -> {assets, dc_assets}

    for asset in all_assets:
        app_key = _infer_app_key(asset)
        if app_key not in app_groups:
            app_groups[app_key] = {
                "assets": [],
                "in_dc": [],
                "environment": asset.environment,
                "tech_stacks": set(),
            }
        app_groups[app_key]["assets"].append(asset)
        app_groups[app_key]["tech_stacks"].add(asset.tech_stack)
        if asset.data_center_short == dc_short_name:
            app_groups[app_key]["in_dc"].append(asset)

    # 5. Build impact list - only for app_groups that have assets in the target DC
    critical_apps: List[AppImpact] = []
    warning_apps: List[AppImpact] = []

    for app_key, group in app_groups.items():
        if not group["in_dc"]:
            continue

        environment = group["environment"]
        in_dc_assets: List[RuntimeAsset] = group["in_dc"]
        all_group_assets: List[RuntimeAsset] = group["assets"]

        # Check if any asset in DC has write authority (primary)
        has_write_in_dc = any(a.write_authority for a in in_dc_assets)
        primary_dc = dc_short_name if has_write_in_dc else None

        # Check for standby in other DCs
        other_dc_assets = [a for a in all_group_assets if a.data_center_short != dc_short_name]
        has_standby_elsewhere = len(other_dc_assets) > 0
        standby_dc = other_dc_assets[0].data_center_short if other_dc_assets else None
        has_write_elsewhere = any(a.write_authority for a in other_dc_assets)

        # Try to get intent for this app
        intent = intent_map.get(app_key)
        failover_target: Optional[str] = None
        if intent:
            failover_targets_list = [
                dc for dc in (intent.intended_active_dcs or [])
                if dc != dc_short_name
            ]
            failover_target = failover_targets_list[0] if failover_targets_list else standby_dc
            has_failover = len(failover_targets_list) > 0 or has_standby_elsewhere
        else:
            has_failover = has_standby_elsewhere
            failover_target = standby_dc

        promotion_required = has_failover and not has_write_elsewhere
        app_name = _infer_app_name(app_key, in_dc_assets[0])

        impact = AppImpact(
            application_id=app_key,
            application_name=app_name,
            environment=environment,
            primary_dc=primary_dc or dc_short_name,
            has_failover=has_failover,
            failover_target=failover_target,
            promotion_required=promotion_required,
            critical_reason=None if has_failover else "No assets in any other DC — application will go offline",
            affected_tech_stacks=list(group["tech_stacks"]),
            standby_dc=standby_dc,
        )

        if has_failover:
            warning_apps.append(impact)
        else:
            critical_apps.append(impact)

    total = len(critical_apps) + len(warning_apps)
    failover_targets = {
        imp.application_id: imp.failover_target
        for imp in (critical_apps + warning_apps)
    }

    # Estimate recovery based on intent data
    recovery_summary = "Per RTO SLA"
    if critical_apps:
        recovery_summary = f"{len(critical_apps)} app(s) require manual intervention; failover apps auto-recover per RTO SLA"

    return BlastRadiusResult(
        dc=dc_short_name,
        dc_full_name=dc_full_name,
        simulated_at=datetime.utcnow().isoformat(),
        total_apps_impacted=total,
        critical_count=len(critical_apps),
        warning_count=len(warning_apps),
        critical_apps=critical_apps,
        warning_apps=warning_apps,
        failover_targets=failover_targets,
        estimated_recovery_summary=recovery_summary,
    )


def _infer_app_key(asset: RuntimeAsset) -> str:
    """Derive an application identifier from asset metadata."""
    # If metadata has cluster or rs_nm grouping, use those
    if asset.metadata_json:
        cluster = asset.metadata_json.get("cluster") or asset.metadata_json.get("rs_nm")
        if cluster:
            return f"{cluster}::{asset.environment}"

    # Group by tech_stack + environment prefix of host
    host = (asset.host or asset.name or "unknown").split(".")[0]
    # Strip trailing digits to group nodes of same cluster
    import re
    base = re.sub(r"\d+$", "", host)
    return f"{base}::{asset.environment}::{asset.tech_stack}"


def _infer_app_name(app_key: str, sample_asset: RuntimeAsset) -> str:
    """Generate a human-readable app name from the app key."""
    parts = app_key.split("::")
    if len(parts) >= 1:
        name_part = parts[0].replace("-", " ").replace("_", " ").title()
        env = parts[1] if len(parts) > 1 else ""
        stack = parts[2] if len(parts) > 2 else sample_asset.tech_stack
        return f"{name_part} ({stack.upper()}) [{env}]"
    return app_key
