import csv
import io
import json
import uuid
import logging
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update

from app.db.base import get_db
from app.models.runtime import (
    RuntimeDataCenter,
    RuntimeAsset,
    DataSourceImport,
    ApplicationIntent,
    SourceProposal,
    RuntimeAuditLog
)
from app.services.confidence_service import engine as confidence_engine
from app.services.drift_service import (
    run_drift_detection,
    run_drift_detection_all,
    compute_alignment_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/runtime-location", tags=["runtime-location"])

# ─── Utility Parsers ─────────────────────────────────────────────────────────

def detect_source_type(file_name: str) -> str:
    f = file_name.lower()
    if "ibmma" in f or "qmgr" in f or ("mq" in f and "mongo" not in f):
        return "ibm_mq"
    if "mongodb" in f or "mongo_info" in f or "mongo" in f:
        return "mongodb"
    if "oem" in f or "oracle" in f or "db_role" in f:
        return "oracle_oem"
    if "scom" in f or "replica_status" in f or "replicastatus" in f:
        return "scom"
    if "mssql" in f or "sqlserver" in f or "sql_server" in f:
        return "mssql"
    if "kafka" in f:
        return "kafka"
    if "avi" in f or "loadbalancer" in f or "load_balancer" in f:
        return "avi_loadbalancer"
    if "ocp" in f or "pod_info" in f or "openshift" in f:
        return "ocp"
    if "batch" in f or "batch_processing" in f:
        return "batch"
    if "appdynamics" in f or "appdynamic" in f or "node_inventory" in f:
        return "appdynamics"
    return "cmdb"

def resolve_dc_from_mq_hostname(hostname: str) -> Dict[str, str]:
    h = hostname.lower()
    if h.startswith("mq4uprdga") or "prdga" in h:
        return {"name": "DC Georgia Production", "short_name": "GA-PRD"}
    if h.startswith("mq4uprdma") or "prdma" in h:
        return {"name": "DC Maryland Production", "short_name": "MA-PRD"}
    if h.startswith("mq4uatga") or "uatga" in h:
        return {"name": "DC Georgia UAT", "short_name": "GA-UAT"}
    if h.startswith("mq4uatma") or "uatma" in h:
        return {"name": "DC Maryland UAT", "short_name": "MA-UAT"}
    if "prd" in h or "prod" in h:
        return {"name": "DC Production", "short_name": "PRD"}
    if "uat" in h:
        return {"name": "DC UAT", "short_name": "UAT"}
    return {"name": "DC Unknown (Inferred)", "short_name": "UNK"}

def resolve_dc_from_mongo_hostname(hostname: str) -> Dict[str, str]:
    h = hostname.lower()
    if "az" in h:
        import re
        match = re.search(r"az(\d+)", h)
        if match:
            return {"name": f"Azure Zone {match.group(1)}", "short_name": f"AZ{match.group(1)}"}
    if "prod" in h or "prd" in h:
        return {"name": "DC Production", "short_name": "PRD"}
    if "uat" in h:
        return {"name": "DC UAT", "short_name": "UAT"}
    return {"name": "DC Cloud (Inferred)", "short_name": "CLD"}

def resolve_dc_from_oracle_hostname(hostname: str) -> Dict[str, str]:
    h = hostname.lower()
    if "ibb1" in h:
        return {"name": "DC Birmingham IBB1", "short_name": "IBB1"}
    if "shv" in h:
        return {"name": "DC Shoreview", "short_name": "SHV"}
    if "uat" in h:
        return {"name": "DC UAT", "short_name": "UAT"}
    if "prod" in h or "prd" in h:
        return {"name": "DC Production", "short_name": "PRD"}
    return {"name": "DC Unknown (Inferred)", "short_name": "UNK"}

def resolve_dc_from_mssql_hostname(hostname: str) -> Dict[str, str]:
    h = hostname.lower()
    if "ibb1" in h:
        return {"name": "DC Birmingham IBB1", "short_name": "IBB1"}
    if "shv" in h:
        return {"name": "DC Shoreview", "short_name": "SHV"}
    return {"name": "DC Cloud (Inferred)", "short_name": "CLD"}

def resolve_dc_from_kafka_hostname(hostname: str) -> Dict[str, str]:
    h = hostname.lower()
    if "ibb1" in h:
        return {"name": "DC Birmingham IBB1", "short_name": "IBB1"}
    if "shv" in h:
        return {"name": "DC Shoreview", "short_name": "SHV"}
    return {"name": "DC Cloud (Inferred)", "short_name": "CLD"}

def resolve_dc_from_avi_hostname(hostname: str) -> Dict[str, str]:
    h = hostname.lower()
    if "ibb1" in h:
        return {"name": "DC Birmingham IBB1", "short_name": "IBB1"}
    if "shv" in h:
        return {"name": "DC Shoreview", "short_name": "SHV"}
    return {"name": "DC Cloud (Inferred)", "short_name": "CLD"}

async def get_or_create_dc(db: AsyncSession, dc_info: Dict[str, str]) -> RuntimeDataCenter:
    short_name = dc_info["short_name"]
    result = await db.execute(select(RuntimeDataCenter).where(RuntimeDataCenter.short_name == short_name))
    dc = result.scalar_one_or_none()
    if not dc:
        dc = RuntimeDataCenter(
            id=str(uuid.uuid4()),
            name=dc_info["name"],
            short_name=short_name,
            asset_count=0
        )
        db.add(dc)
        await db.flush()
    return dc

# ─── Core Conflict Detection ───────────────────────────────────────────────

def detect_conflicts(assets: List[RuntimeAsset]) -> List[Dict[str, Any]]:
    conflicts = []
    # Group by normalized host name
    by_host = {}
    for a in assets:
        if not a.host:
            continue
        key = a.host.lower().strip()
        if key not in by_host:
            by_host[key] = []
        by_host[key].append(a)

    for key, group in by_host.items():
        if len(group) < 2:
            continue
        sources = list(set(a.data_source for a in group))
        if len(sources) < 2:
            continue

        roles = list(set(a.latest_replication_role for a in group if a.latest_replication_role))
        states = list(set(a.latest_operational_state for a in group if a.latest_operational_state))
        dcs = list(set(a.data_center_short for a in group if a.data_center_short))

        a = group[0]
        b = next((g for g in group if g.data_source != a.data_source), group[1])

        if len(roles) > 1:
            conflicts.append({
                "asset_name": a.name,
                "source_a": {"name": a.data_source, "says": a.latest_replication_role or "UNKNOWN"},
                "source_b": {"name": b.data_source, "says": b.latest_replication_role or "UNKNOWN"},
                "last_checked": datetime.utcnow().isoformat() + "Z"
            })
        elif len(states) > 1:
            conflicts.append({
                "asset_name": a.name,
                "source_a": {"name": a.data_source, "says": f"state={a.latest_operational_state}"},
                "source_b": {"name": b.data_source, "says": f"state={b.latest_operational_state}"},
                "last_checked": datetime.utcnow().isoformat() + "Z"
            })
        elif len(dcs) > 1:
            conflicts.append({
                "asset_name": a.name,
                "source_a": {"name": a.data_source, "says": f"dc={a.data_center_short}"},
                "source_b": {"name": b.data_source, "says": f"dc={b.data_center_short}"},
                "last_checked": datetime.utcnow().isoformat() + "Z"
            })

        # Internal MongoDB conflict check
        if a.metadata_json and a.metadata_json.get("internal_conflict"):
            conflict_parts = a.metadata_json["internal_conflict"].split("vs")
            conflicts.append({
                "asset_name": a.name,
                "source_a": {"name": "mongodb_text", "says": conflict_parts[0].replace("text=", "").strip()},
                "source_b": {"name": "mongodb_int", "says": conflict_parts[1].replace("int=", "").strip()},
                "last_checked": datetime.utcnow().isoformat() + "Z"
            })

    return conflicts

# ─── API Endpoints ───────────────────────────────────────────────────────────

@router.get("/applications", response_model=List[Dict[str, Any]])
async def get_applications(db: AsyncSession = Depends(get_db)):
    # Pull all assets
    result = await db.execute(select(RuntimeAsset))
    assets = result.scalars().all()

    # Query intents
    intent_res = await db.execute(select(ApplicationIntent))
    intents = {i.application_id: i for i in intent_res.scalars().all()}

    # Group by app_id (CMDB application_id or fallback by tech stack infra)
    app_groups = {}
    for a in assets:
        app_id = "INFRASTRUCTURE"
        app_name = "Infrastructure Services"
        if a.metadata_json and a.metadata_json.get("application_id"):
            app_id = a.metadata_json["application_id"]
            app_name = a.metadata_json.get("application_name", app_id)
        elif a.data_source == "ibm_mq":
            app_id = "MQ_INFRA"
            app_name = "IBM MQ Shared Tier"
        elif a.data_source == "mongodb":
            app_id = "MONGO_INFRA"
            app_name = "MongoDB DB Tier"
        elif a.data_source == "oracle_oem":
            app_id = "ORACLE_INFRA"
            app_name = "Oracle Core databases"

        key = (app_id, a.environment)
        if key not in app_groups:
            app_groups[key] = {
                "application_id": app_id,
                "application_name": app_name,
                "environment": a.environment,
                "data_centers": set(),
                "tech_stacks": set(),
                "overall_confidence": [],
                "_assets": [],
                "asset_count": 0,
                "stale_source_count": 0,
                "last_updated": a.last_seen_at
            }

        group = app_groups[key]
        if a.data_center_short:
            group["data_centers"].add(a.data_center_short)
        group["tech_stacks"].add(a.tech_stack)
        group["overall_confidence"].append(a.latest_confidence_level)
        group["_assets"].append(a)
        group["asset_count"] += 1
        if a.last_seen_at > group["last_updated"]:
            group["last_updated"] = a.last_seen_at

    # Load intents for alignment status
    intent_res = await db.execute(select(ApplicationIntent))
    intents_map = {i.application_id: i for i in intent_res.scalars().all()}

    summaries = []
    for key, data in app_groups.items():
        app_id = data["application_id"]
        group_assets = data.get("_assets", [])

        # Use confidence engine for deterministic scoring
        if group_assets:
            conf_result = confidence_engine.score_application(group_assets)
            conf_label = conf_result.level
            conf_score = conf_result.score
            # Map to legacy 1-4 numeric level
            level_map = {"HIGH": 4, "MEDIUM": 3, "LOW": 2, "CONFLICT": 2, "UNKNOWN": 1}
            conf_numeric = level_map.get(conf_label, 3)
        else:
            conf_numeric = int(min(data["overall_confidence"])) if data["overall_confidence"] else 3
            conf_label = {4: "HIGH", 3: "MEDIUM", 2: "LOW", 1: "UNKNOWN"}.get(conf_numeric, "MEDIUM")
            conf_score = {4: 90, 3: 65, 2: 45, 1: 0}.get(conf_numeric, 65)

        intent = intents_map.get(app_id)
        alignment_status = intent.alignment_status if intent else "UNKNOWN"

        summaries.append({
            "application_id": app_id,
            "application_name": data["application_name"],
            "environment": data["environment"],
            "data_centers": list(data["data_centers"]),
            "tech_stacks": list(data["tech_stacks"]),
            "overall_confidence": conf_numeric,
            "confidence_label": conf_label,
            "confidence_score": conf_score,
            "component_count": 1 if app_id.endswith("INFRA") else 3,
            "asset_count": data["asset_count"],
            "stale_source_count": 0,
            "alignment_status": alignment_status,
            "last_updated": data["last_updated"].isoformat() + "Z"
        })

    return summaries

@router.get("/applications/{app_id}", response_model=Dict[str, Any])
async def get_application_detail(app_id: str, environment: str = "PRODUCTION", db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuntimeAsset))
    assets = result.scalars().all()

    # Filter assets belonging to this app
    app_assets = []
    for a in assets:
        is_match = False
        if a.metadata_json and a.metadata_json.get("application_id") == app_id:
            is_match = True
        elif app_id == "MQ_INFRA" and a.data_source == "ibm_mq":
            is_match = True
        elif app_id == "MONGO_INFRA" and a.data_source == "mongodb":
            is_match = True
        elif app_id == "ORACLE_INFRA" and a.data_source == "oracle_oem":
            is_match = True
        elif app_id == "INFRASTRUCTURE" and not (a.metadata_json and a.metadata_json.get("application_id")):
            is_match = True
        
        if is_match and a.environment == environment:
            app_assets.append(a)

    if not app_assets:
        # Fallback to empty shell or raise 404
        return {
            "application_id": app_id,
            "application_name": app_id.replace("_", " ").title(),
            "environment": environment,
            "overall_confidence": 3,
            "components": [],
            "data_sources": [],
            "conflicts": []
        }

    # Group into components based on tech stack/asset type
    stack_groups = {}
    for a in app_assets:
        stack = a.tech_stack
        if stack not in stack_groups:
            stack_groups[stack] = []
        stack_groups[stack].append(a)

    components = []
    for stack, stack_assets in stack_groups.items():
        comp_type = "COMPUTE"
        if stack in ["oracle", "mongodb", "mssql"]:
            comp_type = "DATABASE"
        elif stack in ["ibm_mq", "kafka"]:
            comp_type = "MESSAGING"

        # Map to component model
        mapped_assets = []
        for sa in stack_assets:
            mapped_assets.append({
                "id": sa.id,
                "name": sa.name,
                "asset_type": sa.asset_type,
                "tech_stack": sa.tech_stack,
                "environment": sa.environment,
                "host": sa.host,
                "port": sa.port,
                "platform": sa.platform,
                "data_center": {
                    "id": f"dc-{sa.data_center_short.lower()}" if sa.data_center_short else "dc-unknown",
                    "name": sa.data_center_short or "Unknown DC",
                    "short_name": sa.data_center_short or "UNK",
                    "asset_count": 1
                },
                "latest_confidence_level": sa.latest_confidence_level,
                "latest_operational_state": sa.latest_operational_state,
                "latest_replication_role": sa.latest_replication_role,
                "write_authority": sa.write_authority,
                "last_seen_at": sa.last_seen_at.isoformat() + "Z",
                "is_deterministic": sa.is_deterministic,
                "data_source": sa.data_source,
                "metadata": sa.metadata_json
            })

        components.append({
            "id": f"comp-{app_id}-{stack}",
            "application_id": app_id,
            "application_name": app_assets[0].metadata_json.get("application_name", app_id) if app_assets[0].metadata_json else app_id,
            "component_name": f"{stack.replace('_', ' ').upper()} Layer",
            "component_type": comp_type,
            "tech_stack": stack,
            "assets": mapped_assets
        })

    conflicts = detect_conflicts(app_assets)

    # Calculate overall confidence using the engine
    conf_result = confidence_engine.score_application(app_assets)
    conf_label = conf_result.level
    conf_score = conf_result.score
    level_map = {"HIGH": 4, "MEDIUM": 3, "LOW": 2, "CONFLICT": 2, "UNKNOWN": 1}
    min_conf = level_map.get(conf_label, 3)

    # Built dynamic data sources info
    sources_set = list(set(a.data_source for a in app_assets))
    data_sources = []
    for s in sources_set:
        source_assets = [a for a in app_assets if a.data_source == s]
        fresh = True
        confs = [a.latest_confidence_level for a in source_assets]
        data_sources.append({
            "source_name": s,
            "display_name": s.replace("_", " ").title(),
            "record_count": len(source_assets),
            "confidence_level": min(confs) if confs else 3,
            "last_imported": max(a.last_seen_at for a in source_assets).isoformat() + "Z",
            "is_fresh": fresh
        })

    return {
        "application_id": app_id,
        "application_name": app_assets[0].metadata_json.get("application_name", app_id) if app_assets[0].metadata_json else app_id,
        "environment": environment,
        "overall_confidence": min_conf,
        "confidence_label": conf_label,
        "confidence_score": conf_score,
        "components": components,
        "data_sources": data_sources,
        "conflicts": conflicts
    }

