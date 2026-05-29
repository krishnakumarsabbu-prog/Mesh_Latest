from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime
import json
import re

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import VirtualService, Pool, LoadBalancerMetric, ADCAlert, PoolMembership, IngestionLog

router = APIRouter()

EXPECTED_SCHEMAS = {
    "pool_metrics": ["uuid", "type", "tenant", "name", "health_score"],
    "virtual_service_metrics": ["uuid", "type", "tenant", "name", "health_score"],
    "load_balancer_report": ["name", "enabled", "tenant", "app_id", "pool", "site"]
}

def get_db(router_dep=None):
    pass


def _parse_prometheus_line(line: str):
    """Parse a Prometheus-style metric line into (metric_name, labels, value)."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    match = re.match(r'^(\w+)\{([^}]*)\}\s+([\d.e+\-]+)$', line)
    if not match:
        return None
    metric_name = match.group(1)
    labels_str = match.group(2)
    value = float(match.group(3))
    labels = {}
    for pair in re.findall(r'(\w+)="([^"]*)"', labels_str):
        labels[pair[0]] = pair[1]
    return metric_name, labels, value


def _ingest_prometheus_data(records, resource_type: str):
    """Parse prometheus-format JSON/text metrics into structured records."""
    grouped: Dict[str, Dict] = {}
    for metric_name, labels, value in records:
        key = f"{labels.get('uuid','')}-{labels.get('server','')}"
        if key not in grouped:
            grouped[key] = {
                "uuid": labels.get("uuid", ""),
                "name": labels.get("name", ""),
                "tenant": labels.get("tenant", ""),
                "server": labels.get("server", ""),
                "type": labels.get("type", resource_type),
                "metrics": {}
            }
        grouped[key]["metrics"][metric_name] = value
    return list(grouped.values())


@router.get("/health")
async def health():
    return {"status": "healthy", "service": "adc-loadbalancer-service", "timestamp": datetime.utcnow().isoformat()}


@router.post("/upload")
async def upload_telemetry(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    content = await file.read()
    filename = file.filename.lower()

    log_entry = IngestionLog(
        filename=file.filename,
        file_type=file.filename.split('.')[-1].upper(),
        status="SUCCESS",
        total_rows=0,
        valid_rows=0,
        invalid_rows=0,
        duplicates=0,
        quality_score=100.0,
        confidence_level="HIGH",
        error_summary=""
    )
    db.add(log_entry)

    # Handle JSON prometheus-format files
    if filename.endswith(".json"):
        try:
            text = content.decode("utf-8")
        except Exception:
            raise HTTPException(status_code=400, detail="Cannot decode file as UTF-8")

        lines = text.splitlines()
        parsed = []
        for line in lines:
            result = _parse_prometheus_line(line)
            if result:
                parsed.append(result)

        grouped = _ingest_prometheus_data(parsed, "pool" if "pool" in filename else "virtualservice")
        log_entry.total_rows = len(grouped)
        log_entry.valid_rows = len(grouped)

        for item in grouped:
            uuid = item["uuid"]
            name = item["name"]
            tenant = item["tenant"]
            server = item["server"]
            metrics = item["metrics"]
            res_type = item["type"]

            if not uuid:
                continue

            health_score = metrics.get("avi_healthscore_health_score_value", 0.0)
            perf_score = metrics.get("avi_healthscore_performance_score_value", 0.0)
            sec_penalty = metrics.get("avi_healthscore_security_penalty", 0.0)
            res_penalty = metrics.get("avi_healthscore_resources_penalty", 0.0)
            anom_penalty = metrics.get("avi_healthscore_anomaly_penalty", 0.0)

            # Store raw metrics
            for mname, mval in metrics.items():
                m = LoadBalancerMetric(
                    resource_uuid=uuid,
                    resource_name=name,
                    resource_type=res_type,
                    metric_name=mname,
                    metric_value=mval,
                    tenant=tenant,
                    server=server
                )
                db.add(m)

            if res_type == "pool":
                hs_status = metrics.get("avi_l4_server_avg_health_status", 0.0)
                uptime = metrics.get("avi_l4_server_avg_uptime", 0.0)
                complete = metrics.get("avi_l7_server_avg_pool_complete_responses", 0.0)
                errors = metrics.get("avi_l7_server_avg_pool_error_responses", 0.0)
                conns = metrics.get("avi_l4_server_avg_pool_new_established_conns", 0.0)
                bw = metrics.get("avi_l4_server_avg_pool_bandwidth", 0.0)

                stmt = select(Pool).where(Pool.uuid == uuid, Pool.server == server)
                res = await db.execute(stmt)
                pool = res.scalar_one_or_none()

                status = "UP" if health_score > 50 or hs_status >= 100 else "DOWN"

                if pool:
                    pool.health_score = health_score
                    pool.performance_score = perf_score
                    pool.health_status = hs_status
                    pool.uptime = uptime
                    pool.avg_complete_responses = complete
                    pool.avg_error_responses = errors
                    pool.new_connections = conns
                    pool.bandwidth = bw
                    pool.status = status
                else:
                    pool = Pool(
                        uuid=uuid, name=name, tenant=tenant, server=server,
                        health_score=health_score, performance_score=perf_score,
                        health_status=hs_status, uptime=uptime,
                        avg_complete_responses=complete, avg_error_responses=errors,
                        new_connections=conns, bandwidth=bw, status=status
                    )
                    db.add(pool)

                if health_score < 50 and health_score > 0:
                    alert = ADCAlert(
                        component="POOL",
                        component_name=name,
                        alert_type="POOL_HEALTH_LOW",
                        severity="WARNING",
                        message=f"Pool {name} (server {server}) health score is {health_score}"
                    )
                    db.add(alert)

            elif res_type == "virtualservice":
                active_se = int(metrics.get("avi_l4_client_max_num_active_se", 0))
                status = "UP" if health_score >= 50 else "DOWN"

                stmt = select(VirtualService).where(VirtualService.uuid == uuid)
                res = await db.execute(stmt)
                vs = res.scalar_one_or_none()

                if vs:
                    vs.health_score = health_score
                    vs.performance_score = perf_score
                    vs.security_penalty = sec_penalty
                    vs.resources_penalty = res_penalty
                    vs.anomaly_penalty = anom_penalty
                    vs.active_se_count = active_se
                    vs.status = status
                else:
                    vs = VirtualService(
                        uuid=uuid, name=name, tenant=tenant,
                        health_score=health_score, performance_score=perf_score,
                        security_penalty=sec_penalty, resources_penalty=res_penalty,
                        anomaly_penalty=anom_penalty, active_se_count=active_se,
                        status=status
                    )
                    db.add(vs)

                if health_score < 50 and health_score > 0:
                    alert = ADCAlert(
                        component="VIRTUAL_SERVICE",
                        component_name=name,
                        alert_type="VS_HEALTH_LOW",
                        severity="CRITICAL",
                        message=f"Virtual Service {name} health score critically low: {health_score}"
                    )
                    db.add(alert)

    elif filename.endswith(".csv"):
        parse_result = IngestionEngine.parse_file(content, file.filename, EXPECTED_SCHEMAS)
        if not parse_result.get("success"):
            raise HTTPException(status_code=400, detail=parse_result.get("error", "Failed to parse CSV"))

        schema = parse_result["schema_detected"]
        records = parse_result["data"]
        log_entry.total_rows = parse_result["total_rows"]
        log_entry.valid_rows = parse_result["valid_rows"]
        log_entry.invalid_rows = parse_result["invalid_rows"]
        log_entry.duplicates = parse_result["duplicates"]
        log_entry.quality_score = parse_result["quality_score"]
        log_entry.confidence_level = parse_result["confidence_level"]
        log_entry.error_summary = parse_result["error_summary"]

        if schema == "load_balancer_report":
            for rec in records:
                app_id = rec.get("app_id")
                pool_name = rec.get("pool")
                if not app_id or not pool_name:
                    continue

                stmt = select(PoolMembership).where(
                    PoolMembership.app_id == app_id,
                    PoolMembership.pool_name == pool_name
                )
                res = await db.execute(stmt)
                existing = res.scalar_one_or_none()

                enabled_val = rec.get("enabled", "1")
                enabled = str(enabled_val).strip() in ("1", "true", "True", "yes")

                if existing:
                    existing.enabled = enabled
                    existing.tenant = rec.get("tenant")
                    existing.controller = rec.get("controller")
                    existing.site = rec.get("site")
                    existing.zone = rec.get("zone")
                else:
                    pm = PoolMembership(
                        app_id=app_id,
                        pool_name=pool_name,
                        tenant=rec.get("tenant"),
                        controller=rec.get("controller"),
                        site=rec.get("site"),
                        zone=rec.get("zone"),
                        enabled=enabled
                    )
                    db.add(pm)
    else:
        raise HTTPException(status_code=400, detail="Unsupported file type. Use .json or .csv")

    await db.commit()
    return {
        "success": True,
        "message": f"Successfully processed {file.filename}",
        "rows_ingested": log_entry.valid_rows
    }


@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    vs_cnt = await db.execute(select(func.count(VirtualService.id)))
    pool_cnt = await db.execute(select(func.count(Pool.id)))
    pm_cnt = await db.execute(select(func.count(PoolMembership.id)))
    alert_cnt = await db.execute(select(func.count(ADCAlert.id)).where(ADCAlert.resolved == False))

    return {
        "virtual_services_count": vs_cnt.scalar() or 0,
        "pools_count": pool_cnt.scalar() or 0,
        "pool_memberships_count": pm_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }


@router.get("/virtual-services")
async def get_virtual_services(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(VirtualService))
    vss = res.scalars().all()
    return [
        {
            "id": vs.id, "uuid": vs.uuid, "name": vs.name, "tenant": vs.tenant,
            "health_score": vs.health_score, "performance_score": vs.performance_score,
            "security_penalty": vs.security_penalty, "active_se_count": vs.active_se_count,
            "status": vs.status
        }
        for vs in vss
    ]


@router.get("/pools")
async def get_pools(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Pool))
    pools = res.scalars().all()
    return [
        {
            "id": p.id, "uuid": p.uuid, "name": p.name, "tenant": p.tenant,
            "server": p.server, "health_score": p.health_score,
            "health_status": p.health_status, "uptime": p.uptime,
            "avg_complete_responses": p.avg_complete_responses,
            "avg_error_responses": p.avg_error_responses, "status": p.status
        }
        for p in pools
    ]


@router.get("/pool-memberships")
async def get_pool_memberships(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PoolMembership))
    return res.scalars().all()


@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    vs_res = await db.execute(select(VirtualService))
    vss = vs_res.scalars().all()

    pool_res = await db.execute(select(Pool))
    pools = pool_res.scalars().all()

    pm_res = await db.execute(select(PoolMembership))
    pms = pm_res.scalars().all()

    nodes = []
    edges = []

    seen_pools = set()
    for vs in vss:
        nodes.append({"id": f"vs:{vs.uuid}", "label": vs.name, "type": "virtual_service", "status": vs.status, "health_score": vs.health_score})

    for p in pools:
        key = p.name
        if key not in seen_pools:
            seen_pools.add(key)
            nodes.append({"id": f"pool:{p.name}", "label": p.name, "type": "pool", "status": p.status, "health_score": p.health_score})

    for pm in pms:
        nodes.append({"id": f"app:{pm.app_id}", "label": pm.app_id, "type": "application", "status": "ENABLED" if pm.enabled else "DISABLED"})
        edges.append({"source": f"app:{pm.app_id}", "target": f"pool:{pm.pool_name}", "type": "routes_to"})

    return {"nodes": nodes, "edges": edges}


@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ADCAlert).where(ADCAlert.resolved == False))
    return res.scalars().all()


@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    vs_res = await db.execute(select(VirtualService))
    vss = vs_res.scalars().all()

    pool_res = await db.execute(select(Pool))
    pools = pool_res.scalars().all()

    avg_vs_health = sum(v.health_score for v in vss) / len(vss) if vss else 0.0
    avg_pool_health = sum(p.health_score for p in pools) / len(pools) if pools else 0.0
    down_vs = [v.name for v in vss if v.status == "DOWN"]
    down_pools = [p.name for p in pools if p.status == "DOWN"]

    return {
        "virtual_services_count": len(vss),
        "pools_count": len(pools),
        "avg_virtual_service_health": round(avg_vs_health, 2),
        "avg_pool_health": round(avg_pool_health, 2),
        "down_virtual_services": down_vs,
        "down_pools": down_pools
    }


@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    vs_res = await db.execute(select(VirtualService))
    vss = vs_res.scalars().all()
    vs_down = [v.name for v in vss if v.status == "DOWN"]

    pool_res = await db.execute(select(Pool))
    pools = pool_res.scalars().all()
    pool_down = [p.name for p in pools if p.status == "DOWN"]
    pool_degraded = [p.name for p in pools if 0 < p.health_score < 50]

    alerts_res = await db.execute(select(ADCAlert).where(ADCAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if vs_down:
        score -= len(vs_down) * 20.0
        criticals.append(f"Virtual Services currently DOWN: {', '.join(vs_down)}")
        recs.append(f"Investigate SE placement and health check config for: {', '.join(vs_down)}")

    if pool_down:
        score -= len(pool_down) * 15.0
        criticals.append(f"Server Pools with DOWN status: {', '.join(pool_down)}")
        recs.append(f"Check backend server availability for pools: {', '.join(pool_down)}")

    if pool_degraded:
        score -= len(pool_degraded) * 5.0
        warnings.append(f"Pools with degraded health scores: {', '.join(pool_degraded)}")
        recs.append(f"Review health check configuration for: {', '.join(pool_degraded)}")

    score = max(0.0, score)

    return build_ai_context(
        connector_name="adc-loadbalancer",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"ADC connector monitors {len(vss)} virtual services and {len(pools)} server pool members.",
        active_alerts=[a.message for a in alerts],
        drift_analysis={"down_virtual_services": vs_down, "down_pools": pool_down, "degraded_pools": pool_degraded},
        sla_status={"availability_score": score, "vs_sla_ok": len(vs_down) == 0}
    )
