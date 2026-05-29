from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import SplunkIndex, LogExceptionRecord, IngestionLog

router = APIRouter()

def get_db():
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "splunk-service", "timestamp": datetime.utcnow().isoformat()}

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    idxs = await db.execute(select(func.count(SplunkIndex.id)))
    excs = await db.execute(select(func.count(LogExceptionRecord.id)))
    high_excs = await db.execute(select(func.count(LogExceptionRecord.id)).where(LogExceptionRecord.occurrences > 50))
    return {
        "indexes_count": idxs.scalar() or 0,
        "exceptions_count": excs.scalar() or 0,
        "active_alerts_count": high_excs.scalar() or 0
    }

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    res_idx = await db.execute(select(SplunkIndex))
    indexes = res_idx.scalars().all()
    
    res_exc = await db.execute(select(LogExceptionRecord))
    exceptions = res_exc.scalars().all()
    
    nodes = [{"id": "splunk:indexer", "label": "Splunk Indexer Cluster", "type": "indexer", "status": "ONLINE"}]
    edges = []
    
    for idx in indexes:
        nodes.append({"id": f"idx:{idx.name}", "label": f"Index: {idx.name}", "type": "database", "status": idx.status})
        edges.append({"source": "splunk:indexer", "target": f"idx:{idx.name}", "type": "contains"})
        
    for exc in exceptions:
        nodes.append({"id": f"exc:{exc.id}", "label": f"{exc.exception_class} ({exc.occurrences} hits)", "type": "exception", "status": "CRITICAL" if exc.occurrences > 50 else "WARNING"})
        edges.append({"source": f"exc:{exc.id}", "target": f"idx:{exc.index_name}", "type": "logged_in"})
        
    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(LogExceptionRecord).where(LogExceptionRecord.occurrences > 50))
    exceptions = res.scalars().all()
    alerts = []
    for e in exceptions:
        alerts.append({
            "component": "EXCEPTION",
            "component_name": e.exception_class,
            "alert_type": "SPIKE_IN_EXCEPTIONS",
            "severity": "CRITICAL",
            "message": f"SPIKE IN LOGS: Exception {e.exception_class} occurred {e.occurrences} times in index {e.index_name}!"
        })
    return alerts

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    res_exc = await db.execute(select(LogExceptionRecord))
    exceptions = res_exc.scalars().all()
    spiking_excs = [e.exception_class for e in exceptions if e.occurrences > 50]
    
    score = 100.0
    criticals = []
    warnings = []
    recs = []
    
    if spiking_excs:
        score -= len(spiking_excs) * 20.0
        criticals.append(f"Spiking Application Exceptions in Splunk indexes: {', '.join(spiking_excs)}")
        recs.append(f"Examine application stack traces in indexer workspace for exception signatures: {', '.join(spiking_excs)}")
        
    score = max(0.0, score)
    
    return build_ai_context(
        connector_name="splunk",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"Splunk indexer cluster parses {len(exceptions)} active exceptions categories.",
        active_alerts=[f"Spike in logs exception {s} warning" for s in spiking_excs],
        drift_analysis={"spiking_exceptions": spiking_excs},
        sla_status={"splunk_sla_ok": len(spiking_excs) == 0, "health_score": score}
    )