@router.get("/datacenters", response_model=List[Dict[str, Any]])
async def get_datacenters(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuntimeDataCenter))
    dcs = result.scalars().all()
    
    # Refresh asset counts
    for dc in dcs:
        asset_res = await db.execute(select(RuntimeAsset).where(RuntimeAsset.data_center_short == dc.short_name))
        dc.asset_count = len(asset_res.scalars().all())
    
    return [
        {
            "id": dc.id,
            "name": dc.name,
            "short_name": dc.short_name,
            "region": dc.region,
            "zone": dc.zone,
            "asset_count": dc.asset_count
        } for dc in dcs
    ]

@router.get("/imports", response_model=List[Dict[str, Any]])
async def get_imports(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DataSourceImport).order_by(DataSourceImport.imported_at.desc()))
    imports = result.scalars().all()
    return [
        {
            "id": imp.id,
            "source_name": imp.source_name,
            "file_name": imp.file_name,
            "imported_at": imp.imported_at.isoformat() + "Z",
            "record_count": imp.record_count,
            "status": imp.status,
            "errors": imp.errors
        } for imp in imports
    ]

@router.post("/import", response_model=Dict[str, Any])
async def import_csv(
    file: UploadFile = File(...),
    source_type: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db)
):
    content_bytes = await file.read()
    content = content_bytes.decode("utf-8")
    
    source = source_type or detect_source_type(file.filename)
    errors = []
    assets_created = 0
    
    f = io.StringIO(content)
    reader = csv.DictReader(f)
    
    # Process rows based on source
    try:
        if source == "ibm_mq":
            for row in reader:
                hostname = row.get("hostname") or row.get("HOSTNAME")
                qmgr = row.get("qmgr") or row.get("QMGR") or hostname
                env = (row.get("env") or row.get("ENV") or "UAT").upper()
                platform = row.get("platform") or row.get("PLATFORM") or "UNIX"
                port = int(row.get("port") or row.get("PORT") or "1414")
                cluster = row.get("cluster") or ""
                exported_qmgr = row.get("exported_qmgr") or ""
                mq_namespace = row.get("mq_namespace") or ""

                if not hostname:
                    continue
                
                dc_info = resolve_dc_from_mq_hostname(hostname)
                dc = await get_or_create_dc(db, dc_info)
                
                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"
                conf = 4 if cluster else 3

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=qmgr,
                    asset_type="MQ_QMGR",
                    tech_stack="ibm_mq",
                    environment=asset_env,
                    host=hostname,
                    port=port,
                    platform=platform,
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="ACTIVE",
                    latest_replication_role="NONE",
                    write_authority=True,
                    is_deterministic=True,
                    data_source="ibm_mq",
                    metadata_json={
                        "cluster": cluster,
                        "exported_qmgr": exported_qmgr,
                        "mq_namespace": mq_namespace,
                        "cluster_role": "CLUSTER_MEMBER" if cluster else "STANDALONE"
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "mongodb":
            for row in reader:
                hostname = row.get("hostname") or row.get("HOSTNAME")
                replica_state = (row.get("replica_state_name") or row.get("REPLICA_STATE_NAME") or "SECONDARY").upper()
                rs_nm = row.get("rs_nm") or row.get("RS_NM") or ""
                env = (row.get("env") or row.get("ENV") or "UAT").upper()
                cluster = row.get("cluster") or row.get("CLUSTER") or ""
                role = (row.get("cl_role") or row.get("role") or row.get("ROLE") or "").lower()
                org_id = row.get("org_id") or ""
                group_id = row.get("group_id") or ""
                version = row.get("mongodb_version") or ""
                process_type = row.get("process_type") or ""
                val_int = int(row.get("Value") or row.get("value") or "0")

                if not hostname:
                    continue

                dc_info = resolve_dc_from_mongo_hostname(hostname)
                dc = await get_or_create_dc(db, dc_info)

                is_primary_text = replica_state == "PRIMARY"
                is_primary_int = val_int == 1
                is_mongos = role == "mongos" or process_type == "mongos"
                is_config = "config" in role or process_type == "config"

                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"
                agree = (is_primary_text == is_primary_int) or is_mongos or is_config
                conf = 3 if agree else 2
                has_conflict = not agree and replica_state != "NONE" and val_int != 0

                is_primary = is_primary_int if has_conflict else is_primary_text
                rep_role = "MONGOS" if is_mongos else "CONFIG_SVR" if is_config else "PRIMARY" if is_primary else "SECONDARY"

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=hostname,
                    asset_type="MONGO_NODE",
                    tech_stack="mongodb",
                    environment=asset_env,
                    host=hostname,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="ACTIVE" if (is_primary or is_mongos) else "STANDBY",
                    latest_replication_role=rep_role,
                    write_authority=is_primary,
                    is_deterministic=True,
                    data_source="mongodb",
                    metadata_json={
                        "rs_nm": rs_nm,
                        "cluster": cluster,
                        "org_id": org_id,
                        "group_id": group_id,
                        "mongodb_version": version,
                        "process_type": process_type,
                        "value_int": str(val_int),
                        "internal_conflict": f"text={replica_state} vs int={val_int}" if has_conflict else ""
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "oracle_oem":
            for row in reader:
                role_name = (row.get("role_name") or row.get("ROLE_NAME") or "").upper()
                target_name = row.get("target_name") or row.get("TARGET_NAME")
                env = (row.get("env") or row.get("ENV") or "uat").upper()

                if not target_name:
                    continue

                # Parse target
                host = target_name
                db_name = target_name
                if "@" in target_name:
                    db_name, host = target_name.split("@", 1)
                elif "_" in target_name:
                    parts = target_name.split("_")
                    host = parts[-1]
                    db_name = "_".join(parts[:-1])

                dc_info = resolve_dc_from_oracle_hostname(host)
                dc = await get_or_create_dc(db, dc_info)

                is_standby = "STANDBY" in role_name
                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=db_name,
                    asset_type="ORACLE_DB",
                    tech_stack="oracle",
                    environment=asset_env,
                    host=host,
                    platform="UNIX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=3,
                    latest_operational_state="STANDBY" if is_standby else "ACTIVE",
                    latest_replication_role="PHYSICAL_STANDBY" if is_standby else "PRIMARY",
                    write_authority=not is_standby,
                    is_deterministic=True,
                    data_source="oracle_oem",
                    metadata_json={"role_name": role_name, "target_name": target_name}
                )
                db.add(asset)
                assets_created += 1

        elif source == "mssql":
            for row in reader:
                hostname = row.get("hostname") or row.get("HOSTNAME")
                ag_name = row.get("ag_name") or row.get("AG_NAME") or "MSSQL-AG"
                replica_role = (row.get("replica_role") or row.get("REPLICA_ROLE") or "PRIMARY").upper()
                sync_state = (row.get("sync_state") or row.get("SYNC_STATE") or "SYNCHRONIZED").upper()
                db_name = row.get("db_name") or row.get("DB_NAME") or "PatientCareDB"
                env = (row.get("env") or row.get("ENV") or "UAT").upper()

                if not hostname:
                    continue

                dc_info = resolve_dc_from_mssql_hostname(hostname)
                dc = await get_or_create_dc(db, dc_info)

                is_primary = replica_role == "PRIMARY"
                is_sync = sync_state == "SYNCHRONIZED"
                conf = 4 if is_sync else 3
                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=db_name,
                    asset_type="DATABASE_INSTANCE",
                    tech_stack="mssql",
                    environment=asset_env,
                    host=hostname,
                    platform="WINDOWS",
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="STANDBY" if not is_primary else "ACTIVE",
                    latest_replication_role=replica_role,
                    write_authority=is_primary,
                    is_deterministic=True,
                    data_source="mssql",
                    metadata_json={
                        "ag_name": ag_name,
                        "sync_state": sync_state,
                        "replica_role": replica_role
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "kafka":
            for row in reader:
                hostname = row.get("hostname") or row.get("HOSTNAME")
                broker_id = row.get("broker_id") or row.get("BROKER_ID") or "1"
                is_controller_str = str(row.get("is_controller") or row.get("IS_CONTROLLER") or "false").lower()
                urp_str = str(row.get("under_replicated_partitions") or row.get("URP") or "0")
                env = (row.get("env") or row.get("ENV") or "UAT").upper()

                if not hostname:
                    continue

                dc_info = resolve_dc_from_kafka_hostname(hostname)
                dc = await get_or_create_dc(db, dc_info)

                is_controller = is_controller_str in ["true", "1", "yes"]
                urp = int(urp_str) if urp_str.isdigit() else 0
                conf = 4 if urp == 0 else 2
                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=f"kafka-broker-{broker_id}",
                    asset_type="MESSAGING_NODE",
                    tech_stack="kafka",
                    environment=asset_env,
                    host=hostname,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="DEGRADED" if urp > 0 else "ACTIVE",
                    latest_replication_role="CONTROLLER" if is_controller else "BROKER",
                    write_authority=True,
                    is_deterministic=True,
                    data_source="kafka",
                    metadata_json={
                        "broker_id": broker_id,
                        "is_controller": is_controller,
                        "under_replicated_partitions": urp
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "avi_loadbalancer":
            for row in reader:
                hostname = row.get("hostname") or row.get("VIP_NAME") or "avi-vip"
                vip_ip = row.get("vip_ip") or row.get("VIP_IP") or "10.0.0.1"
                active_pool = row.get("active_pool") or row.get("ACTIVE_POOL") or "default-pool"
                active_dc = row.get("active_dc") or row.get("ACTIVE_DC") or "IBB1"
                health_score_str = str(row.get("health_score") or row.get("HEALTH_SCORE") or "100")
                env = (row.get("env") or row.get("ENV") or "UAT").upper()

                if not hostname:
                    continue

                dc_info = resolve_dc_from_avi_hostname(hostname)
                dc = await get_or_create_dc(db, dc_info)

                health_score = int(health_score_str) if health_score_str.isdigit() else 100
                conf = 4 if health_score >= 90 else 3
                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=hostname,
                    asset_type="LOAD_BALANCER",
                    tech_stack="avi",
                    environment=asset_env,
                    host=hostname,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="DEGRADED" if health_score < 75 else "ACTIVE",
                    latest_replication_role="ACTIVE" if active_dc.upper() == dc.short_name.upper() else "STANDBY",
                    write_authority=True,
                    is_deterministic=True,
                    data_source="avi_loadbalancer",
                    metadata_json={
                        "vip_ip": vip_ip,
                        "active_pool": active_pool,
                        "active_dc": active_dc,
                        "health_score": health_score
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "scom":
            # SCOM ReplicaStatus: columns ReplicaName, Role, HealthState
            for row in reader:
                replica_name = row.get("ReplicaName") or row.get("replica_name") or ""
                role = (row.get("Role") or row.get("role") or "Secondary").strip()
                health_state = (row.get("HealthState") or row.get("health_state") or "Success").strip()

                if not replica_name:
                    continue

                # Parse host from replica name: "WMTOG_PROD\SQLINSTANCE" → hostname
                host = replica_name.split("\\")[0] if "\\" in replica_name else replica_name

                dc_info = resolve_dc_from_mssql_hostname(host)
                dc = await get_or_create_dc(db, dc_info)

                is_primary = role.lower() in ["primary", "standalone"]
                is_healthy = health_state.lower() in ["success", "healthy", "ok"]
                conf = 4 if (is_primary and is_healthy) else 3 if is_healthy else 2

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=replica_name,
                    asset_type="DATABASE_INSTANCE",
                    tech_stack="mssql",
                    environment="PRODUCTION",
                    host=host,
                    platform="WINDOWS",
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="ACTIVE" if is_primary else "STANDBY",
                    latest_replication_role="PRIMARY" if is_primary else "SECONDARY",
                    write_authority=is_primary,
                    is_deterministic=True,
                    data_source="scom",
                    metadata_json={
                        "replica_name": replica_name,
                        "role": role,
                        "health_state": health_state,
                        "scom_role": role
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "ocp":
            # OCP pod info: columns cluster, env, lob, namespace, neighborhood, pod
            for row in reader:
                pod = row.get("pod") or row.get("POD") or row.get("pod_name") or ""
                namespace = row.get("namespace") or row.get("NAMESPACE") or ""
                cluster = row.get("cluster") or row.get("CLUSTER") or ""
                env_raw = (row.get("env") or row.get("ENV") or "prod").lower()
                lob = row.get("lob") or row.get("LOB") or ""
                neighborhood = row.get("neighborhood") or row.get("NEIGHBORHOOD") or ""

                if not pod and not cluster:
                    continue

                # Derive DC from cluster name: "dcglnh01ocp" → DCGL, or from neighborhood
                dc_short = "UNK"
                dc_name = "Unknown DC"
                if cluster:
                    # e.g. dcglnh01ocp → extract site prefix
                    prefix = cluster[:4].upper()
                    dc_short = prefix
                    dc_name = f"DC {prefix}"
                elif neighborhood:
                    dc_short = neighborhood[:6].upper()
                    dc_name = f"DC {neighborhood}"

                dc_info = {"name": dc_name, "short_name": dc_short}
                dc = await get_or_create_dc(db, dc_info)

                asset_env = "PRODUCTION" if env_raw in ["prod", "production"] else "DR" if env_raw == "dr" else "UAT"

                name = pod or f"{namespace}-pod"
                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=name,
                    asset_type="OCP_POD",
                    tech_stack="ocp",
                    environment=asset_env,
                    host=cluster or name,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=4,
                    latest_operational_state="ACTIVE",
                    latest_replication_role="NONE",
                    write_authority=False,
                    is_deterministic=True,
                    data_source="ocp",
                    metadata_json={
                        "namespace": namespace,
                        "cluster": cluster,
                        "lob": lob,
                        "neighborhood": neighborhood
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "appdynamics":
            # AppDynamics node inventory: app_id, node_name, app_full_name, machine_name, tier_name
            for row in reader:
                machine_name = row.get("machine_name") or row.get("MACHINE_NAME") or ""
                app_full_name = row.get("app_full_name") or row.get("APP_FULL_NAME") or ""
                app_id_val = row.get("app_id") or row.get("APP_ID") or ""
                node_name = row.get("node_name") or row.get("NODE_NAME") or ""
                tier_name = row.get("tier_name") or row.get("TIER_NAME") or ""

                if not machine_name and not node_name:
                    continue

                host = machine_name or node_name
                # Infer env from machine name: PROD-AZ → PRODUCTION, PROD-OCP → PRODUCTION
                env_upper = host.upper()
                asset_env = "PRODUCTION" if ("PROD" in env_upper) else "UAT"

                # Infer DC from machine name patterns
                dc_info = resolve_dc_from_oracle_hostname(host)
                dc = await get_or_create_dc(db, dc_info)

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=node_name or machine_name,
                    asset_type="SERVER",
                    tech_stack="vm",
                    environment=asset_env,
                    host=machine_name,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=3,
                    latest_operational_state="ACTIVE",
                    latest_replication_role="NONE",
                    write_authority=False,
                    is_deterministic=False,
                    data_source="appdynamics",
                    metadata_json={
                        "app_id": app_id_val,
                        "app_full_name": app_full_name,
                        "tier_name": tier_name,
                        "node_name": node_name
                    }
                )
                db.add(asset)
                assets_created += 1

        elif source == "batch":
            # Batch processing: Instance, JOB_NAME, JOB_TYPE, AS_GROUP, AS_APPLICATION, MACH_NAME, STATUS
            for row in reader:
                mach_name = row.get("MACH_NAME") or row.get("mach_name") or row.get("RUN_MACHINE") or ""
                job_name = row.get("JOB_NAME") or row.get("job_name") or ""
                instance = row.get("Instance") or row.get("INSTANCE") or ""
                as_application = row.get("AS_APPLICATION") or row.get("as_application") or ""
                job_status = (row.get("JOB_STATUS") or "").upper()

                if not mach_name:
                    continue

                dc_info = resolve_dc_from_oracle_hostname(mach_name)
                dc = await get_or_create_dc(db, dc_info)

                is_healthy = job_status in ["SUCCESS", "RUNNING", "ACTIVE"]
                conf = 4 if is_healthy else 2

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=mach_name,
                    asset_type="SERVER",
                    tech_stack="vm",
                    environment="PRODUCTION",
                    host=mach_name,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=conf,
                    latest_operational_state="ACTIVE" if is_healthy else "UNKNOWN",
                    latest_replication_role="NONE",
                    write_authority=False,
                    is_deterministic=False,
                    data_source="batch",
                    metadata_json={
                        "job_name": job_name,
                        "instance": instance,
                        "as_application": as_application,
                        "job_status": job_status
                    }
                )
                db.add(asset)
                assets_created += 1

        else:  # CMDB / fallback
            for row in reader:
                app_name = row.get("APPLICATION_NAME") or row.get("application_name") or ""
                app_id = row.get("APPLICATION_ID") or row.get("application_id") or app_name.split(" ")[0].upper()
                env = (row.get("ENVIRONMENT") or row.get("environment") or "UAT").upper()
                device_name = row.get("DEVICE_NAME") or row.get("device_name")
                device_type = row.get("DEVICE_TYPE") or row.get("device_type") or "SERVER"
                dc_name = row.get("DATA_CENTER") or row.get("data_center") or "Unknown DC"

                lvl1_name = row.get("DEVICE_LVL1_NAME") or ""
                lvl1_type = row.get("DEVICE_LVL1_TYPE") or ""
                lvl2_name = row.get("DEVICE_LVL2_NAME") or ""
                lvl2_type = row.get("DEVICE_LVL2_TYPE") or ""
                lvl3_name = row.get("DEVICE_LVL3_NAME") or ""
                lvl3_type = row.get("DEVICE_LVL3_TYPE") or ""
                lvl4_name = row.get("DEVICE_LVL4_NAME") or ""
                lvl4_type = row.get("DEVICE_LVL4_TYPE") or ""

                if not device_name or not app_name:
                    continue

                # Classify tech stack
                t = device_type.upper()
                stack = "vm"
                if "MQ" in t or "QUEUE" in t:
                    stack = "ibm_mq"
                elif "MONGO" in t:
                    stack = "mongodb"
                elif "ORACLE" in t or "ORA" in t:
                    stack = "oracle"
                elif "SQL" in t:
                    stack = "mssql"
                elif "KAFKA" in t:
                    stack = "kafka"
                elif "OCP" in t or "POD" in t or "KUBE" in t:
                    stack = "ocp"

                # Classify asset type
                asset_type = "SERVER"
                if "MQ" in t:
                    asset_type = "MQ_QMGR"
                elif "MONGO" in t:
                    asset_type = "MONGO_NODE"
                elif "ORACLE" in t:
                    asset_type = "ORACLE_DB"
                elif "OCP" in t or "POD" in t:
                    asset_type = "OCP_POD"

                dc_short = dc_name.replace("DC ", "").replace(" ", "-").upper()[:8] or "UNK"
                dc = await get_or_create_dc(db, {"name": dc_name, "short_name": dc_short})

                asset_env = "PRODUCTION" if env in ["PRODUCTION", "PROD"] else "DR" if env == "DR" else "UAT"

                asset = RuntimeAsset(
                    id=str(uuid.uuid4()),
                    name=device_name,
                    asset_type=asset_type,
                    tech_stack=stack,
                    environment=asset_env,
                    host=device_name,
                    platform="LINUX",
                    data_center_short=dc.short_name,
                    latest_confidence_level=4,
                    latest_operational_state="ACTIVE",
                    latest_replication_role="NONE",
                    write_authority=False,
                    is_deterministic=True,
                    data_source="cmdb",
                    metadata_json={
                        "application_id": app_id,
                        "application_name": app_name,
                        "device_type": device_type,
                        "lvl1": f"{lvl1_name}({lvl1_type})" if lvl1_name else "",
                        "lvl2": f"{lvl2_name}({lvl2_type})" if lvl2_name else "",
                        "lvl3": f"{lvl3_name}({lvl3_type})" if lvl3_name else "",
                        "lvl4": f"{lvl4_name}({lvl4_type})" if lvl4_name else "",
                        "device_chain": " → ".join(filter(None, [lvl1_name, lvl2_name, lvl3_name, lvl4_name]))
                    }
                )
                db.add(asset)
                assets_created += 1

    except Exception as e:
        logger.error(f"Error parsing CSV upload: {e}")
        errors.append(str(e))

    status = "FAILED" if errors else "SUCCESS"
    
    # Save import history log
    imp = DataSourceImport(
        id=str(uuid.uuid4()),
        source_name=source,
        file_name=file.filename,
        record_count=assets_created,
        status=status,
        errors=errors
    )
    db.add(imp)
    
    # Save Audit log entry
    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="IMPORT",
        description=f"Imported {assets_created} records from {file.filename} ({source})" if not errors else f"Failed import of {file.filename}: {errors[0]}",
        source=source
    )
    db.add(audit)
    
    await db.commit()
    
    return {
        "id": imp.id,
        "source_name": source,
        "file_name": file.filename,
        "imported_at": imp.imported_at.isoformat() + "Z",
        "record_count": assets_created,
        "status": status,
        "errors": errors
    }

@router.post("/seed", response_model=Dict[str, Any])
async def seed_data(db: AsyncSession = Depends(get_db)):
    # Clean first
    await db.execute(delete(RuntimeAsset))
    await db.execute(delete(RuntimeDataCenter))
    await db.execute(delete(DataSourceImport))
    await db.execute(delete(RuntimeAuditLog))
    await db.execute(delete(SourceProposal))
    await db.execute(delete(ApplicationIntent))

    # Add default data centers
    dcs = [
        {"name": "DC Birmingham IBB1", "short_name": "IBB1", "region": "UK-Midlands", "zone": "AZ1"},
        {"name": "DC Shoreview", "short_name": "SHV", "region": "US-Midwest", "zone": "AZ2"},
        {"name": "DC Georgia Production", "short_name": "GA-PRD", "region": "US-East", "zone": "AZ1"},
        {"name": "DC Maryland Production", "short_name": "MA-PRD", "region": "US-East", "zone": "AZ2"}
    ]
    for d in dcs:
        dc = RuntimeDataCenter(
            id=str(uuid.uuid4()),
            name=d["name"],
            short_name=d["short_name"],
            region=d["region"],
            zone=d["zone"],
            asset_count=0
        )
        db.add(dc)
    
    await db.flush()

    # Add mock assets (representing high-fidelity hackathon scenario)
    # PCA: Primary in IBB1, standby in SHV (Oracle and MongoDB)
    assets_data = [
        # PCA App Assets
        {"name": "pcadb_prod@ibb1", "asset_type": "ORACLE_DB", "tech_stack": "oracle", "env": "PRODUCTION", "host": "ibb1-ora-01.healthmesh.ai", "port": 1521, "dc": "IBB1", "conf": 4, "state": "ACTIVE", "role": "PRIMARY", "write": True, "source": "oracle_oem", "app_id": "PCA", "app_name": "Patient Care Portal (PCA)"},
        {"name": "pcadb_prod@shv", "asset_type": "ORACLE_DB", "tech_stack": "oracle", "env": "PRODUCTION", "host": "shv-ora-01.healthmesh.ai", "port": 1521, "dc": "SHV", "conf": 4, "state": "STANDBY", "role": "PHYSICAL_STANDBY", "write": False, "source": "oracle_oem", "app_id": "PCA", "app_name": "Patient Care Portal (PCA)"},
        
        {"name": "pca-mongo-primary", "asset_type": "MONGO_NODE", "tech_stack": "mongodb", "env": "PRODUCTION", "host": "ibb1-mongo-01.healthmesh.ai", "port": 27017, "dc": "IBB1", "conf": 4, "state": "ACTIVE", "role": "PRIMARY", "write": True, "source": "mongodb", "app_id": "PCA", "app_name": "Patient Care Portal (PCA)"},
        {"name": "pca-mongo-secondary", "asset_type": "MONGO_NODE", "tech_stack": "mongodb", "env": "PRODUCTION", "host": "shv-mongo-01.healthmesh.ai", "port": 27017, "dc": "SHV", "conf": 3, "state": "STANDBY", "role": "SECONDARY", "write": False, "source": "mongodb", "app_id": "PCA", "app_name": "Patient Care Portal (PCA)", "internal_conflict": "text=PRIMARY vs int=2"}, # Intentionally seeded internal mismatch
        
        {"name": "MQ4UPRDGA01", "asset_type": "MQ_QMGR", "tech_stack": "ibm_mq", "env": "PRODUCTION", "host": "mq4uprdga01.healthmesh.ai", "port": 1414, "dc": "GA-PRD", "conf": 4, "state": "ACTIVE", "role": "NONE", "write": True, "source": "ibm_mq", "app_id": "BILLING", "app_name": "Billing Operations (BILLING)"},
        {"name": "MQ4UPRDMA01", "asset_type": "MQ_QMGR", "tech_stack": "ibm_mq", "env": "PRODUCTION", "host": "mq4uprdma01.healthmesh.ai", "port": 1414, "dc": "MA-PRD", "conf": 4, "state": "STANDBY", "role": "NONE", "write": False, "source": "ibm_mq", "app_id": "BILLING", "app_name": "Billing Operations (BILLING)"},

        {"name": "claims-pod-01", "asset_type": "OCP_POD", "tech_stack": "ocp", "env": "PRODUCTION", "host": "ibb1-ocp-node-a.healthmesh.ai", "port": None, "dc": "IBB1", "conf": 4, "state": "ACTIVE", "role": "NONE", "write": False, "source": "cmdb", "app_id": "CLAIMS", "app_name": "Claims Processing (CLAIMS)"},

        # New high-fidelity technical stacks seeded to showcase specific parser classifiers
        {"name": "billing-mssql-primary", "asset_type": "DATABASE_INSTANCE", "tech_stack": "mssql", "env": "PRODUCTION", "host": "ibb1-sql-01.healthmesh.ai", "port": 1433, "dc": "IBB1", "conf": 4, "state": "ACTIVE", "role": "PRIMARY", "write": True, "source": "mssql", "app_id": "BILLING", "app_name": "Billing Operations (BILLING)"},
        {"name": "billing-mssql-standby", "asset_type": "DATABASE_INSTANCE", "tech_stack": "mssql", "env": "PRODUCTION", "host": "shv-sql-01.healthmesh.ai", "port": 1433, "dc": "SHV", "conf": 4, "state": "STANDBY", "role": "SECONDARY", "write": False, "source": "mssql", "app_id": "BILLING", "app_name": "Billing Operations (BILLING)"},

        {"name": "kafka-broker-1", "asset_type": "MESSAGING_NODE", "tech_stack": "kafka", "env": "PRODUCTION", "host": "ibb1-kafka-01.healthmesh.ai", "port": 9092, "dc": "IBB1", "conf": 4, "state": "ACTIVE", "role": "CONTROLLER", "write": True, "source": "kafka", "app_id": "CLAIMS", "app_name": "Claims Processing (CLAIMS)"},
        {"name": "kafka-broker-2", "asset_type": "MESSAGING_NODE", "tech_stack": "kafka", "env": "PRODUCTION", "host": "shv-kafka-01.healthmesh.ai", "port": 9092, "dc": "SHV", "conf": 4, "state": "ACTIVE", "role": "BROKER", "write": True, "source": "kafka", "app_id": "CLAIMS", "app_name": "Claims Processing (CLAIMS)"},

        {"name": "avi-loadbalancer-vip", "asset_type": "LOAD_BALANCER", "tech_stack": "avi", "env": "PRODUCTION", "host": "ibb1-avi-vip.healthmesh.ai", "port": 443, "dc": "IBB1", "conf": 4, "state": "ACTIVE", "role": "ACTIVE", "write": True, "source": "avi_loadbalancer", "app_id": "PCA", "app_name": "Patient Care Portal (PCA)"}
    ]

    for a in assets_data:
        asset = RuntimeAsset(
            id=str(uuid.uuid4()),
            name=a["name"],
            asset_type=a["asset_type"],
            tech_stack=a["tech_stack"],
            environment=a["env"],
            host=a["host"],
            port=a["port"],
            platform="LINUX",
            data_center_short=a["dc"],
            latest_confidence_level=a["conf"],
            latest_operational_state=a["state"],
            latest_replication_role=a["role"],
            write_authority=a["write"],
            is_deterministic=True,
            data_source=a["source"],
            metadata_json={
                "application_id": a["app_id"],
                "application_name": a["app_name"],
                "internal_conflict": a.get("internal_conflict", "")
            }
        )
        db.add(asset)

    # Seed mock history
    histories = [
        {"source": "cmdb", "file": "business_application_topology.csv", "records": 48},
        {"source": "ibm_mq", "file": "ibmma_qmgr_sever_status.csv", "records": 12},
        {"source": "mongodb", "file": "mongodb_info.csv", "records": 8},
        {"source": "oracle_oem", "file": "oem_db_role.csv", "records": 16}
    ]
    for h in histories:
        imp = DataSourceImport(
            id=str(uuid.uuid4()),
            source_name=h["source"],
            file_name=h["file"],
            record_count=h["records"],
            status="SUCCESS",
            errors=[]
        )
        db.add(imp)

    # Seed mock proposals
    proposals = [
        {
            "name": "IBM MQ cluster column",
            "system": "Prometheus / IBM MQ Exporter",
            "signal": "Topology — cluster membership",
            "stack": "ibm_mq",
            "rationale": "The cluster field in Prometheus MQ metrics identifies multi-DC cluster membership. Previously undocumented. Confidence 4 for cluster topology when set.",
            "det": True,
            "by": "Team HealthMesh",
            "status": "ACCEPTED"
        },
        {
            "name": "MongoDB Value integer field",
            "system": "Prometheus / MongoDB Exporter (Ops Manager)",
            "signal": "Replication state — integer authoritative flag",
            "stack": "mongodb",
            "rationale": "The Value column (1=primary, 2=secondary) is a deterministic integer replication state. Cross-validating against replica_state_name text enables internal conflict detection.",
            "det": True,
            "by": "Team HealthMesh",
            "status": "ACCEPTED"
        },
        {
            "name": "Oracle CMDB DEVICE_LVL hierarchy",
            "system": "CMDB — ServiceNow",
            "signal": "Topology — Oracle catalog/instance/server chain",
            "stack": "oracle",
            "rationale": "DEVICE_LVL1-4 columns in CMDB encode the full Oracle device chain (catalog → instance → Linux server). Combined with OEM role data, enables HA topology inference at confidence 4.",
            "det": True,
            "by": "Team HealthMesh",
            "status": "PENDING"
        }
    ]

    for p in proposals:
        prop = SourceProposal(
            id=str(uuid.uuid4()),
            source_name=p["name"],
            system=p["system"],
            signal_type=p["signal"],
            tech_stack=p["stack"],
            rationale=p["rationale"],
            is_deterministic_claim=p["det"],
            proposed_by=p["by"],
            status=p["status"]
        )
        db.add(prop)

    # Seed an default intent for PCA
    intent = ApplicationIntent(
        application_id="PCA",
        application_name="Patient Care Portal (PCA)",
        intended_active_dcs=["IBB1", "SHV"],
        intended_primary_dc="IBB1",
        intended_environments=["PRODUCTION"],
        failover_type="MANUAL",
        replication_model="READ_REPLICA",
        required_tech_stacks=["oracle", "mongodb"]
    )
    db.add(intent)

    # Audit Entry
    aud = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="SEED_LOADED",
        description="Sample database seed loaded: 3 applications across 4 data centers"
    )
    db.add(aud)

    await db.commit()

    return {"status": "SUCCESS", "message": "Database successfully seeded with Mock Hackathon records."}

@router.post("/reset", response_model=Dict[str, Any])
async def reset_data(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(RuntimeAsset))
    await db.execute(delete(RuntimeDataCenter))
    await db.execute(delete(DataSourceImport))
    await db.execute(delete(RuntimeAuditLog))
    await db.execute(delete(SourceProposal))
    await db.execute(delete(ApplicationIntent))
    
    # Audit log
    aud = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="SYSTEM_RESET",
        description="Operator initiated a system reset: all database records cleared."
    )
    db.add(aud)
    await db.commit()
    
    return {"status": "SUCCESS", "message": "All runtime tables reset successfully."}

@router.get("/audit-logs", response_model=List[Dict[str, Any]])
async def get_audit_logs(application_id: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    query = select(RuntimeAuditLog)
    if application_id:
        query = query.where(RuntimeAuditLog.application_id == application_id)
    
    query = query.order_by(RuntimeAuditLog.occurred_at.desc())
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        {
            "id": log.id,
            "event_type": log.event_type,
            "description": log.description,
            "actor": log.actor,
            "source": log.source,
            "application_id": log.application_id,
            "occurred_at": log.occurred_at.isoformat() + "Z"
        } for log in logs
    ]

# ─── Intents management ──────────────────────────────────────────────────────

@router.get("/intents", response_model=List[Dict[str, Any]])
async def get_intents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ApplicationIntent))
    intents = result.scalars().all()
    return [
        {
            "application_id": i.application_id,
            "application_name": i.application_name,
            "intended_active_dcs": i.intended_active_dcs,
            "intended_primary_dc": i.intended_primary_dc,
            "intended_environments": i.intended_environments,
            "failover_type": i.failover_type,
            "replication_model": i.replication_model,
            "required_tech_stacks": i.required_tech_stacks,
            "created_at": i.created_at.isoformat() + "Z",
            "updated_at": i.updated_at.isoformat() + "Z"
        } for i in intents
    ]

