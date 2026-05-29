from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import QueueManager, Queue, Channel, QueueMetric, MQAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for IBM MQ
EXPECTED_SCHEMAS = {
    "qmgr_status": ["queue_manager_name", "status", "host", "port", "channel_count", "queue_count"],
    "queue_depth": ["queue_name", "queue_manager_name", "current_depth", "max_depth", "open_input_count", "open_output_count"]
}

# We will pass the db_manager dependency
def get_db(router_dep = None):
    # This will be overridden or injected in main
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "ibm-mq-service", "timestamp": datetime.utcnow().isoformat()}

@router.post("/upload")
async def upload_telemetry(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    content = await file.read()
    parse_result = IngestionEngine.parse_file(content, file.filename, EXPECTED_SCHEMAS)
    
    if not parse_result.get("success"):
        raise HTTPException(status_code=400, detail=parse_result.get("error", "Failed to parse file"))

    # Log ingestion
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

    # Insert entities based on schema
    schema = parse_result["schema_detected"]
    records = parse_result["data"]

    if schema == "qmgr_status":
        for rec in records:
            qmgr_name = rec.get("queue_manager_name") or rec.get("name")
            if not qmgr_name:
                continue
            # Check if exists
            stmt = select(QueueManager).where(QueueManager.name == qmgr_name)
            res = await db.execute(stmt)
            qmgr = res.scalar_one_or_none()
            
            status = rec.get("status", "RUNNING").upper()
            if qmgr:
                qmgr.status = status
                qmgr.host = rec.get("host") or qmgr.host
                qmgr.port = int(rec.get("port")) if rec.get("port") else qmgr.port
                qmgr.channel_count = int(rec.get("channel_count")) if rec.get("channel_count") else qmgr.channel_count
                qmgr.queue_count = int(rec.get("queue_count")) if rec.get("queue_count") else qmgr.queue_count
            else:
                qmgr = QueueManager(
                    name=qmgr_name,
                    status=status,
                    host=rec.get("host"),
                    port=int(rec.get("port")) if rec.get("port") else 1414,
                    channel_count=int(rec.get("channel_count")) if rec.get("channel_count") else 0,
                    queue_count=int(rec.get("queue_count")) if rec.get("queue_count") else 0
                )
                db.add(qmgr)
            
            # Generate alert if stopped
            if status == "STOPPED":
                alert = MQAlert(
                    component="QMGR",
                    component_name=qmgr_name,
                    alert_type="QMGR_DOWN",
                    severity="CRITICAL",
                    message=f"Queue Manager {qmgr_name} is in STOPPED state."
                )
                db.add(alert)

    elif schema == "queue_depth":
        for rec in records:
            q_name = rec.get("queue_name") or rec.get("name")
            qmgr_name = rec.get("queue_manager_name")
            if not q_name or not qmgr_name:
                continue
            
            depth = int(rec.get("current_depth") or rec.get("depth") or 0)
            max_d = int(rec.get("max_depth") or 5000)
            open_in = int(rec.get("open_input_count") or 0)
            open_out = int(rec.get("open_output_count") or 0)
            backlog = depth > (max_d * 0.8) # >80% is backlog

            # Check if exists
            stmt = select(Queue).where(Queue.name == q_name, Queue.queue_manager_name == qmgr_name)
            res = await db.execute(stmt)
            q = res.scalar_one_or_none()

            if q:
                q.current_depth = depth
                q.max_depth = max_d
                q.open_input_count = open_in
                q.open_output_count = open_out
                q.backlog_detected = backlog
            else:
                q = Queue(
                    name=q_name,
                    queue_manager_name=qmgr_name,
                    current_depth=depth,
                    max_depth=max_d,
                    open_input_count=open_in,
                    open_output_count=open_out,
                    backlog_detected=backlog
                )
                db.add(q)

            # Record metric
            metric = QueueMetric(
                queue_name=q_name,
                queue_manager_name=qmgr_name,
                depth=depth,
                msg_in_rate=float(rec.get("msg_in_rate") or 12.5),
                msg_out_rate=float(rec.get("msg_out_rate") or 10.2)
            )
            db.add(metric)

            # Generate alert for backlog
            if backlog:
                alert = MQAlert(
                    component="QUEUE",
                    component_name=q_name,
                    alert_type="DEPTH_HIGH",
                    severity="WARNING",
                    message=f"Queue {q_name} backlog detected: depth={depth}/{max_d}."
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
    qmgr_cnt = await db.execute(select(func.count(QueueManager.id)))
    q_cnt = await db.execute(select(func.count(Queue.id)))
    c_cnt = await db.execute(select(func.count(Channel.id)))
    alert_cnt = await db.execute(select(func.count(MQAlert.id)).where(MQAlert.resolved == False))
    
    return {
        "queue_managers_count": qmgr_cnt.scalar() or 0,
        "queues_count": q_cnt.scalar() or 0,
        "channels_count": c_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/queues")
async def get_queues(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Queue))
    return res.scalars().all()

@router.get("/channels")
async def get_channels(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(Channel))
    return res.scalars().all()

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    # Returns links between Queue Managers, Queues, and Channels
    qmgr_res = await db.execute(select(QueueManager))
    q_res = await db.execute(select(Queue))
    c_res = await db.execute(select(Channel))

    qmgrs = qmgr_res.scalars().all()
    queues = q_res.scalars().all()
    channels = c_res.scalars().all()

    nodes = []
    edges = []

    for qm in qmgrs:
        nodes.append({"id": f"qmgr:{qm.name}", "label": qm.name, "type": "queue_manager", "status": qm.status})

    for q in queues:
        nodes.append({"id": f"queue:{q.name}", "label": q.name, "type": "queue", "status": "ALERT" if q.backlog_detected else "OK"})
        edges.append({"source": f"qmgr:{q.queue_manager_name}", "target": f"queue:{q.name}", "type": "hosts"})

    for ch in channels:
        nodes.append({"id": f"channel:{ch.name}", "label": ch.name, "type": "channel", "status": ch.status})
        edges.append({"source": f"qmgr:{ch.queue_manager_name}", "target": f"channel:{ch.name}", "type": "channels"})

    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(MQAlert).where(MQAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    # Calculate queue backlog ratios, message rate totals, etc.
    metrics_res = await db.execute(select(QueueMetric).order_by(QueueMetric.timestamp.desc()).limit(100))
    metrics = metrics_res.scalars().all()

    tot_in = sum(m.msg_in_rate for m in metrics)
    tot_out = sum(m.msg_out_rate for m in metrics)
    avg_depth = sum(m.depth for m in metrics) / len(metrics) if metrics else 0.0

    return {
        "average_queue_depth": avg_depth,
        "total_incoming_message_rate": tot_in,
        "total_outgoing_message_rate": tot_out,
        "data_points": len(metrics)
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    # Calculate operational metrics
    qmgr_res = await db.execute(select(QueueManager))
    qmgrs = qmgr_res.scalars().all()
    qmgr_down = [qm.name for qm in qmgrs if qm.status != "RUNNING"]

    q_res = await db.execute(select(Queue))
    queues = q_res.scalars().all()
    q_backlog = [q.name for q in queues if q.backlog_detected]

    alerts_res = await db.execute(select(MQAlert).where(MQAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    # Deduce health score
    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if qmgr_down:
        score -= len(qmgr_down) * 20.0
        criticals.append(f"Queue Managers currently offline: {', '.join(qmgr_down)}")
        recs.append(f"Investigate down Queue Managers: {', '.join(qmgr_down)} immediately.")
    
    if q_backlog:
        score -= len(q_backlog) * 5.0
        warnings.append(f"Queue congestion backlog detected: {', '.join(q_backlog)}")
        recs.append(f"Scale consumers or clear queues with backlog: {', '.join(q_backlog)}")

    score = max(0.0, score)

    topology_desc = f"IBM MQ mesh consists of {len(qmgrs)} Queue Managers, {len(queues)} queues."

    # Format output
    return build_ai_context(
        connector_name="ibm-mq",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"offline_queue_managers": qmgr_down, "backlogged_queues": q_backlog},
        sla_status={"backlog_sla_violation": len(q_backlog) > 0, "uptime_sla_score": score}
    )
