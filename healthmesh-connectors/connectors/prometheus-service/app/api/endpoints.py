from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import ScrapeTarget, ActiveAlert, IngestionLog

router = APIRouter()

def get_db():
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "prometheus-service", "timestamp": datetime.utcnow().isoformat()}

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    targets = await db.execute(select(func.count(ScrapeTarget.id)))
    alerts = await db.execute(select(func.count(ActiveAlert.id)).where(ActiveAlert.resolved == False))
    return {
        "targets_count": targets.scalar() or 0,
        "active_alerts_count": alerts.scalar() or 0
    }

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ScrapeTarget))
    targets = res.scalars().all()
    
    nodes = [{"id": "prometheus:master", "label": "Prometheus Server", "type": "server", "status": "ONLINE"}]
    edges = []
    
    for t in targets:
        nodes.append({"id": f"target:{t.instance}", "label": f"{t.job_name} ({t.instance})", "type": "target", "status": t.status})
        edges.append({"source": "prometheus:master", "target": f"target:{t.instance}", "type": "scrapes"})
        
    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ActiveAlert).where(ActiveAlert.resolved == False))
    return res.scalars().all()

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ScrapeTarget))
    targets = res.scalars().all()
    down_targets = [t.instance for t in targets if t.status != "UP"]
    
    res_alerts = await db.execute(select(ActiveAlert).where(ActiveAlert.resolved == False))
    alerts = res_alerts.scalars().all()
    
    score = 100.0
    criticals = []
    warnings = []
    recs = []
    
    if down_targets:
        score -= len(down_targets) * 20.0
        criticals.append(f"Prometheus scrape targets are DOWN: {', '.join(down_targets)}")
        recs.append(f"Verify endpoint health for failing scrape targets: {', '.join(down_targets)}")
        
    if alerts:
        score -= len(alerts) * 5.0
        warnings.append(f"Prometheus active alerting rules triggered: {len(alerts)} alerts active")
        recs.append("Check individual Alertmanager notifications to inspect target service metrics.")
        
    score = max(0.0, score)
    
    return build_ai_context(
        connector_name="prometheus",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"Prometheus monitoring is scraping {len(targets)} active targets.",
        active_alerts=[a.message for a in alerts],
        drift_analysis={"offline_targets": down_targets},
        sla_status={"prometheus_sla_ok": len(down_targets) == 0, "health_score": score}
    )