@router.post("/intents", response_model=Dict[str, Any])
async def save_intent(intent_data: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    app_id = intent_data["application_id"]
    result = await db.execute(select(ApplicationIntent).where(ApplicationIntent.application_id == app_id))
    existing = result.scalar_one_or_none()

    if existing:
        existing.intended_active_dcs = intent_data["intended_active_dcs"]
        existing.intended_primary_dc = intent_data["intended_primary_dc"]
        existing.intended_environments = intent_data.get("intended_environments", ["PRODUCTION"])
        existing.failover_type = intent_data.get("failover_type", "AUTOMATIC")
        existing.replication_model = intent_data["replication_model"]
        existing.required_tech_stacks = intent_data["required_tech_stacks"]
        existing.updated_at = datetime.utcnow()
        action = "INTENT_UPDATED"
        desc = f"Intent updated for {existing.application_name}"
    else:
        existing = ApplicationIntent(
            application_id=app_id,
            application_name=intent_data["application_name"],
            intended_active_dcs=intent_data["intended_active_dcs"],
            intended_primary_dc=intent_data["intended_primary_dc"],
            intended_environments=intent_data.get("intended_environments", ["PRODUCTION"]),
            failover_type=intent_data.get("failover_type", "AUTOMATIC"),
            replication_model=intent_data["replication_model"],
            required_tech_stacks=intent_data["required_tech_stacks"]
        )
        db.add(existing)
        action = "INTENT_CREATED"
        desc = f"Intent created for {existing.application_name}"

    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type=action,
        description=desc,
        application_id=app_id
    )
    db.add(audit)
    
    await db.commit()
    
    return {"status": "SUCCESS", "message": "Design intent saved successfully."}

