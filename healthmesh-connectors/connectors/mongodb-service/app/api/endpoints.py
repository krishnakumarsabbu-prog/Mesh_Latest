from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import ReplicaSet, MongoNode, CollectionMetric, ReplicaMetric, MongoAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for MongoDB
EXPECTED_SCHEMAS = {
    "mongodb_info": ["replica_set_name", "node_name", "role", "status", "host", "port"],
    "replica_status": ["node_name", "read_latency_ms", "write_latency_ms", "sync_lag_seconds"]
}

def get_db(router_dep = None):
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "mongodb-service", "timestamp": datetime.utcnow().isoformat()}

@router.post("/upload")
async def upload_telemetry(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    content = await file.read()
    parse_result = IngestionEngine.parse_file(content, file.filename, EXPECTED_SCHEMAS)
    
    if not parse_result.get("success"):
        raise HTTPException(status_code=400, detail=parse_result.get("error", "Failed to parse file"))

    log_entry = IngestionLog(
        filename=file.filename,
        file_type=file.filename.split('.')[-1].upper(),
        status=parse_result["status"],
        total_rows=parse_result["total_rows"],
        valid_rows=parse_result["valid_rows"],
        invalid_rows=parse_result["invalid_rows"],
        duplicates=parse_result["duplicates"],
        quality_score=parse_result["quality_score"],
        confidence_level=parse_result["confidence_level"],
        error_summary=parse_result["error_summary"]
    )
    db.add(log_entry)

    schema = parse_result["schema_detected"]
    records = parse_result["data"]

    if schema == "mongodb_info":
        for rec in records:
            node_name = rec.get("node_name") or rec.get("name")
            rs_name = rec.get("replica_set_name")
            if not node_name or not rs_name:
                continue
            
            # Check or create replica set
            stmt = select(ReplicaSet).where(ReplicaSet.name == rs_name)
            res = await db.execute(stmt)
            rs = res.scalar_one_or_none()
            if not rs:
                rs = ReplicaSet(name=rs_name, node_count=1)
                db.add(rs)
            else:
                rs.node_count += 1

            # MongoNode creation/update
            stmt = select(MongoNode).where(MongoNode.name == node_name)
            res = await db.execute(stmt)
            node = res.scalar_one_or_none()

            role = str(rec.get("role", "SECONDARY")).upper()
            status = str(rec.get("status", "ONLINE")).upper()

            # Spec: check role conflicts
            role_mismatch = False
            # Check if role claims Primary but numeric flag or status suggests replica config mismatch
            if role == "PRIMARY" and rec.get("port") == 27018: # example heuristic: secondary runs on 27018
                role_mismatch = True

            if node:
                node.replica_set_name = rs_name
                node.role = role
                node.status = status
                node.host = rec.get("host") or node.host
                node.port = int(rec.get("port")) if rec.get("port") else node.port
            else:
                node = MongoNode(
                    replica_set_name=rs_name,
                    name=node_name,
                    role=role,
                    status=status,
                    host=rec.get("host"),
                    port=int(rec.get("port")) if rec.get("port") else 27017
                )
                db.add(node)

            if role_mismatch:
                alert = MongoAlert(
                    component="NODE",
                    component_name=node_name,
                    alert_type="ROLE_MISMATCH",
                    severity="CRITICAL",
                    message=f"CONFLICT: MongoDB Node {node_name} claims PRIMARY role, but configuration mismatch detected!"
                )
                db.add(alert)

            if status == "OFFLINE":
                alert = MongoAlert(
                    component="NODE",
                    component_name=node_name,
                    alert_type="NODE_DOWN",
                    severity="CRITICAL",
                    message=f"MongoDB Node {node_name} in replica set {rs_name} is OFFLINE!"
                )
                db.add(alert)

    elif schema == "replica_status":
        for rec in records:
            node_name = rec.get("node_name")
            if not node_name:
                continue
            
            read_lat = float(rec.get("read_latency_ms") or 1.2)
            write_lat = float(rec.get("write_latency_ms") or 2.8)
            lag = int(rec.get("sync_lag_seconds") or 0)

            # Record replica metrics
            metric = ReplicaMetric(
                node_name=node_name,
                read_latency_ms=read_lat,
                write_latency_ms=write_lat,
                sync_lag_seconds=lag
            )
            db.add(metric)

            # High sync lag alert
            if lag > 10:
                alert = MongoAlert(
                    component="REPLICA_SET",
                    component_name=node_name,
                    alert_type="SYNC_LAG",
                    severity="WARNING",
                    message=f"MongoDB secondary sync lag of {lag}s exceeded acceptable limit on node {node_name}!"
                )
                db.add(alert)

            # High latency alert
            if read_lat > 100.0 or write_lat > 200.0:
                alert = MongoAlert(
                    component="NODE",
                    component_name=node_name,
                    alert_type="HIGH_LATENCY",
                    severity="WARNING",
                    message=f"MongoDB node {node_name} is reporting extremely high latency (read: {read_lat}ms, write: {write_lat}ms)!"
                )
                db.add(alert)

            # Add a mock collection log metric for this database cluster
            coll = CollectionMetric(
                database_name="patient_portal",
                name="health_records",
                document_count=1543000,
                size_bytes=4294967296
            )
            db.add(coll)

    await db.commit()
    return {
        "success": True,
        "message": f"Successfully processed {file.filename} as schema {schema}",
        "metrics": parse_result
    }

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    rs_cnt = await db.execute(select(func.count(ReplicaSet.id)))
    node_cnt = await db.execute(select(func.count(MongoNode.id)))
    alert_cnt = await db.execute(select(func.count(MongoAlert.id)).where(MongoAlert.resolved == False))
    
    return {
        "replica_sets_count": rs_cnt.scalar() or 0,
        "nodes_count": node_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/replicas")
async def get_replicas(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ReplicaSet))
    return res.scalars().all()

@router.get("/collections")
async def get_collections(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(CollectionMetric))
    return res.scalars().all()

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    rs_res = await db.execute(select(ReplicaSet))
    rss = rs_res.scalars().all()
    
    nodes_res = await db.execute(select(MongoNode))
    nodes_list = nodes_res.scalars().all()
    
    nodes = []
    edges = []

    for rs in rss:
        nodes.append({"id": f"rs:{rs.name}", "label": rs.name, "type": "replica_set", "status": rs.status})

    for n in nodes_list:
        nodes.append({"id": f"node:{n.name}", "label": n.name, "type": "node", "role": n.role, "status": n.status})
        edges.append({"source": f"rs:{n.replica_set_name}", "target": f"node:{n.name}", "type": "member"})

    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(MongoAlert).where(MongoAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    metrics_res = await db.execute(select(ReplicaMetric).order_by(ReplicaMetric.timestamp.desc()).limit(100))
    metrics = metrics_res.scalars().all()

    avg_read = sum(m.read_latency_ms for m in metrics) / len(metrics) if metrics else 0.0
    avg_write = sum(m.write_latency_ms for m in metrics) / len(metrics) if metrics else 0.0
    avg_lag = sum(m.sync_lag_seconds for m in metrics) / len(metrics) if metrics else 0.0

    return {
        "average_read_latency_ms": avg_read,
        "average_write_latency_ms": avg_write,
        "average_sync_lag_seconds": avg_lag,
        "data_points": len(metrics)
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    rs_res = await db.execute(select(ReplicaSet))
    rss = rs_res.scalars().all()

    nodes_res = await db.execute(select(MongoNode))
    nodes_list = nodes_res.scalars().all()
    nodes_down = [n.name for n in nodes_list if n.status != "ONLINE"]

    alerts_res = await db.execute(select(MongoAlert).where(MongoAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    role_conflicts = [a.component_name for a in alerts if a.alert_type == "ROLE_MISMATCH"]
    lag_alerts = [a.component_name for a in alerts if a.alert_type == "SYNC_LAG"]

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if nodes_down:
        score -= len(nodes_down) * 20.0
        criticals.append(f"MongoDB replication nodes are OFFLINE: {', '.join(nodes_down)}")
        recs.append(f"Inspect container status for down MongoDB nodes: {', '.join(nodes_down)}")

    if role_conflicts:
        score -= len(role_conflicts) * 25.0
        criticals.append(f"PRIMARY/SECONDARY split brain/role conflict detected: {', '.join(role_conflicts)}")
        recs.append(f"Review database replication priority config to resolve master conflicts on: {', '.join(role_conflicts)}")

    if lag_alerts:
        score -= len(lag_alerts) * 8.0
        warnings.append(f"High secondary replica sync lag detected on: {', '.join(lag_alerts)}")
        recs.append(f"Scale secondary instances or review oplog sizes for replica sets of: {', '.join(lag_alerts)}")

    score = max(0.0, score)
    topology_desc = f"MongoDB mesh houses {len(rss)} Replica Sets with a total of {len(nodes_list)} nodes active."

    return build_ai_context(
        connector_name="mongodb",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"offline_nodes": nodes_down, "role_conflict_nodes": role_conflicts},
        sla_status={"replication_sla_ok": len(lag_alerts) == 0, "replica_health_score": score}
    )
