"""
Initial reference data seeder for HealthMesh runtime tables.
Called on startup to ensure baseline data centers and sample applications
are available even before any CSV imports are performed.
"""
import uuid
import logging
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import AsyncSessionLocal
from app.models.runtime import RuntimeDataCenter, ApplicationIntent, SourceProposal, RuntimeAuditLog
from app.models.health_rule import (
    HealthRule, HealthRuleCondition,
    ConditionLogicGroup, ConditionMetricType, ConditionOperator,
    RuleAction, RuleScope, RuleSeverity, RuleStatus,
)

logger = logging.getLogger(__name__)

_REFERENCE_DATA_CENTERS = [
    {"name": "DC Birmingham IBB1",   "short_name": "IBB1",   "region": "UK-Midlands", "zone": "AZ1"},
    {"name": "DC Shoreview",         "short_name": "SHV",    "region": "US-Midwest",  "zone": "AZ2"},
    {"name": "DC Georgia Production","short_name": "GA-PRD", "region": "US-East",     "zone": "AZ1"},
    {"name": "DC Maryland Production","short_name": "MA-PRD","region": "US-East",     "zone": "AZ2"},
    {"name": "DC Georgia UAT",       "short_name": "GA-UAT", "region": "US-East",     "zone": "UAT-1"},
    {"name": "DC Maryland UAT",      "short_name": "MA-UAT", "region": "US-East",     "zone": "UAT-2"},
    {"name": "DC UAT",               "short_name": "UAT",    "region": "Internal",    "zone": "UAT"},
    {"name": "DC Production",        "short_name": "PRD",    "region": "Internal",    "zone": "PRD"},
    {"name": "Azure Zone 3",         "short_name": "AZ3",    "region": "Cloud-East",  "zone": "az003"},
    {"name": "DC Cloud",             "short_name": "CLD",    "region": "Cloud",       "zone": "CLD"},
]

_REFERENCE_INTENTS = [
    {
        "application_id": "PCA",
        "application_name": "Patient Care Portal (PCA)",
        "intended_active_dcs": ["IBB1", "SHV"],
        "intended_primary_dc": "IBB1",
        "intended_environments": ["PRODUCTION"],
        "failover_type": "MANUAL",
        "replication_model": "READ_REPLICA",
        "required_tech_stacks": ["oracle", "mongodb"],
    },
    {
        "application_id": "BILLING",
        "application_name": "Billing Operations (BILLING)",
        "intended_active_dcs": ["GA-PRD", "MA-PRD"],
        "intended_primary_dc": "GA-PRD",
        "intended_environments": ["PRODUCTION"],
        "failover_type": "AUTOMATIC",
        "replication_model": "SINGLE_WRITER",
        "required_tech_stacks": ["ibm_mq", "mssql"],
    },
    {
        "application_id": "CLAIMS",
        "application_name": "Claims Processing (CLAIMS)",
        "intended_active_dcs": ["IBB1", "SHV"],
        "intended_primary_dc": "IBB1",
        "intended_environments": ["PRODUCTION"],
        "failover_type": "AUTOMATIC",
        "replication_model": "SINGLE_WRITER",
        "required_tech_stacks": ["kafka", "ocp"],
    },
]