@router.delete("/intents/{app_id}", response_model=Dict[str, Any])
async def delete_intent(app_id: str, db: AsyncSession = Depends(get_db)):
    await db.execute(delete(ApplicationIntent).where(ApplicationIntent.application_id == app_id))
    
    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="INTENT_DELETED",
        description=f"Intent deleted for {app_id}",
        application_id=app_id
    )
    db.add(audit)
    
    await db.commit()
    
    return {"status": "SUCCESS", "message": f"Design intent deleted for {app_id}."}

# ─── Collaborative Proposals management ──────────────────────────────────────

@router.get("/proposals", response_model=List[Dict[str, Any]])
async def get_proposals(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SourceProposal).order_by(SourceProposal.proposed_at.desc()))
    props = result.scalars().all()
    return [
        {
            "id": p.id,
            "source_name": p.source_name,
            "system": p.system,
            "signal_type": p.signal_type,
            "tech_stack": p.tech_stack,
            "rationale": p.rationale,
            "is_deterministic_claim": p.is_deterministic_claim,
            "proposed_by": p.proposed_by,
            "proposed_at": p.proposed_at.isoformat() + "Z",
            "status": p.status
        } for p in props
    ]

@router.post("/proposals", response_model=Dict[str, Any])
async def submit_proposal(p_data: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    prop = SourceProposal(
        id=str(uuid.uuid4()),
        source_name=p_data["source_name"],
        system=p_data["system"],
        signal_type=p_data["signal_type"],
        tech_stack=p_data["tech_stack"],
        rationale=p_data["rationale"],
        is_deterministic_claim=p_data.get("is_deterministic_claim", True),
        proposed_by=p_data.get("proposed_by", "operator")
    )
    db.add(prop)

    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="PROPOSAL_SUBMITTED",
        description=f"Data source proposal submitted: {prop.source_name} ({prop.tech_stack})"
    )
    db.add(audit)
    
    await db.commit()
    
    return {"status": "SUCCESS", "id": prop.id}

