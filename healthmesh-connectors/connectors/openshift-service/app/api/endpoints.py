from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import OCPCluster, OCPNamespace, OCPPod, OCPDeployment, OCPPodMetric, OCPAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for OpenShift
EXPECTED_SCHEMAS = {
    "pod_info": ["cluster_name", "namespace_name", "pod_name", "deployment_name", "status", "ip_address", "restart_count", "cpu_usage_cores", "memory_usage_bytes", "replicas", "available_replicas"]
}

def get_db(router_dep = None):
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "openshift-service", "timestamp": datetime.utcnow().isoformat()}

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

    if schema == "pod_info":
        for rec in records:
            c_name = rec.get("cluster_name") or "ocp-prod-01"
            ns_name = rec.get("namespace_name") or "patient-portal-prod"
            pod_name = rec.get("pod_name")
            deploy_name = rec.get("deployment_name")

            if not pod_name:
                continue

            # Ensure Cluster
            stmt = select(OCPCluster).where(OCPCluster.name == c_name)
            res = await db.execute(stmt)
            cl = res.scalar_one_or_none()
            if not cl:
                cl = OCPCluster(name=c_name, status="READY", node_count=6)
                db.add(cl)

            # Ensure Namespace
            stmt = select(OCPNamespace).where(OCPNamespace.name == ns_name)
            res = await db.execute(stmt)
            ns = res.scalar_one_or_none()
            if not ns:
                ns = OCPNamespace(cluster_name=c_name, name=ns_name, status="ACTIVE")
                db.add(ns)

            # Ensure Pod
            status = str(rec.get("status", "RUNNING")).upper()
            restarts = int(rec.get("restart_count") or 0)
            
            stmt = select(OCPPod).where(OCPPod.name == pod_name)
            res = await db.execute(stmt)
            p = res.scalar_one_or_none()

            if p:
                p.status = status
                p.restart_count = restarts
                p.ip_address = rec.get("ip_address") or p.ip_address
            else:
                p = OCPPod(
                    namespace_name=ns_name,
                    name=pod_name,
                    status=status,
                    ip_address=rec.get("ip_address"),
                    restart_count=restarts
                )
                db.add(p)

            # Ensure Deployment
            if deploy_name:
                req_repl = int(rec.get("replicas") or 2)
                av_repl = int(rec.get("available_replicas") or 2)
                stmt = select(OCPDeployment).where(OCPDeployment.name == deploy_name, OCPDeployment.namespace_name == ns_name)
                res = await db.execute(stmt)
                dep = res.scalar_one_or_none()

                if dep:
                    dep.replicas = req_repl
                    dep.available_replicas = av_repl
                else:
                    dep = OCPDeployment(
                        namespace_name=ns_name,
                        name=deploy_name,
                        replicas=req_repl,
                        available_replicas=av_repl
                    )
                    db.add(dep)

                # Flag replicas mismatch
                if req_repl != av_repl:
                    alert = OCPAlert(
                        component="DEPLOYMENT",
                        component_name=deploy_name,
                        alert_type="REPLICA_MISMATCH",
                        severity="WARNING",
                        message=f"Deployment {deploy_name} is degraded: {av_repl}/{req_repl} pods ready!"
                    )
                    db.add(alert)

            # Pod Metrics
            cpu = float(rec.get("cpu_usage_cores") or 0.05)
            mem = int(rec.get("memory_usage_bytes") or 134217728) # 128MB
            metric = OCPPodMetric(
                pod_name=pod_name,
                cpu_usage_cores=cpu,
                memory_usage_bytes=mem
            )
            db.add(metric)

            # Crash alerts
            if status in ["FAILED", "CRASH_LOOP_BACK_OFF"]:
                alert = OCPAlert(
                    component="POD",
                    component_name=pod_name,
                    alert_type="POD_CRASHING",
                    severity="CRITICAL",
                    message=f"Pod {pod_name} is crashing with status: {status}."
                )
                db.add(alert)

            if restarts > 10:
                alert = OCPAlert(
                    component="POD",
                    component_name=pod_name,
                    alert_type="POD_RESTARTS",
                    severity="WARNING",
                    message=f"Pod {pod_name} has restarted {restarts} times in the last hour!"
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
    c_cnt = await db.execute(select(func.count(OCPCluster.id)))
    ns_cnt = await db.execute(select(func.count(OCPNamespace.id)))
    p_cnt = await db.execute(select(func.count(OCPPod.id)))
    alert_cnt = await db.execute(select(func.count(OCPAlert.id)).where(OCPAlert.resolved == False))
    
    return {
        "clusters_count": c_cnt.scalar() or 0,
        "namespaces_count": ns_cnt.scalar() or 0,
        "pods_count": p_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/pods")
async def get_pods(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(OCPPod))
    return res.scalars().all()

@router.get("/deployments")
async def get_deployments(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(OCPDeployment))
    return res.scalars().all()

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    cl_res = await db.execute(select(OCPCluster))
    cls = cl_res.scalars().all()

    ns_res = await db.execute(select(OCPNamespace))
    nss = ns_res.scalars().all()

    dep_res = await db.execute(select(OCPDeployment))
    deps = dep_res.scalars().all()

    pod_res = await db.execute(select(OCPPod))
    pods = pod_res.scalars().all()
    
    nodes = []
    edges = []

    for c in cls:
        nodes.append({"id": f"cluster:{c.name}", "label": c.name, "type": "cluster", "status": c.status})

    for ns in nss:
        nodes.append({"id": f"namespace:{ns.name}", "label": ns.name, "type": "namespace", "status": ns.status})
        edges.append({"source": f"cluster:{ns.cluster_name}", "target": f"namespace:{ns.name}", "type": "contains"})

    for d in deps:
        nodes.append({"id": f"deployment:{d.name}", "label": d.name, "type": "deployment", "status": "READY" if d.available_replicas == d.replicas else "WARNING"})
        edges.append({"source": f"namespace:{d.namespace_name}", "target": f"deployment:{d.name}", "type": "hosts"})

    for p in pods:
        nodes.append({"id": f"pod:{p.name}", "label": p.name, "type": "pod", "status": p.status})
        
        # Standard OCP Pod names have deployment name prefixes, associate pod with deployment
        for d in deps:
            if p.name.startswith(d.name):
                edges.append({"source": f"deployment:{d.name}", "target": f"pod:{p.name}", "type": "manages"})
                break
        else:
            edges.append({"source": f"namespace:{p.namespace_name}", "target": f"pod:{p.name}", "type": "contains"})

    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(OCPAlert).where(OCPAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    metrics_res = await db.execute(select(OCPPodMetric).order_by(OCPPodMetric.timestamp.desc()).limit(100))
    metrics = metrics_res.scalars().all()

    avg_cpu = sum(m.cpu_usage_cores for m in metrics) / len(metrics) if metrics else 0.0
    avg_mem_mb = (sum(m.memory_usage_bytes for m in metrics) / len(metrics) / (1024*1024)) if metrics else 0.0

    return {
        "average_cpu_cores": avg_cpu,
        "average_memory_usage_mb": avg_mem_mb,
        "data_points": len(metrics)
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    c_res = await db.execute(select(OCPCluster))
    cls = c_res.scalars().all()

    pods_res = await db.execute(select(OCPPod))
    pods = pods_res.scalars().all()
    crashing = [p.name for p in pods if p.status in ["FAILED", "CRASH_LOOP_BACK_OFF"]]
    restarting = [p.name for p in pods if p.restart_count > 10]

    dep_res = await db.execute(select(OCPDeployment))
    deps = dep_res.scalars().all()
    degraded = [d.name for d in deps if d.replicas != d.available_replicas]

    alerts_res = await db.execute(select(OCPAlert).where(OCPAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if crashing:
        score -= len(crashing) * 15.0
        criticals.append(f"OpenShift pods currently crashing (CrashLoopBackOff/Failed): {', '.join(crashing)}")
        recs.append(f"Investigate pod logs and configurations for: {', '.join(crashing)}")

    if degraded:
        score -= len(degraded) * 10.0
        warnings.append(f"Deployments with unavailable replicas / degraded scaling: {', '.join(degraded)}")
        recs.append(f"Scale up or fix node constraints on deployments: {', '.join(degraded)}")

    if restarting:
        score -= len(restarting) * 5.0
        warnings.append(f"Pods experiencing rapid restart behaviors: {', '.join(restarting)}")
        recs.append(f"Increase resource limits or check health probes for pods: {', '.join(restarting)}")

    score = max(0.0, score)
    topology_desc = f"OpenShift Connector monitoring {len(cls)} Kubernetes clusters, {len(pods)} pods in runtime."

    return build_ai_context(
        connector_name="openshift",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"crashing_pods": crashing, "degraded_deployments": degraded},
        sla_status={"pod_availability_sla": len(crashing) == 0, "overall_workload_score": score}
    )
