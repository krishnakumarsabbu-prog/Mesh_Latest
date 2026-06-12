import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.runtime import RuntimeAsset, ApplicationIntent, RuntimeDataCenter

logger = logging.getLogger(__name__)

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
    affected_tech_stacks: List[str]
    standby_dc: Optional[str]

@dataclass
class BlastRadiusResult:
    dc: str
    dc_full_name: str
    simulated_at: str
    total_apps_impacted: int
    critical_count: int
    warning_count: int
    estimated_recovery_summary: str
    failover_targets: Dict[str, Optional[str]]
    critical_apps: List[AppImpact] = field(default_factory=list)
    warning_apps: List[AppImpact] = field(default_factory=list)

async def calculate_blast_radius(dc_name: str, db: AsyncSession) -> BlastRadiusResult:
    # Resolve DC full name
    dc_res = await db.execute(
        select(RuntimeDataCenter).where(
            (RuntimeDataCenter.short_name == dc_name) | (RuntimeDataCenter.name == dc_name)
        )
    )
    dc_obj = dc_res.scalar_one_or_none()
    dc_full_name = dc_obj.name if dc_obj else f"Data Center {dc_name}"
    short_name = dc_obj.short_name if dc_obj else dc_name

    # Fetch all assets and intents
    assets_res = await db.execute(select(RuntimeAsset))
    all_assets = assets_res.scalars().all()

    intents_res = await db.execute(select(ApplicationIntent))
    all_intents = intents_res.scalars().all()
    intents_by_id = {i.application_id: i for i in all_intents}

    # Group assets by application ID and environment
    app_env_assets: Dict[tuple, List[RuntimeAsset]] = {}
    for asset in all_assets:
        app_id = None
        if asset.metadata_json and asset.metadata_json.get("application_id"):
            app_id = asset.metadata_json.get("application_id")
        elif asset.data_source == "ibm_mq":
            app_id = "MQ_INFRA"
        elif asset.data_source == "mongodb":
            app_id = "MONGO_INFRA"
        elif asset.data_source == "oracle_oem":
            app_id = "ORACLE_INFRA"

        if not app_id:
            continue

        key = (app_id, asset.environment)
        if key not in app_env_assets:
            app_env_assets[key] = []
        app_env_assets[key].append(asset)

    critical_apps: List[AppImpact] = []
    warning_apps: List[AppImpact] = []
    failover_targets: Dict[str, Optional[str]] = {}

    # Analyze impact for each app + env combination
    for (app_id, env), assets in app_env_assets.items():
        # Check if this app has active assets in the offline DC
        assets_in_failed_dc = [a for a in assets if a.data_center_short == short_name]
        if not assets_in_failed_dc:
            continue

        # Find primary DC for this app in this env (the one with active/write authority)
        primary_asset = next((a for a in assets if a.write_authority and a.latest_operational_state == "ACTIVE"), None)
        if not primary_asset:
            primary_asset = next((a for a in assets if a.latest_operational_state == "ACTIVE"), None)
        primary_dc = primary_asset.data_center_short if primary_asset else (assets_in_failed_dc[0].data_center_short if assets_in_failed_dc else None)

        # Is the app actually active on the failed DC?
        # If it only has passive/standby assets in the failed DC, it's not critically impacted, or warning
        # But let's assume if it has active assets in the failed DC, it is impacted.
        is_active_in_failed_dc = any(a.latest_operational_state == "ACTIVE" for a in assets_in_failed_dc)
        if not is_active_in_failed_dc:
            continue

        intent = intents_by_id.get(app_id)
        
        # Determine standby/failover DCs
        other_dcs = []
        if intent:
            other_dcs = [d for d in (intent.intended_active_dcs or []) if d != short_name]
        else:
            other_dcs = list(set(a.data_center_short for a in assets if a.data_center_short and a.data_center_short != short_name))

        # Check if there are assets available in the other DCs
        available_standby_dc = None
        for dc in other_dcs:
            has_assets_in_dc = any(a.data_center_short == dc and a.latest_operational_state in ("ACTIVE", "STANDBY") for a in assets)
            if has_assets_in_dc:
                available_standby_dc = dc
                break

        has_failover = available_standby_dc is not None
        failover_target = available_standby_dc

        # Promotion required if replication or failover is manual
        promotion_required = False
        if intent:
            promotion_required = intent.failover_type == "MANUAL" or intent.replication_model in ("SINGLE_WRITER", "READ_REPLICA")
        else:
            # Fallback heuristic
            promotion_required = any(a.tech_stack in ("oracle", "mssql", "mongodb") for a in assets_in_failed_dc)

        affected_tech_stacks = list(set(a.tech_stack for a in assets_in_failed_dc))
        
        app_name = intent.application_name if intent else (assets_in_failed_dc[0].metadata_json.get("application_name") if assets_in_failed_dc[0].metadata_json else f"{app_id} Application")

        impact = AppImpact(
            application_id=app_id,
            application_name=app_name,
            environment=env,
            primary_dc=primary_dc,
            has_failover=has_failover,
            failover_target=failover_target,
            promotion_required=promotion_required,
            critical_reason=None if has_failover else f"No standby assets found in target failover zones for {app_id}",
            affected_tech_stacks=affected_tech_stacks,
            standby_dc=failover_target
        )

        if has_failover:
            warning_apps.append(impact)
            failover_targets[app_id] = failover_target
        else:
            critical_apps.append(impact)
            failover_targets[app_id] = None

    total_apps_impacted = len(critical_apps) + len(warning_apps)
    
    # Calculate recovery projection
    if critical_apps:
        estimated_recovery_summary = "RTO SLA violated. Manual recovery required for critical components."
    elif warning_apps:
        estimated_recovery_summary = f"All {len(warning_apps)} applications can failover. Estimated auto-recovery: ~2 minutes."
    else:
        estimated_recovery_summary = "No active production workloads affected by this data center."

    return BlastRadiusResult(
        dc=short_name,
        dc_full_name=dc_full_name,
        simulated_at=datetime.utcnow().isoformat() + "Z",
        total_apps_impacted=total_apps_impacted,
        critical_count=len(critical_apps),
        warning_count=len(warning_apps),
        estimated_recovery_summary=estimated_recovery_summary,
        failover_targets=failover_targets,
        critical_apps=critical_apps,
        warning_apps=warning_apps
    )