@router.put("/proposals/{id}", response_model=Dict[str, Any])
async def update_proposal_status(id: str, status_data: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    status = status_data["status"]
    await db.execute(update(SourceProposal).where(SourceProposal.id == id).values(status=status))
    
    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="PROPOSAL_UPDATED",
        description=f"Data source proposal status updated to {status} for ID {id}."
    )
    db.add(audit)
    
    await db.commit()
    
    return {"status": "SUCCESS"}

@router.get("/drift/{app_id}", response_model=List[Dict[str, Any]])
async def get_drift_for_app(
    app_id: str,
    environment: str = Query("PRODUCTION"),
    db: AsyncSession = Depends(get_db),
):
    """Run drift detection for a single application and return drift items."""
    drifts = await run_drift_detection(db, app_id, environment, persist_critical=True)
    # Update alignment_status on the intent
    alignment = compute_alignment_status(drifts)
    await db.execute(
        update(ApplicationIntent)
        .where(ApplicationIntent.application_id == app_id)
        .values(alignment_status=alignment)
    )
    await db.commit()
    return drifts


@router.get("/drift", response_model=Dict[str, Any])
async def get_drift_all(
    environment: str = Query("PRODUCTION"),
    db: AsyncSession = Depends(get_db),
):
    """Run drift detection for all applications that have an intent and return all drifts."""
    all_drifts = await run_drift_detection_all(db, environment)
    # Update alignment_status for each app
    for app_id, drifts in all_drifts.items():
        alignment = compute_alignment_status(drifts)
        await db.execute(
            update(ApplicationIntent)
            .where(ApplicationIntent.application_id == app_id)
            .values(alignment_status=alignment)
        )
    # For apps with no drifts, mark as ALIGNED if intent exists
    intent_res = await db.execute(select(ApplicationIntent))
    intents = intent_res.scalars().all()
    for intent in intents:
        if intent.application_id not in all_drifts:
            await db.execute(
                update(ApplicationIntent)
                .where(ApplicationIntent.application_id == intent.application_id)
                .values(alignment_status="ALIGNED")
            )
    await db.commit()
    total = sum(len(v) for v in all_drifts.values())
    return {"drifts": all_drifts, "total_drift_count": total}


