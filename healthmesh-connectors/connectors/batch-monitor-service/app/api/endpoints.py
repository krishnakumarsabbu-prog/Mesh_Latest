from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import BatchJob, BatchExecution, BatchSLA, BatchAlert, IngestionLog

router = APIRouter()

# Schema mapping definitions for Batch Monitor
EXPECTED_SCHEMAS = {
    "batch_report": ["job_name", "status", "schedule", "start_time", "end_time", "duration_seconds", "max_duration_seconds", "error_message"]
}

def get_db(router_dep = None):
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "batch-monitor-service", "timestamp": datetime.utcnow().isoformat()}

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

    if schema == "batch_report":
        for rec in records:
            job_name = rec.get("job_name")
            if not job_name:
                continue

            status = str(rec.get("status") or "SUCCESS").upper()
            sched = rec.get("schedule") or "0 0 * * *"
            dur = int(rec.get("duration_seconds") or 0)
            max_dur = int(rec.get("max_duration_seconds") or 3600)
            err_msg = rec.get("error_message")

            # Ensure Job
            stmt = select(BatchJob).where(BatchJob.name == job_name)
            res = await db.execute(stmt)
            job = res.scalar_one_or_none()

            job_status = "FAILING" if status == "FAILED" else "ACTIVE"
            if job:
                job.status = job_status
                job.schedule = sched
            else:
                job = BatchJob(name=job_name, status=job_status, schedule=sched)
                db.add(job)

            # Ensure SLA configuration
            stmt = select(BatchSLA).where(BatchSLA.job_name == job_name)
            res = await db.execute(stmt)
            sla = res.scalar_one_or_none()
            if not sla:
                sla = BatchSLA(job_name=job_name, max_duration_seconds=max_dur)
                db.add(sla)
            else:
                sla.max_duration_seconds = max_dur

            # Record execution
            st_str = rec.get("start_time")
            et_str = rec.get("end_time")
            st = datetime.strptime(st_str, "%Y-%m-%d %H:%M:%S") if st_str else datetime.utcnow()
            et = datetime.strptime(et_str, "%Y-%m-%d %H:%M:%S") if et_str else None

            exec_record = BatchExecution(
                job_name=job_name,
                status=status,
                start_time=st,
                end_time=et,
                duration_seconds=dur,
                error_message=err_msg
            )
            db.add(exec_record)

            # Alerts
            if status == "FAILED":
                alert = BatchAlert(
                    component="JOB",
                    component_name=job_name,
                    alert_type="JOB_FAILED",
                    severity="CRITICAL",
                    message=f"CRITICAL: Batch Job {job_name} failed with error: {err_msg or 'Unknown Error'}!"
                )
                db.add(alert)

            if dur > max_dur:
                alert = BatchAlert(
                    component="EXECUTION",
                    component_name=job_name,
                    alert_type="SLA_BREACH",
                    severity="WARNING",
                    message=f"Batch execution SLA Breach for {job_name}: Duration was {dur}s, exceeding {max_dur}s SLA limit!"
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
    j_cnt = await db.execute(select(func.count(BatchJob.id)))
    e_cnt = await db.execute(select(func.count(BatchExecution.id)))
    alert_cnt = await db.execute(select(func.count(BatchAlert.id)).where(BatchAlert.resolved == False))
    
    return {
        "jobs_count": j_cnt.scalar() or 0,
        "executions_count": e_cnt.scalar() or 0,
        "active_alerts_count": alert_cnt.scalar() or 0
    }

@router.get("/jobs")
async def get_jobs(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BatchJob))
    return res.scalars().all()

@router.get("/executions")
async def get_executions(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BatchExecution))
    return res.scalars().all()

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(BatchAlert).where(BatchAlert.resolved == False))
    return res.scalars().all()

@router.get("/analytics")
async def get_analytics(db: AsyncSession = Depends(get_db)):
    exec_res = await db.execute(select(BatchExecution))
    execs = exec_res.scalars().all()

    tot_runs = len(execs)
    failed_runs = sum(1 for e in execs if e.status == "FAILED")
    avg_dur = sum(e.duration_seconds for e in execs) / tot_runs if tot_runs > 0 else 0.0

    return {
        "total_executions": tot_runs,
        "failed_executions": failed_runs,
        "average_duration_seconds": avg_dur,
        "success_rate_percentage": round((tot_runs - failed_runs) / tot_runs * 100.0, 2) if tot_runs > 0 else 100.0
    }

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    job_res = await db.execute(select(BatchJob))
    jobs = job_res.scalars().all()
    failing_jobs = [j.name for j in jobs if j.status == "FAILING"]

    exec_res = await db.execute(select(BatchExecution).order_by(BatchExecution.start_time.desc()).limit(20))
    executions = exec_res.scalars().all()
    delayed_runs = [e.job_name for e in executions if e.status == "DELAYED"]

    alerts_res = await db.execute(select(BatchAlert).where(BatchAlert.resolved == False))
    alerts = alerts_res.scalars().all()

    sla_breaches = [a.component_name for a in alerts if a.alert_type == "SLA_BREACH"]

    score = 100.0
    criticals = []
    warnings = []
    recs = []

    if failing_jobs:
        score -= len(failing_jobs) * 20.0
        criticals.append(f"Operational Batch Jobs are FAILING: {', '.join(failing_jobs)}")
        recs.append(f"Re-run failed batch steps and trace scheduler trigger events for: {', '.join(failing_jobs)}")

    if delayed_runs:
        score -= len(delayed_runs) * 8.0
        warnings.append(f"Batch executions currently delayed or stalled: {', '.join(delayed_runs)}")
        recs.append(f"Inspect batch worker resource allocations or database write blockers for: {', '.join(delayed_runs)}")

    if sla_breaches:
        score -= len(sla_breaches) * 10.0
        warnings.append(f"Batch runs exceeded execution time SLA: {', '.join(sla_breaches)}")
        recs.append(f"Tune queries, index tables, or scale thread pools for delayed SLA jobs: {', '.join(sla_breaches)}")

    score = max(0.0, score)
    topology_desc = f"Batch Monitor tracking {len(jobs)} scheduled operations, with a recorded log of {len(executions)} recent run executions."

    return build_ai_context(
        connector_name="batch-monitor",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=topology_desc,
        active_alerts=[a.message for a in alerts],
        drift_analysis={"failed_jobs": failing_jobs, "delayed_jobs": delayed_runs, "sla_violations": sla_breaches},
        sla_status={"batch_pipeline_adherence": len(failing_jobs) == 0, "batch_score": score}
    )
