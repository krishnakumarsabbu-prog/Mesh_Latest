from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import SCOMServer, SCOMReplica, InfraMetric, InfraAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for SCOM
EXPECTED_SCHEMAS = {
    "prod_replica": ["source_server_name", "target_server_name", "replication_status", "replication_lag_seconds", "dr_test_status", "os_type", "cpu_cores", "memory_mb", "cpu_utilization_pct", "memory_utilization_pct", "disk_free_gb"]
}

def get_db(router_dep = None):
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "scom-service", "timestamp": datetime.utcnow().isoformat()}

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

    if schema == "prod_replica":
        for rec in records:
            src_name = rec.get("source_server_name")
            tgt_name = rec.get("target_server_name")
            if not src_name or not tgt_name:
                continue

            # Ensure Source Server
            stmt = select(SCOMServer).where(SCOMServer.name == src_name)
            res = await db.execute(stmt)
            src_server = res.scalar_one_or_none()
            
            os_t = str(rec.get("os_type") or "WINDOWS").upper()
            cores = int(rec.get("cpu_cores") or 4)
            ram = int(rec.get("memory_mb") or 16384)

            if src_server:
                src_server.cpu_cores = cores
                src_server.memory_mb = ram
                src_server.os_type = os_t
            else:
                src_server = SCOMServer(
                    name=src_name,
                    status="ONLINE",
                    os_type=os_t,
                    cpu_cores=cores,
                    memory_mb=ram
                )
                db.add(src_server)

            # Ensure Target Server
            stmt = select(SCOMServer).where(SCOMServer.name == tgt_name)
            res = await db.execute(stmt)
            tgt_server = res.scalar_one_or_none()

            if not tgt_server:
                tgt_server = SCOMServer(
                    name=tgt_name,
                    status="ONLINE",
                    os_type=os_t,
                    cpu_cores=cores,
                    memory_mb=ram
                )
                db.add(tgt_server)

            # Ensure Replica Pair
            rep_status = str(rec.get("replication_status") or "SYNCED").upper()
            lag = int(rec.get("replication_lag_seconds") or 0)
            dr_test = str(rec.get("dr_test_status") or "PASSED").upper()

            stmt = select(SCOMReplica).where(SCOMReplica.source_server_name == src_name, SCOMReplica.target_server_name == tgt_name)
            res = await db.execute(stmt)
            rep = res.scalar_one_or_none()

            if rep:
                rep.replication_status = rep_status
                rep.replication_lag_seconds = lag
                rep.dr_test_status = dr_test
            else:
                rep = SCOMReplica(
                    source_server_name=src_name,
                    target_server_name=tgt_name,
                    replication_status=rep_status,
                    replication_lag_seconds=lag,
                    dr_test_status=dr_test
                )
                db.add(rep)

            # Record metric
            cpu_pct = float(rec.get("cpu_utilization_pct") or 40.0)
            mem_pct = float(rec.get("memory_utilization_pct") or 65.0)
            disk = float(rec.get("disk_free_gb") or 120.0)

            metric = InfraMetric(
                server_name=src_name,
                cpu_utilization_pct=cpu_pct,
                memory_utilization_pct=mem_pct,
                disk_free_gb=disk
            )
            db.add(metric)

            # Alerts
            if disk < 15.0: # < 15 GB free disk
                alert = InfraAlert(
                    component="SERVER",
                    component_name=src_name,
                    alert_type="DISK_FULL",
                    severity="CRITICAL" if disk < 5.0 else "WARNING",
                    message=f"Infrastructure Host {src_name} has low free disk space: {disk} GB remaining!"
                )
                db.add(alert)

            if rep_status == "ERROR" or lag > 3600: # Lag > 1 hour or error status
                alert = InfraAlert(
                    component="REPLICA",
                    component_name=f"{src_name}->{tgt_name}",
                    alert_type="REPLICA_LAG",
                    severity="CRITICAL",
                    message=f"CRITICAL: Hyper-V VM replication {src_name}->{tgt_name} lag is {lag}s with status {rep_status}!"
                )
                db.add(alert)

            if dr_test == "FAILED":
                alert = InfraAlert(
                    component="REPLICA",
                    component_name=f"{src_name}->{tgt_name}",
                    alert_type="DR_TEST_FAILED",
                    severity="CRITICAL",
                    message=f"Disaster Recovery validation failover test FAILED for replication pair {src_name}->{tgt_name}!"
                )
                db.add(alert)

    await db.commit()
    return {
        "success": True,
        "message": f"Successfully processed {file.filename} as schema {schema}",
        "metrics": parse_result
    }

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    s_cnt = await db.execute(select(func.count(SCOMServer.id)))
    r_cnt = await db.execute(select(func.count(SCOMReplica.id)))
    alert_cnt = await db.execute(select(func.count(InfraAlert.id)).where(InfraAlert.resolved == False))
    
    return {
        "servers_count": s_cnt.scalar() or 0,
        "replications_count": r_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/servers")
async def get_servers(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SCOMServer))
    return res.scalars().all()