@router.post("/conflicts/resolve", response_model=Dict[str, Any])
async def resolve_conflict(data: Dict[str, Any], db: AsyncSession = Depends(get_db)):
    asset_name = data.get("asset_name")
    authoritative_source = data.get("authoritative_source")
    
    if not asset_name or not authoritative_source:
        raise HTTPException(status_code=400, detail="Missing asset_name or authoritative_source")

    # Fetch all assets with this name or host matching this asset name
    result = await db.execute(
        select(RuntimeAsset).where(
            (RuntimeAsset.name == asset_name) | (RuntimeAsset.host == asset_name)
        )
    )
    group = result.scalars().all()
    
    if not group:
        raise HTTPException(status_code=404, detail="Asset not found")

    # Find the authoritative asset
    auth_asset = next((a for a in group if a.data_source == authoritative_source), None)
    if not auth_asset:
        # Fallback to the first asset if exact source match is not found
        auth_asset = group[0]

    # Align all other assets in the group to match the authoritative one
    for asset in group:
        if asset.id != auth_asset.id:
            asset.latest_replication_role = auth_asset.latest_replication_role
            asset.latest_operational_state = auth_asset.latest_operational_state
            asset.data_center_short = auth_asset.data_center_short
            asset.write_authority = auth_asset.write_authority
            asset.latest_confidence_level = 4  # Confirmed by operator override
            # Clear internal conflicts if any
            if asset.metadata_json and "internal_conflict" in asset.metadata_json:
                # Need to update metadata_json dict
                meta = dict(asset.metadata_json)
                meta["internal_conflict"] = ""
                asset.metadata_json = meta
    
    # Also log this in the audit log
    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="CONFLICT_RESOLVED",
        description=f"Operator manually resolved conflict for asset {asset_name}. Selected authoritative source: {authoritative_source}",
        source=authoritative_source
    )
    db.add(audit)
    
    await db.commit()

    return {"status": "SUCCESS", "message": f"Conflict for {asset_name} resolved successfully."}


