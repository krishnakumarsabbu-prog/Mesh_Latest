from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import Dashboard, DataSource, IngestionLog

router = APIRouter()

def get_db():
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "grafana-service", "timestamp": datetime.utcnow().isoformat()}

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    dashboards = await db.execute(select(func.count(Dashboard.id)))
    datasources = await db.execute(select(func.count(DataSource.id)))
    ds_errors = await db.execute(select(func.count(DataSource.id)).where(DataSource.status != "OK"))
    return {
        "dashboards_count": dashboards.scalar() or 0,
        "datasources_count": datasources.scalar() or 0,
        "active_alerts_count": ds_errors.scalar() or 0
    }

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    res_ds = await db.execute(select(DataSource))
    dss = res_ds.scalars().all()
    
    res_db = await db.execute(select(Dashboard))
    dbs = res_db.scalars().all()
    
    nodes = [{"id": "grafana:server", "label": "Grafana Server", "type": "visualization", "status": "ONLINE"}]
    edges = []
    
    for ds in dss:
        nodes.append({"id": f"ds:{ds.name}", "label": f"{ds.name} ({ds.ds_type})", "type": "datasource", "status": ds.status})
        edges.append({"source": f"ds:{ds.name}", "target": "grafana:server", "type": "feeds"})
        
    for d in dbs:
        nodes.append({"id": f"dashboard:{d.uid}", "label": d.title, "type": "dashboard", "status": d.status})
        edges.append({"source": "grafana:server", "target": f"dashboard:{d.uid}", "type": "renders"})
        
    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(DataSource).where(DataSource.status != "OK"))
    dss = res.scalars().all()
    alerts = []
    for ds in dss:
        alerts.append({
            "component": "DATASOURCE",
            "component_name": ds.name,
            "alert_type": "DATASOURCE_DISCONNECTED",
            "severity": "CRITICAL",
            "message": f"CRITICAL: DataSource {ds.name} connection test failed!"
        })
    return alerts

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    res_ds = await db.execute(select(DataSource))
    dss = res_ds.scalars().all()
    broken_ds = [ds.name for ds in dss if ds.status != "OK"]
    
    score = 100.0
    criticals = []
    warnings = []
    recs = []
    
    if broken_ds:
        score -= len(broken_ds) * 30.0
        criticals.append(f"Grafana data sources are DISCONNECTED: {', '.join(broken_ds)}")
        recs.append(f"Verify credentials and network tunnels for datasources: {', '.join(broken_ds)}")
        
    score = max(0.0, score)
    
    return build_ai_context(
        connector_name="grafana",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"Grafana dashboard builder registers {len(dss)} datasources.",
        active_alerts=[f"DataSource {d} connection failure alert" for d in broken_ds],
        drift_analysis={"broken_datasources": broken_ds},
        sla_status={"grafana_sla_ok": len(broken_ds) == 0, "health_score": score}
    )