_REFERENCE_PROPOSALS = [
    {
        "source_name": "IBM MQ cluster column",
        "system": "Prometheus / IBM MQ Exporter",
        "signal_type": "Topology — cluster membership",
        "tech_stack": "ibm_mq",
        "rationale": "The cluster field in Prometheus MQ metrics identifies multi-DC cluster membership. Confidence 4 for cluster topology when set.",
        "is_deterministic_claim": True,
        "proposed_by": "Team HealthMesh",
        "status": "ACCEPTED",
    },
    {
        "source_name": "MongoDB Value integer field",
        "system": "Prometheus / MongoDB Exporter (Ops Manager)",
        "signal_type": "Replication state — integer authoritative flag",
        "tech_stack": "mongodb",
        "rationale": "The Value column (1=primary, 2=secondary) is a deterministic integer replication state. Cross-validating against replica_state_name text enables internal conflict detection.",
        "is_deterministic_claim": True,
        "proposed_by": "Team HealthMesh",
        "status": "ACCEPTED",
    },
    {
        "source_name": "Oracle CMDB DEVICE_LVL hierarchy",
        "system": "CMDB — ServiceNow",
        "signal_type": "Topology — Oracle catalog/instance/server chain",
        "tech_stack": "oracle",
        "rationale": "DEVICE_LVL1-4 columns in CMDB encode the full Oracle device chain. Combined with OEM role data, enables HA topology inference at confidence 4.",
        "is_deterministic_claim": True,
        "proposed_by": "Team HealthMesh",
        "status": "PENDING",
    },
    {
        "source_name": "SCOM ReplicaStatus HealthState",
        "system": "SCOM — System Center Operations Manager",
        "signal_type": "SQL AG Replication health signal",
        "tech_stack": "mssql",
        "rationale": "SCOM HealthState (Success/Warning) combined with Role (Primary/Secondary) gives deterministic AG topology for SQL Server Always On. Confidence 4 for healthy primary.",
        "is_deterministic_claim": True,
        "proposed_by": "Team HealthMesh",
        "status": "ACCEPTED",
    },
    {
        "source_name": "OCP cluster column in pod_info",
        "system": "OpenShift / OCP Prometheus Exporter",
        "signal_type": "Pod placement — cluster site prefix",
        "tech_stack": "ocp",
        "rationale": "The cluster field in OCP pod exports encodes the physical site (e.g., dcglnh01ocp). Parsing the first 4 chars maps to DC short name for confident pod-to-DC placement.",
        "is_deterministic_claim": True,
        "proposed_by": "Team HealthMesh",
        "status": "ACCEPTED",
    },
]


async def seed_reference_data() -> None:
    """Seed reference data centers, intents, proposals, and built-in rules if not already present."""
    try:
        async with AsyncSessionLocal() as session:
            await _seed_data_centers(session)
            await _seed_intents(session)
            await _seed_proposals(session)
            await _seed_builtin_rules(session)
            await _seed_sample_components(session)
            await session.commit()
        logger.info("Runtime reference data seeded successfully")
    except Exception as exc:
        logger.error(f"Failed to seed runtime reference data: {exc}")


async def _seed_sample_components(session: AsyncSession) -> None:
    from app.models.team import Team
    from app.models.project import Project
    from app.models.component import Component

    # 1. Fetch all teams
    teams_result = await session.execute(select(Team))
    teams = teams_result.scalars().all()
    if not teams:
        logger.info("  [seed] No teams found, skipping component seeding")
        return

    # 2. Check if any components already exist
    comp_check = await session.execute(select(Component))
    if comp_check.scalars().first():
        logger.info("  [seed] Components already exist, skipping component seeding")
        return

    seeded_components = 0
    assigned_projects = 0

    for t in teams:
        # Create 2 default components for this team
        comp1_id = str(uuid.uuid4())
        comp1 = Component(
            id=comp1_id,
            name="Core Platform APIs",
            slug=f"{t.slug}-core-apis",
            description=f"Backend services, APIs, and infrastructure components for {t.name}",
            color="#AF52DE",
            icon="layers",
            team_id=t.id,
            lob_id=t.lob_id,
            tenant_id=t.tenant_id or "default"
        )
        comp2_id = str(uuid.uuid4())
        comp2 = Component(
            id=comp2_id,
            name="Frontend Interfaces",
            slug=f"{t.slug}-frontend-interfaces",
            description=f"Web applications, portals, and customer-facing interfaces for {t.name}",
            color="#00C0D1",
            icon="box",
            team_id=t.id,
            lob_id=t.lob_id,
            tenant_id=t.tenant_id or "default"
        )
        session.add(comp1)
        session.add(comp2)
        seeded_components += 2

        # 3. Find projects belonging to this team, and assign them to components
        projects_result = await session.execute(select(Project).where(Project.team_id == t.id))
        team_projects = projects_result.scalars().all()
        for idx, p in enumerate(team_projects):
            # Alternate assigning projects to comp1 and comp2
            p.component_id = comp1_id if idx % 2 == 0 else comp2_id
            session.add(p)
            assigned_projects += 1

    if seeded_components:
        logger.info(f"  [seed] {seeded_components} sample components created, {assigned_projects} projects assigned")