# ─── Blast Radius / Failover Simulation ──────────────────────────────────────

@router.post("/simulate-failover", response_model=Dict[str, Any])
async def simulate_failover(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/runtime-location/simulate-failover

    Calculate blast radius for a DC going offline.
    Body: { "dc": "IBB1" }
    Returns full impact analysis with critical/warning app lists and failover targets.
    """
    from app.services.blast_radius_service import calculate_blast_radius, BlastRadiusResult

    dc_name = data.get("dc")
    if not dc_name:
        raise HTTPException(status_code=400, detail="Missing 'dc' field in request body")

    result: BlastRadiusResult = await calculate_blast_radius(dc_name, db)

    return {
        "dc": result.dc,
        "dc_full_name": result.dc_full_name,
        "simulated_at": result.simulated_at,
        "total_apps_impacted": result.total_apps_impacted,
        "critical_count": result.critical_count,
        "warning_count": result.warning_count,
        "estimated_recovery_summary": result.estimated_recovery_summary,
        "failover_targets": result.failover_targets,
        "critical_apps": [
            {
                "application_id": a.application_id,
                "application_name": a.application_name,
                "environment": a.environment,
                "primary_dc": a.primary_dc,
                "has_failover": a.has_failover,
                "failover_target": a.failover_target,
                "promotion_required": a.promotion_required,
                "critical_reason": a.critical_reason,
                "affected_tech_stacks": a.affected_tech_stacks,
                "standby_dc": a.standby_dc,
            }
            for a in result.critical_apps
        ],
        "warning_apps": [
            {
                "application_id": a.application_id,
                "application_name": a.application_name,
                "environment": a.environment,
                "primary_dc": a.primary_dc,
                "has_failover": a.has_failover,
                "failover_target": a.failover_target,
                "promotion_required": a.promotion_required,
                "critical_reason": a.critical_reason,
                "affected_tech_stacks": a.affected_tech_stacks,
                "standby_dc": a.standby_dc,
            }
            for a in result.warning_apps
        ],
    }


@router.post("/failover", response_model=Dict[str, Any])
async def execute_failover(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/runtime-location/failover
    Body: { "application_id": "PCA", "failed_dc": "IBB1", "promoted_dc": "SHV", "environment": "PRODUCTION" }
    """
    app_id = data.get("application_id")
    failed_dc = data.get("failed_dc")
    promoted_dc = data.get("promoted_dc")
    environment = data.get("environment", "PRODUCTION")

    if not app_id or not failed_dc or not promoted_dc:
        raise HTTPException(status_code=400, detail="Missing required fields: application_id, failed_dc, promoted_dc")

    # Fetch all assets for this app and environment
    result = await db.execute(select(RuntimeAsset))
    all_assets = result.scalars().all()

    app_assets = []
    for a in all_assets:
        if a.environment == environment:
            if a.metadata_json and a.metadata_json.get("application_id") == app_id:
                app_assets.append(a)
            elif app_id == "MQ_INFRA" and a.data_source == "ibm_mq":
                app_assets.append(a)
            elif app_id == "MONGO_INFRA" and a.data_source == "mongodb":
                app_assets.append(a)
            elif app_id == "ORACLE_INFRA" and a.data_source == "oracle_oem":
                app_assets.append(a)

    if not app_assets:
        raise HTTPException(status_code=404, detail="No assets found for the specified application and environment")

    # Mutate operational states and roles
    mutated_count = 0
    for asset in app_assets:
        # If the asset resides in the failed DC, make it offline
        if asset.data_center_short == failed_dc:
            asset.latest_operational_state = "OFFLINE"
            asset.write_authority = False
            # Demote roles if database
            if asset.latest_replication_role in ["PRIMARY", "PHYSICAL_STANDBY"]:
                asset.latest_replication_role = "SECONDARY" if asset.tech_stack == "mongodb" else "PHYSICAL_STANDBY"
            mutated_count += 1

        # If the asset resides in the promoted DC, make it active and promote it
        elif asset.data_center_short == promoted_dc:
            asset.latest_operational_state = "ACTIVE"
            # Promote standby roles
            if asset.latest_replication_role in ["SECONDARY", "PHYSICAL_STANDBY"]:
                asset.latest_replication_role = "PRIMARY"
                asset.write_authority = True
            mutated_count += 1

    # Log the event in Audit database
    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="FAILOVER_EXECUTED",
        description=f"Executed simulated failover for {app_id} in {environment}. Failed DC: {failed_dc}, Promoted DC: {promoted_dc}.",
        application_id=app_id,
        actor="operator"
    )
    db.add(audit)

    # Re-run drift detection
    drifts = await run_drift_detection(db, app_id, environment, persist_critical=True)
    alignment = compute_alignment_status(drifts)
    await db.execute(
        update(ApplicationIntent)
        .where(ApplicationIntent.application_id == app_id)
        .values(alignment_status=alignment)
    )

    await db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Successfully executed simulated failover for {app_id}.",
        "mutated_assets_count": mutated_count,
        "alignment_status": alignment
    }


