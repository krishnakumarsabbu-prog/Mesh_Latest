from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import TrafficLog, APIMetric, LoadBalancer, TrafficAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for Splunk Traffic
EXPECTED_SCHEMAS = {
    "traffic_samples": ["application_name", "api_endpoint", "request_count", "error_count", "retry_count", "avg_latency_ms"],
    "load_balancer_report": ["load_balancer_name", "status", "active_connections", "target_group_name"]
}

def get_db(router_dep = None):
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "splunk-traffic-service", "timestamp": datetime.utcnow().isoformat()}

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

    if schema == "traffic_samples":
        for rec in records:
            app_name = rec.get("application_name") or "healthmesh-app"
            endpoint = rec.get("api_endpoint")
            if not endpoint:
                continue

            reqs = int(rec.get("request_count") or 0)
            errs = int(rec.get("error_count") or 0)
            retries = int(rec.get("retry_count") or 0)
            lat = float(rec.get("avg_latency_ms") or 0.0)

            # Record Traffic Log
            log = TrafficLog(
                application_name=app_name,
                api_endpoint=endpoint,
                request_count=reqs,
                error_count=errs,
                retry_count=retries
            )
            db.add(log)

            # Update APIMetric
            stmt = select(APIMetric).where(APIMetric.api_endpoint == endpoint)
            res = await db.execute(stmt)
            metric = res.scalar_one_or_none()

            suc_rate = ((reqs - errs) / reqs * 100.0) if reqs > 0 else 100.0
            if metric:
                metric.avg_latency_ms = lat
                metric.success_rate = suc_rate
            else:
                metric = APIMetric(
                    api_endpoint=endpoint,
                    avg_latency_ms=lat,
                    success_rate=suc_rate
                )
                db.add(metric)

            # Generate alerts for traffic and errors
            if errs > (reqs * 0.1): # > 10% errors
                alert = TrafficAlert(
                    component="ENDPOINT",
                    component_name=endpoint,
                    alert_type="ERROR_RATE_HIGH",
                    severity="CRITICAL",
                    message=f"CRITICAL: API Endpoint {endpoint} is exhibiting error rate of {round(100.0 - suc_rate, 2)}%!"
                )
                db.add(alert)

            if retries > (reqs * 0.15): # > 15% retries
                alert = TrafficAlert(
                    component="ENDPOINT",
                    component_name=endpoint,
                    alert_type="RETRY_RATE_HIGH",
                    severity="WARNING",
                    message=f"WARNING: High retry rate detected on API {endpoint}: {retries} retries out of {reqs} calls."
                )
                db.add(alert)

    elif schema == "load_balancer_report":
        for rec in records:
            lb_name = rec.get("load_balancer_name") or rec.get("name")
            if not lb_name:
                continue

            status = str(rec.get("status", "ACTIVE")).upper()
            conns = int(rec.get("active_connections") or 0)
            tg = rec.get("target_group_name") or "default-tg"

            stmt = select(LoadBalancer).where(LoadBalancer.name == lb_name)
            res = await db.execute(stmt)
            lb = res.scalar_one_or_none()

            if lb:
                lb.status = status
                lb.active_connections = conns
                lb.target_group_name = tg
            else:
                lb = LoadBalancer(
                    name=lb_name,
                    status=status,
                    active_connections=conns,
                    target_group_name=tg
                )
                db.add(lb)

            if status == "OFFLINE":
                alert = TrafficAlert(
                    component="LOAD_BALANCER",
                    component_name=lb_name,
                    alert_type="LB_DOWN",
                    severity="CRITICAL",
                    message=f"Load Balancer {lb_name} is OFFLINE!"
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
    t_cnt = await db.execute(select(func.count(TrafficLog.id)))
    lb_cnt = await db.execute(select(func.count(LoadBalancer.id)))
    alert_cnt = await db.execute(select(func.count(TrafficAlert.id)).where(TrafficAlert.resolved == False))
    
    return {
        "traffic_records_count": t_cnt.scalar() or 0,
        "load_balancers_count": lb_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/traffic")
async def get_traffic(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(APIMetric))
    return res.scalars().all()

@router.get("/load-balancers")
async def get_load_balancers(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LoadBalancer))
    return res.scalars().all()

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    lb_res = await db.execute(select(LoadBalancer))
    lbs = lb_res.scalars().all()

    api_res = await db.execute(select(APIMetric))
    apis = api_res.scalars().all()
    
    nodes = []
    edges = []

    for lb in lbs:
        nodes.append({"id": f"lb:{lb.name}", "label": lb.name, "type": "load_balancer", "status": lb.status})

    for api in apis:
        nodes.append({"id": f"api:{api.api_endpoint}", "label": api.api_endpoint, "type": "endpoint", "status": "READY" if api.success_rate > 95.0 else "ALERT"})
        
        # Connect load balancers to endpoints using basic path heuristics
        for lb in lbs:
            edges.append({"source": f"lb:{lb.name}", "target": f"api:{api.api_endpoint}", "type": "routes"})

    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(TrafficAlert).where(TrafficAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    api_res = await db.execute(select(APIMetric))
    apis = api_res.scalars().all()

    avg_lat = sum(a.avg_latency_ms for a in apis) / len(apis) if apis else 0.0
    avg_success = sum(a.success_rate for a in apis) / len(apis) if apis else 100.0

    return {
        "average_api_latency_ms": avg_lat,
        "average_api_success_rate": avg_success,
        "endpoints_monitored": len(apis)
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    lb_res = await db.execute(select(LoadBalancer))
    lbs = lb_res.scalars().all()
    lbs_down = [lb.name for lb in lbs if lb.status != "ACTIVE"]

    api_res = await db.execute(select(APIMetric))
    apis = api_res.scalars().all()
    error_endpoints = [a.api_endpoint for a in apis if a.success_rate < 90.0]
    slow_endpoints = [a.api_endpoint for a in apis if a.avg_latency_ms > 1000.0]

    alerts_res = await db.execute(select(TrafficAlert).where(TrafficAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if lbs_down:
        score -= len(lbs_down) * 25.0
        criticals.append(f"Infrastructure Load Balancers currently OFFLINE: {', '.join(lbs_down)}")
        recs.append(f"Investigate active load balancer nodes or target group failover mappings for: {', '.join(lbs_down)}")

    if error_endpoints:
        score -= len(error_endpoints) * 12.0
        criticals.append(f"API endpoints success rate dropped below 90% SLA: {', '.join(error_endpoints)}")
        recs.append(f"Check backend server error logs or retry policies for endpoints: {', '.join(error_endpoints)}")

    if slow_endpoints:
        score -= len(slow_endpoints) * 8.0
        warnings.append(f"API endpoints latency breached warning threshold (1s): {', '.join(slow_endpoints)}")
        recs.append(f"Optimize downstream database calls or enable cache for endpoints: {', '.join(slow_endpoints)}")

    score = max(0.0, score)
    topology_desc = f"Splunk Traffic Connector tracks {len(lbs)} load balancers and {len(apis)} HTTP endpoints in real-time."

    return build_ai_context(
        connector_name="splunk-traffic",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"offline_lbs": lbs_down, "failed_apis": error_endpoints, "slow_apis": slow_endpoints},
        sla_status={"overall_traffic_score": score, "http_sla_status": len(error_endpoints) == 0}
    )
