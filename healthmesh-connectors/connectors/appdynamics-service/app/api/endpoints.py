from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import AppDynamicsApplication, AppDynamicsNode, AppDynamicsTransaction, AppDynamicsMetric, AppDynamicsAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for AppDynamics
EXPECTED_SCHEMAS = {
    "node_inventory": ["application_name", "node_name", "tier_name", "status", "host", "port"],
    "traffic_samples": ["application_name", "transaction_name", "call_count", "average_response_time_ms", "error_percentage", "throughput_calls_per_min"]
}

def get_db(router_dep = None):
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "appdynamics-service", "timestamp": datetime.utcnow().isoformat()}

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

    if schema == "node_inventory":
        for rec in records:
            app_name = rec.get("application_name") or "healthmesh-portal"
            node_name = rec.get("node_name")
            tier = rec.get("tier_name") or "web-tier"
            status = str(rec.get("status", "ACTIVE")).upper()

            if not node_name:
                continue

            # Ensure Application
            stmt = select(AppDynamicsApplication).where(AppDynamicsApplication.name == app_name)
            res = await db.execute(stmt)
            app = res.scalar_one_or_none()
            if not app:
                app = AppDynamicsApplication(name=app_name, status="NORMAL", node_count=1)
                db.add(app)
            else:
                app.node_count += 1

            # Ensure Node
            stmt = select(AppDynamicsNode).where(AppDynamicsNode.name == node_name)
            res = await db.execute(stmt)
            node = res.scalar_one_or_none()

            if node:
                node.application_name = app_name
                node.tier_name = tier
                node.status = status
                node.host = rec.get("host") or node.host
                node.port = int(rec.get("port")) if rec.get("port") else node.port
            else:
                node = AppDynamicsNode(
                    application_name=app_name,
                    name=node_name,
                    tier_name=tier,
                    status=status,
                    host=rec.get("host"),
                    port=int(rec.get("port")) if rec.get("port") else 8080
                )
                db.add(node)

            # Offline Node Alert
            if status == "INACTIVE":
                alert = AppDynamicsAlert(
                    component="NODE",
                    component_name=node_name,
                    alert_type="NODE_DOWN",
                    severity="CRITICAL",
                    message=f"AppDynamics App Node {node_name} is INACTIVE!"
                )
                db.add(alert)

    elif schema == "traffic_samples":
        for rec in records:
            app_name = rec.get("application_name") or "healthmesh-portal"
            tx_name = rec.get("transaction_name")
            if not tx_name:
                continue

            calls = int(rec.get("call_count") or 0)
            rt = float(rec.get("average_response_time_ms") or 0.0)
            err = float(rec.get("error_percentage") or 0.0)
            throughput = float(rec.get("throughput_calls_per_min") or float(calls)/60.0 if calls > 0 else 0.0)

            # Ensure Transaction
            stmt = select(AppDynamicsTransaction).where(AppDynamicsTransaction.name == tx_name, AppDynamicsTransaction.application_name == app_name)
            res = await db.execute(stmt)
            tx = res.scalar_one_or_none()

            if tx:
                tx.call_count = calls
                tx.average_response_time_ms = rt
                tx.error_percentage = err
            else:
                tx = AppDynamicsTransaction(
                    application_name=app_name,
                    name=tx_name,
                    call_count=calls,
                    average_response_time_ms=rt,
                    error_percentage=err
                )
                db.add(tx)

            # Add App Metric
            metric = AppDynamicsMetric(
                application_name=app_name,
                cpu_usage_percentage=45.0 if rt > 500 else 12.5,
                memory_usage_mb=1024.0,
                throughput_calls_per_min=throughput
            )
            db.add(metric)

            # SLA Alerts
            if rt > 800.0: # > 800ms Average Latency
                alert = AppDynamicsAlert(
                    component="TRANSACTION",
                    component_name=tx_name,
                    alert_type="LATENCY_HIGH",
                    severity="CRITICAL" if rt > 2000.0 else "WARNING",
                    message=f"Business Transaction {tx_name} latency is extremely high: {rt}ms average!"
                )
                db.add(alert)

            if err > 5.0: # > 5% Errors
                alert = AppDynamicsAlert(
                    component="TRANSACTION",
                    component_name=tx_name,
                    alert_type="ERROR_RATE_HIGH",
                    severity="CRITICAL" if err > 15.0 else "WARNING",
                    message=f"Transaction {tx_name} error rate spiked to {err}%!"
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
    app_cnt = await db.execute(select(func.count(AppDynamicsApplication.id)))
    tx_cnt = await db.execute(select(func.count(AppDynamicsTransaction.id)))
    alert_cnt = await db.execute(select(func.count(AppDynamicsAlert.id)).where(AppDynamicsAlert.resolved == False))
    
    return {
        "applications_count": app_cnt.scalar() or 0,
        "transactions_count": tx_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/applications")
async def get_applications(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AppDynamicsApplication))
    return res.scalars().all()

@router.get("/transactions")
async def get_transactions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AppDynamicsTransaction))
    return res.scalars().all()

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    apps_res = await db.execute(select(AppDynamicsApplication))
    apps = apps_res.scalars().all()

    nodes_res = await db.execute(select(AppDynamicsNode))
    nodes_list = nodes_res.scalars().all()

    tx_res = await db.execute(select(AppDynamicsTransaction))
    txs = tx_res.scalars().all()
    
    nodes = []
    edges = []

    for a in apps:
        nodes.append({"id": f"app:{a.name}", "label": a.name, "type": "application", "status": a.status})

    # Group nodes into Tiers
    tiers = set(n.tier_name for n in nodes_list)
    for t in tiers:
        nodes.append({"id": f"tier:{t}", "label": t, "type": "tier", "status": "NORMAL"})

    for n in nodes_list:
        nodes.append({"id": f"node:{n.name}", "label": n.name, "type": "node", "status": n.status})
        edges.append({"source": f"tier:{n.tier_name}", "target": f"node:{n.name}", "type": "hosts"})
        edges.append({"source": f"app:{n.application_name}", "target": f"tier:{n.tier_name}", "type": "defines"})

    for tx in txs:
        nodes.append({"id": f"tx:{tx.name}", "label": tx.name, "type": "business_transaction", "status": "CRITICAL" if tx.error_percentage > 5.0 or tx.average_response_time_ms > 800.0 else "NORMAL"})
        edges.append({"source": f"app:{tx.application_name}", "target": f"tx:{tx.name}", "type": "performs"})

    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(AppDynamicsAlert).where(AppDynamicsAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    metrics_res = await db.execute(select(AppDynamicsMetric).order_by(AppDynamicsMetric.timestamp.desc()).limit(100))
    metrics = metrics_res.scalars().all()

    avg_tput = sum(m.throughput_calls_per_min for m in metrics) / len(metrics) if metrics else 0.0
    avg_cpu = sum(m.cpu_usage_percentage for m in metrics) / len(metrics) if metrics else 0.0

    return {
        "average_calls_per_minute": avg_tput,
        "average_tier_cpu_load": avg_cpu,
        "data_points": len(metrics)
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    apps_res = await db.execute(select(AppDynamicsApplication))
    apps = apps_res.scalars().all()

    nodes_res = await db.execute(select(AppDynamicsNode))
    nodes_list = nodes_res.scalars().all()
    nodes_down = [n.name for n in nodes_list if n.status != "ACTIVE"]

    tx_res = await db.execute(select(AppDynamicsTransaction))
    txs = tx_res.scalars().all()
    slow_tx = [t.name for t in txs if t.average_response_time_ms > 800.0]
    error_tx = [t.name for t in txs if t.error_percentage > 5.0]

    alerts_res = await db.execute(select(AppDynamicsAlert).where(AppDynamicsAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if nodes_down:
        score -= len(nodes_down) * 15.0
        criticals.append(f"AppDynamics application tier hosts are currently INACTIVE: {', '.join(nodes_down)}")
        recs.append(f"Inspect host memory/connectivity for INACTIVE AppDynamics tier servers: {', '.join(nodes_down)}")

    if slow_tx:
        score -= len(slow_tx) * 10.0
        warnings.append(f"Business Transaction SLA Breach (Average Response > 800ms): {', '.join(slow_tx)}")
        recs.append(f"Trace SQL query metrics or thread dumps for slow business transactions: {', '.join(slow_tx)}")

    if error_tx:
        score -= len(error_tx) * 12.0
        criticals.append(f"Transaction error rate spiked above 5% threshold: {', '.join(error_tx)}")
        recs.append(f"Check application server logging or database connection pools for error spike on: {', '.join(error_tx)}")

    score = max(0.0, score)
    topology_desc = f"AppDynamics APM monitoring {len(apps)} applications, {len(nodes_list)} infrastructure nodes, and {len(txs)} business transactions."

    return build_ai_context(
        connector_name="appdynamics",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"offline_jvm_nodes": nodes_down, "slow_calls": slow_tx, "failed_calls": error_tx},
        sla_status={"apm_health_score": score, "transaction_sla_adhered": len(slow_tx) == 0 and len(error_tx) == 0}
    )