@router.post("/failback", response_model=Dict[str, Any])
async def execute_failback(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    POST /api/v1/runtime-location/failback
    Body: { "application_id": "PCA", "environment": "PRODUCTION" }
    """
    app_id = data.get("application_id")
    environment = data.get("environment", "PRODUCTION")

    if not app_id:
        raise HTTPException(status_code=400, detail="Missing required field: application_id")

    # Fetch all assets for this app and environment
    result = await db.execute(select(RuntimeAsset))
    all_assets = result.scalars().all()

    app_assets = []
    for a in all_assets:
        if a.environment == environment:
            if a.metadata_json and a.metadata_json.get("application_id") == app_id:
                app_assets.append(a)
            elif app_id == "MQ_INFRA" and a.data_source == "ibm_mq":
                app_assets.append(a)
            elif app_id == "MONGO_INFRA" and a.data_source == "mongodb":
                app_assets.append(a)
            elif app_id == "ORACLE_INFRA" and a.data_source == "oracle_oem":
                app_assets.append(a)

    if not app_assets:
        raise HTTPException(status_code=404, detail="No assets found for the specified application and environment")

    # Revert to seeded defaults based on intent if it exists, or toggle
    intent_res = await db.execute(select(ApplicationIntent).where(ApplicationIntent.application_id == app_id))
    intent = intent_res.scalar_one_or_none()
    
    primary_dc = intent.intended_primary_dc if intent else "IBB1"

    mutated_count = 0
    for asset in app_assets:
        is_in_primary_dc = asset.data_center_short == primary_dc
        
        # Check tech stack specific defaults
        if asset.tech_stack == "oracle":
            if is_in_primary_dc:
                asset.latest_operational_state = "ACTIVE"
                asset.latest_replication_role = "PRIMARY"
                asset.write_authority = True
            else:
                asset.latest_operational_state = "STANDBY"
                asset.latest_replication_role = "PHYSICAL_STANDBY"
                asset.write_authority = False
        elif asset.tech_stack == "mongodb":
            if is_in_primary_dc:
                asset.latest_operational_state = "ACTIVE"
                asset.latest_replication_role = "PRIMARY"
                asset.write_authority = True
            else:
                asset.latest_operational_state = "STANDBY"
                asset.latest_replication_role = "SECONDARY"
                asset.write_authority = False
        elif asset.tech_stack == "mssql":
            if is_in_primary_dc:
                asset.latest_operational_state = "ACTIVE"
                asset.latest_replication_role = "PRIMARY"
                asset.write_authority = True
            else:
                asset.latest_operational_state = "STANDBY"
                asset.latest_replication_role = "SECONDARY"
                asset.write_authority = False
        elif asset.tech_stack == "ibm_mq":
            is_ga = asset.data_center_short == "GA-PRD"
            asset.latest_operational_state = "ACTIVE" if is_ga else "STANDBY"
            asset.write_authority = is_ga
        else:
            asset.latest_operational_state = "ACTIVE"
            asset.write_authority = False

        mutated_count += 1

    # Log the event in Audit database
    audit = RuntimeAuditLog(
        id=str(uuid.uuid4()),
        event_type="FAILBACK_EXECUTED",
        description=f"Executed simulated failback for {app_id} in {environment}. Restored primary DC: {primary_dc}.",
        application_id=app_id,
        actor="operator"
    )
    db.add(audit)

    # Re-run drift detection
    drifts = await run_drift_detection(db, app_id, environment, persist_critical=True)
    alignment = compute_alignment_status(drifts)
    await db.execute(
        update(ApplicationIntent)
        .where(ApplicationIntent.application_id == app_id)
        .values(alignment_status=alignment)
    )

    await db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Successfully executed failback for {app_id} to primary DC {primary_dc}.",
        "mutated_assets_count": mutated_count,
        "alignment_status": alignment
    }


# ─── Snapshots ────────────────────────────────────────────────────────────────

@router.get("/snapshots/{app_id}", response_model=List[Dict[str, Any]])
async def get_snapshots(
    app_id: str,
    environment: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    GET /api/v1/runtime-location/snapshots/{app_id}
    Returns synthesized snapshot history from the current DB asset state.
    Each asset becomes a snapshot record representing its last-known state.
    Provides real persistence: data survives page refresh.
    """
    env = environment or "PRODUCTION"

    result = await db.execute(select(RuntimeAsset))
    all_assets = result.scalars().all()

    # Filter to assets matching this application
    app_assets = []
    for a in all_assets:
        if a.environment != env:
            continue
        if a.metadata_json and a.metadata_json.get("application_id") == app_id:
            app_assets.append(a)
        elif app_id == "MQ_INFRA" and a.data_source == "ibm_mq":
            app_assets.append(a)
        elif app_id == "MONGO_INFRA" and a.data_source == "mongodb":
            app_assets.append(a)
        elif app_id == "ORACLE_INFRA" and a.data_source == "oracle_oem":
            app_assets.append(a)

    snapshots = []
    for asset in app_assets:
        snapshots.append({
            "id": f"snap-{asset.id}",
            "asset_id": asset.id,
            "snapshot_time": asset.last_seen_at.isoformat() + "Z" if asset.last_seen_at else datetime.utcnow().isoformat() + "Z",
            "operational_state": asset.latest_operational_state or "UNKNOWN",
            "replication_role": asset.latest_replication_role or "NONE",
            "data_source": asset.data_source,
            "confidence_level": asset.latest_confidence_level or 3,
            "is_deterministic": asset.is_deterministic or False,
        })

    # Sort most-recent first
    snapshots.sort(key=lambda x: x["snapshot_time"], reverse=True)
    return snapshots