async def _seed_data_centers(session: AsyncSession) -> None:
    seeded = 0
    for dc_data in _REFERENCE_DATA_CENTERS:
        result = await session.execute(
            select(RuntimeDataCenter).where(RuntimeDataCenter.short_name == dc_data["short_name"])
        )
        if result.scalar_one_or_none():
            continue
        dc = RuntimeDataCenter(
            id=str(uuid.uuid4()),
            name=dc_data["name"],
            short_name=dc_data["short_name"],
            region=dc_data["region"],
            zone=dc_data["zone"],
            asset_count=0,
        )
        session.add(dc)
        seeded += 1

    if seeded:
        logger.info(f"  [seed] {seeded} reference data centers created")


async def _seed_intents(session: AsyncSession) -> None:
    seeded = 0
    for intent_data in _REFERENCE_INTENTS:
        result = await session.execute(
            select(ApplicationIntent).where(ApplicationIntent.application_id == intent_data["application_id"])
        )
        if result.scalar_one_or_none():
            continue
        intent = ApplicationIntent(
            application_id=intent_data["application_id"],
            application_name=intent_data["application_name"],
            intended_active_dcs=intent_data["intended_active_dcs"],
            intended_primary_dc=intent_data["intended_primary_dc"],
            intended_environments=intent_data["intended_environments"],
            failover_type=intent_data["failover_type"],
            replication_model=intent_data["replication_model"],
            required_tech_stacks=intent_data["required_tech_stacks"],
        )
        session.add(intent)
        seeded += 1

    if seeded:
        logger.info(f"  [seed] {seeded} application intents created")


async def _seed_proposals(session: AsyncSession) -> None:
    # Check if any proposals already exist to avoid re-seeding
    result = await session.execute(select(SourceProposal))
    existing = result.scalars().all()
    if existing:
        return

    for p in _REFERENCE_PROPOSALS:
        proposal = SourceProposal(
            id=str(uuid.uuid4()),
            source_name=p["source_name"],
            system=p["system"],
            signal_type=p["signal_type"],
            tech_stack=p["tech_stack"],
            rationale=p["rationale"],
            is_deterministic_claim=p["is_deterministic_claim"],
            proposed_by=p["proposed_by"],
            status=p["status"],
        )
        session.add(proposal)

    logger.info(f"  [seed] {len(_REFERENCE_PROPOSALS)} source proposals created")


