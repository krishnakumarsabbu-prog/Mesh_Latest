from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import CMDBAsset, ServiceNowIncident, IngestionLog

router = APIRouter()

def get_db():
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "servicenow-service", "timestamp": datetime.utcnow().isoformat()}

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    assets = await db.execute(select(func.count(CMDBAsset.id)))
    incidents = await db.execute(select(func.count(ServiceNowIncident.id)))
    critical_inc = await db.execute(select(func.count(ServiceNowIncident.id)).where(ServiceNowIncident.severity == "1 - Critical"))
    return {
        "assets_count": assets.scalar() or 0,
        "incidents_count": incidents.scalar() or 0,
        "active_alerts_count": critical_inc.scalar() or 0
    }

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    res_assets = await db.execute(select(CMDBAsset))
    assets = res_assets.scalars().all()
    
    res_inc = await db.execute(select(ServiceNowIncident))
    incidents = res_inc.scalars().all()
    
    nodes = [{"id": "servicenow:cmdb", "label": "ServiceNow CMDB Engine", "type": "inventory", "status": "ONLINE"}]
    edges = []
    
    for a in assets:
        nodes.append({"id": f"asset:{a.ci_name}", "label": f"{a.ci_name} ({a.ci_class})", "type": "asset", "status": "ONLINE" if a.operational_status == "Operational" else "OFFLINE"})
        edges.append({"source": "servicenow:cmdb", "target": f"asset:{a.ci_name}", "type": "contains"})
        
    for i in incidents:
        nodes.append({"id": f"incident:{i.number}", "label": f"{i.number}: {i.short_description}", "type": "incident", "status": "CRITICAL" if i.severity == "1 - Critical" else "WARNING"})
        # Map incident to the asset if name matched in descriptive text
        for a in assets:
            if a.ci_name.lower() in i.short_description.lower():
                edges.append({"source": f"asset:{a.ci_name}", "target": f"incident:{i.number}", "type": "impacted_by"})
                break
                
    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(ServiceNowIncident).where(ServiceNowIncident.severity == "1 - Critical"))
    incidents = res.scalars().all()
    alerts = []
    for i in incidents:
        alerts.append({
            "component": "INCIDENT",
            "component_name": i.number,
            "alert_type": "P1_INCIDENT",
            "severity": "CRITICAL",
            "message": f"P1 CRITICAL INCIDENT: {i.number} - {i.short_description}"
        })
    return alerts

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    res_inc = await db.execute(select(ServiceNowIncident).where(ServiceNowIncident.incident_state != "Resolved"))
    incidents = res_inc.scalars().all()
    p1_incidents = [i.number for i in incidents if i.severity == "1 - Critical"]
    
    score = 100.0
    criticals = []
    warnings = []
    recs = []
    
    if p1_incidents:
        score -= len(p1_incidents) * 20.0
        criticals.append(f"Active P1 ServiceNow Incidents logged: {', '.join(p1_incidents)}")
        recs.append(f"Acknowledge active ITSM tickets in SNOW Queue: {', '.join(p1_incidents)}")
        
    score = max(0.0, score)
    
    return build_ai_context(
        connector_name="servicenow",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"ServiceNow portal manages {len(incidents)} open operational tickets.",
        active_alerts=[f"ITSM Ticket {i} P1 Escalation alert" for i in p1_incidents],
        drift_analysis={"p1_incidents": p1_incidents},
        sla_status={"servicenow_sla_ok": len(p1_incidents) == 0, "health_score": score}
    )
