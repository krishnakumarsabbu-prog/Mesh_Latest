from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import PCFApp, DiegoCell, IngestionLog

router = APIRouter()

def get_db():
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "pcf-service", "timestamp": datetime.utcnow().isoformat()}

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    apps = await db.execute(select(func.count(PCFApp.id)))
    cells = await db.execute(select(func.count(DiegoCell.id)))
    crashed = await db.execute(select(func.count(PCFApp.id)).where(PCFApp.status == "CRASHED"))
    return {
        "apps_count": apps.scalar() or 0,
        "cells_count": cells.scalar() or 0,
        "active_alerts_count": crashed.scalar() or 0
    }

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    res_apps = await db.execute(select(PCFApp))
    apps = res_apps.scalars().all()
    
    res_cells = await db.execute(select(DiegoCell))
    cells = res_cells.scalars().all()
    
    nodes = [{"id": "pcf:cc", "label": "PCF Cloud Controller", "type": "controller", "status": "ONLINE"}]
    edges = []
    
    for c in cells:
        nodes.append({"id": f"cell:{c.cell_id}", "label": f"Diego Cell {c.cell_id}", "type": "host", "status": c.status})
        edges.append({"source": "pcf:cc", "target": f"cell:{c.cell_id}", "type": "manages"})
        
    for a in apps:
        nodes.append({"id": f"app:{a.name}", "label": f"{a.name} ({a.instances_running}/{a.instances_desired} instances)", "type": "application", "status": a.status})
        # Mock mapping app to Diego cells
        edges.append({"source": "cell:diego-cell-01", "target": f"app:{a.name}", "type": "runs"})
        
    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(PCFApp).where(PCFApp.status == "CRASHED"))
    apps = res.scalars().all()
    alerts = []
    for a in apps:
        alerts.append({
            "component": "APPLICATION",
            "component_name": a.name,
            "alert_type": "CONTAINER_CRASHED",
            "severity": "CRITICAL",
            "message": f"CRITICAL: PCF Application {a.name} crashed! Zero instances running."
        })
    return alerts

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    res_apps = await db.execute(select(PCFApp))
    apps = res_apps.scalars().all()
    crashed_apps = [a.name for a in apps if a.status == "CRASHED"]
    
    score = 100.0
    criticals = []
    warnings = []
    recs = []
    
    if crashed_apps:
        score -= len(crashed_apps) * 25.0
        criticals.append(f"PCF Application instances have CRASHED: {', '.join(crashed_apps)}")
        recs.append(f"Scale crashed PCF apps using 'cf restage' or inspect container startup crash logs: {', '.join(crashed_apps)}")
        
    score = max(0.0, score)
    
    return build_ai_context(
        connector_name="pcf",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"Pivotal Cloud Foundry Diego cells host {len(apps)} applications.",
        active_alerts=[f"App {a} crashed container instances alert" for a in crashed_apps],
        drift_analysis={"crashed_apps": crashed_apps},
        sla_status={"pcf_sla_ok": len(crashed_apps) == 0, "health_score": score}
    )
