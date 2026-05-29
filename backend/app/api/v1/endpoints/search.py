from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from typing import List, Dict, Any, Optional
from app.db.base import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.connector import Connector
from app.models.lob import Lob
from app.models.health_rule import HealthRule
from app.models.audit import AuditLog

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=Dict[str, Any])
async def global_search(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    term = f"%{q}%"
    results: List[Dict[str, Any]] = []

    lob_q = select(Lob).where(
        Lob.tenant_id == (current_user.tenant_id or "default"),
        or_(Lob.name.ilike(term), Lob.slug.ilike(term), Lob.description.ilike(term)),
    ).limit(limit)
    lob_res = await db.execute(lob_q)
    for lob in lob_res.scalars().all():
        results.append({
            "type": "lob",
            "id": lob.id,
            "title": lob.name,
            "subtitle": lob.description or lob.slug,
            "href": f"/lobs/{lob.id}",
            "color": lob.color,
        })

    proj_q = select(Project).where(
        or_(Project.name.ilike(term), Project.slug.ilike(term), Project.description.ilike(term)),
    ).limit(limit)
    proj_res = await db.execute(proj_q)
    for proj in proj_res.scalars().all():
        results.append({
            "type": "project",
            "id": proj.id,
            "title": proj.name,
            "subtitle": proj.description or proj.environment,
            "href": f"/projects/{proj.id}",
            "color": proj.color,
        })

    conn_q = select(Connector).where(
        or_(Connector.name.ilike(term), Connector.description.ilike(term)),
    ).limit(limit)
    conn_res = await db.execute(conn_q)
    for conn in conn_res.scalars().all():
        results.append({
            "type": "connector",
            "id": conn.id,
            "title": conn.name,
            "subtitle": conn.description or str(conn.type),
            "href": f"/connectors",
            "status": str(conn.status),
        })

    rule_q = select(HealthRule).where(
        or_(HealthRule.name.ilike(term), HealthRule.description.ilike(term)),
        HealthRule.status != "archived",
    ).limit(limit)
    rule_res = await db.execute(rule_q)
    for rule in rule_res.scalars().all():
        results.append({
            "type": "rule",
            "id": rule.id,
            "title": rule.name,
            "subtitle": rule.description or str(rule.scope),
            "href": f"/rules",
            "severity": str(rule.severity),
        })

    return {
        "query": q,
        "total": len(results),
        "results": results,
    }