@router.get("/replication")
async def get_replication(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(SCOMReplica))
    return res.scalars().all()

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    srv_res = await db.execute(select(SCOMServer))
    servers = srv_res.scalars().all()

    rep_res = await db.execute(select(SCOMReplica))
    reps = rep_res.scalars().all()
    
    nodes = []
    edges = []

    for s in servers:
        nodes.append({"id": f"server:{s.name}", "label": s.name, "type": "server", "os": s.os_type, "status": s.status})

    for r in reps:
        edges.append({"source": f"server:{r.source_server_name}", "target": f"server:{r.target_server_name}", "type": "replication", "status": r.replication_status})

    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(InfraAlert).where(InfraAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    metrics_res = await db.execute(select(InfraMetric).order_by(InfraMetric.timestamp.desc()).limit(100))
    metrics = metrics_res.scalars().all()

    avg_cpu = sum(m.cpu_utilization_pct for m in metrics) / len(metrics) if metrics else 0.0
    avg_mem = sum(m.memory_utilization_pct for m in metrics) / len(metrics) if metrics else 0.0

    return {
        "average_hypervisor_cpu_load": avg_cpu,
        "average_hypervisor_mem_load": avg_mem,
        "data_points": len(metrics)
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    srv_res = await db.execute(select(SCOMServer))
    servers = srv_res.scalars().all()
    srv_down = [s.name for s in servers if s.status != "ONLINE"]

    rep_res = await db.execute(select(SCOMReplica))
    reps = rep_res.scalars().all()
    failed_reps = [f"{r.source_server_name}->{r.target_server_name}" for r in reps if r.replication_status == "ERROR"]
    lag_reps = [f"{r.source_server_name}->{r.target_server_name}" for r in reps if r.replication_lag_seconds > 300]
    dr_fails = [f"{r.source_server_name}->{r.target_server_name}" for r in reps if r.dr_test_status == "FAILED"]

    alerts_res = await db.execute(select(InfraAlert).where(InfraAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if srv_down:
        score -= len(srv_down) * 20.0
        criticals.append(f"Infrastructure hypervisors / bare-metal servers down: {', '.join(srv_down)}")
        recs.append(f"Trigger physical hardware power-cycle or check hypervisor agent statuses on: {', '.join(srv_down)}")

    if failed_reps:
        score -= len(failed_reps) * 15.0
        criticals.append(f"SCOM VM replication channels broken: {', '.join(failed_reps)}")
        recs.append(f"Re-establish secure copy channels or target disk replication for VM pairs: {', '.join(failed_reps)}")

    if lag_reps:
        score -= len(lag_reps) * 8.0
        warnings.append(f"VM replica replication delay exceeding 5-min threshold: {', '.join(lag_reps)}")
        recs.append(f"Optimize replication network pipe bandwidth or reduce delta file size for: {', '.join(lag_reps)}")

    if dr_fails:
        score -= len(dr_fails) * 15.0
        criticals.append(f"Disaster Recovery Hyper-V failover mock test failed: {', '.join(dr_fails)}")
        recs.append(f"Execute clean mock recovery steps and resolve target hypervisor storage limits for: {', '.join(dr_fails)}")

    score = max(0.0, score)
    topology_desc = f"SCOM Connector monitoring {len(servers)} servers, {len(reps)} active Hyper-V / VM replication links."

    return build_ai_context(
        connector_name="scom",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"offline_servers": srv_down, "broken_replications": failed_reps, "failed_dr_tests": dr_fails},
        sla_status={"virtualization_sla": score, "dr_validation_adhered": len(failed_reps) == 0 and len(dr_fails) == 0}
    )