_BUILTIN_RULES = [
    {
        "slug": "builtin-freshness-degradation",
        "name": "Freshness Degradation Alert",
        "description": (
            "Auto-alert when connector confidence drops to LOW or below. "
            "Fires before data quality degrades to UNKNOWN, giving operators "
            "time to investigate stale or missing data sources."
        ),
        "scope": RuleScope.GLOBAL,
        "severity": RuleSeverity.HIGH,
        "action": RuleAction.FLAG_INCIDENT,
        "action_value": 10.0,
        "logic_group": ConditionLogicGroup.OR,
        "priority_weight": 1.5,
        "conditions": [
            {
                "metric_type": ConditionMetricType.AVAILABILITY_PCT,
                "operator": ConditionOperator.LESS_THAN,
                "threshold_value": 70.0,
                "description": "Availability below 70% — connector data may be stale",
                "display_order": 0,
            },
            {
                "metric_type": ConditionMetricType.CONSECUTIVE_FAILURES,
                "operator": ConditionOperator.GREATER_THAN_OR_EQUAL,
                "threshold_value": 3.0,
                "description": "3+ consecutive fetch failures — confidence degrading",
                "display_order": 1,
            },
        ],
    },
    {
        "slug": "builtin-wrong-primary-dc",
        "name": "Wrong Primary DC Alert",
        "description": (
            "Fire when the health score drops sharply (>25 points) AND error rate is elevated, "
            "which is the pattern observed when a primary DC changes unexpectedly "
            "or fails over without operator acknowledgement."
        ),
        "scope": RuleScope.GLOBAL,
        "severity": RuleSeverity.CRITICAL,
        "action": RuleAction.FLAG_INCIDENT,
        "action_value": 20.0,
        "logic_group": ConditionLogicGroup.AND,
        "priority_weight": 2.0,
        "conditions": [
            {
                "metric_type": ConditionMetricType.HEALTH_SCORE,
                "operator": ConditionOperator.LESS_THAN,
                "threshold_value": 50.0,
                "description": "Health score below 50 — primary DC likely unavailable",
                "display_order": 0,
            },
            {
                "metric_type": ConditionMetricType.ERROR_RATE,
                "operator": ConditionOperator.GREATER_THAN_OR_EQUAL,
                "threshold_value": 0.3,
                "description": "Error rate >= 30% — unexpected failures consistent with wrong primary",
                "display_order": 1,
            },
        ],
    },
    {
        "slug": "builtin-sla-breach-warning",
        "name": "SLA Breach Warning",
        "description": "Alert when SLA compliance drops below the 99% threshold target.",
        "scope": RuleScope.GLOBAL,
        "severity": RuleSeverity.HIGH,
        "action": RuleAction.APPLY_PENALTY,
        "action_value": 15.0,
        "logic_group": ConditionLogicGroup.AND,
        "priority_weight": 1.2,
        "conditions": [
            {
                "metric_type": ConditionMetricType.SLA_PCT,
                "operator": ConditionOperator.LESS_THAN,
                "threshold_value": 99.0,
                "description": "SLA compliance below 99% target",
                "display_order": 0,
            },
            {
                "metric_type": ConditionMetricType.UPTIME_PCT,
                "operator": ConditionOperator.LESS_THAN,
                "threshold_value": 99.5,
                "description": "Uptime below 99.5%",
                "display_order": 1,
            },
        ],
    },
]


async def _seed_builtin_rules(session: AsyncSession) -> None:
    seeded = 0
    for rule_def in _BUILTIN_RULES:
        existing = await session.execute(
            select(HealthRule).where(HealthRule.slug == rule_def["slug"])
        )
        if existing.scalar_one_or_none():
            continue

        rule_id = str(uuid.uuid4())
        rule = HealthRule(
            id=rule_id,
            name=rule_def["name"],
            description=rule_def["description"],
            slug=rule_def["slug"],
            scope=rule_def["scope"],
            severity=rule_def["severity"],
            action=rule_def["action"],
            action_value=rule_def.get("action_value"),
            logic_group=rule_def["logic_group"],
            priority_weight=rule_def.get("priority_weight", 1.0),
            status=RuleStatus.ACTIVE,
            is_system=True,
        )
        session.add(rule)

        for cond_def in rule_def["conditions"]:
            cond = HealthRuleCondition(
                id=str(uuid.uuid4()),
                rule_id=rule_id,
                metric_type=cond_def["metric_type"],
                operator=cond_def["operator"],
                threshold_value=cond_def.get("threshold_value"),
                threshold_value_max=cond_def.get("threshold_value_max"),
                string_value=cond_def.get("string_value"),
                description=cond_def.get("description"),
                display_order=cond_def.get("display_order", 0),
            )
            session.add(cond)
        seeded += 1

    if seeded:
        logger.info(f"  [seed] {seeded} built-in health rules created")
