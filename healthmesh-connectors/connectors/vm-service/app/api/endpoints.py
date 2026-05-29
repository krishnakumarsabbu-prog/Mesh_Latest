from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict, Any
from datetime import datetime

from shared.database.session import DatabaseManager
from shared.ingestion.engine import IngestionEngine
from shared.ai.context import build_ai_context
from app.models.db_models import ESXiHost, VirtualMachine, IngestionLog

router = APIRouter()

def get_db():
    pass

@router.get("/health")
async def health():
    return {"status": "healthy", "service": "vm-service", "timestamp": datetime.utcnow().isoformat()}

@router.get("/summary")
async def get_summary(db: AsyncSession = Depends(get_db)):
    hosts = await db.execute(select(func.count(ESXiHost.id)))
    vms = await db.execute(select(func.count(VirtualMachine.id)))
    offline = await db.execute(select(func.count(VirtualMachine.id)).where(VirtualMachine.power_state != "POWERED_ON"))
    return {
        "hosts_count": hosts.scalar() or 0,
        "vms_count": vms.scalar() or 0,
        "active_alerts_count": offline.scalar() or 0
    }

@router.get("/topology")
async def get_topology(db: AsyncSession = Depends(get_db)):
    res_hosts = await db.execute(select(ESXiHost))
    hosts = res_hosts.scalars().all()
    
    res_vms = await db.execute(select(VirtualMachine))
    vms = res_vms.scalars().all()
    
    nodes = [{"id": "vcenter:datacenter", "label": "vCenter Datacenter", "type": "datacenter", "status": "ONLINE"}]
    edges = []
    
    for h in hosts:
        nodes.append({"id": f"host:{h.name}", "label": f"ESXi Host {h.name}", "type": "server", "status": h.status})
        edges.append({"source": "vcenter:datacenter", "target": f"host:{h.name}", "type": "clusters"})
        
    for v in vms:
        nodes.append({"id": f"vm:{v.name}", "label": f"VM {v.name}", "type": "virtual_machine", "status": v.power_state})
        edges.append({"source": f"host:{v.host_name}", "target": f"vm:{v.name}", "type": "hosts"})
        
    return {"nodes": nodes, "edges": edges}

@router.get("/alerts")
async def get_alerts(db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(VirtualMachine).where(VirtualMachine.power_state != "POWERED_ON"))
    vms = res.scalars().all()
    alerts = []
    for v in vms:
        alerts.append({
            "component": "VM",
            "component_name": v.name,
            "alert_type": "VM_POWERED_OFF",
            "severity": "CRITICAL",
            "message": f"CRITICAL: Core VM infrastructure {v.name} was POWERED OFF unexpectedly!"
        })
    return alerts

@router.get("/ai-context")
async def get_ai_context(db: AsyncSession = Depends(get_db)):
    res_vms = await db.execute(select(VirtualMachine))
    vms = res_vms.scalars().all()
    offline_vms = [v.name for v in vms if v.power_state != "POWERED_ON"]
    
    score = 100.0
    criticals = []
    warnings = []
    recs = []
    
    if offline_vms:
        score -= len(offline_vms) * 20.0
        criticals.append(f"Critical VMs are offline/powered off: {', '.join(offline_vms)}")
        recs.append(f"Execute power-on cluster sequence for powered-off VMs: {', '.join(offline_vms)}")
        
    score = max(0.0, score)
    
    return build_ai_context(
        connector_name="vm",
        health_score=score,
        critical_findings=criticals,
        warnings=warnings,
        recommendations=recs,
        topology_summary=f"VMware vCenter hypervisors are hosting {len(vms)} active VMs.",
        active_alerts=[f"VM {v} powered off alert" for v in offline_vms],
        drift_analysis={"offline_vms": offline_vms},
        sla_status={"vm_sla_ok": len(offline_vms) == 0, "health_score": score}
    )
