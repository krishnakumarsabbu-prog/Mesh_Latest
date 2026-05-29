from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from app.db.base import get_db
from app.schemas.audit import AuditLogResponse
from app.services.audit_service import audit_service
from app.api.deps import require_admin
from app.models.user import User
import csv
import io
import json
from datetime import datetime

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/logs", response_model=dict)
async def get_audit_logs(
    resource_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    logs, total = await audit_service.get_logs(
        db,
        tenant_id=current_user.tenant_id or "default",
        resource_type=resource_type,
        user_id=user_id,
        action=action,
        search=search,
        limit=limit,
        offset=offset,
    )
    return {
        "items": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "changes": log.changes,
                "ip_address": log.ip_address,
                "tenant_id": log.tenant_id,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/logs/export")
async def export_audit_logs(
    resource_type: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    format: str = Query(default="csv", pattern="^(csv|json)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    logs, _ = await audit_service.get_logs(
        db,
        tenant_id=current_user.tenant_id or "default",
        resource_type=resource_type,
        user_id=user_id,
        action=action,
        search=search,
        limit=5000,
        offset=0,
    )

    if format == "json":
        data = [
            {
                "id": log.id,
                "user_id": log.user_id,
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "changes": log.changes,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ]
        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit_logs.json"},
        )

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "Action", "Resource Type", "Resource ID", "User ID", "IP Address", "Changes"])
    for log in logs:
        writer.writerow([
            log.id,
            log.created_at.isoformat() if log.created_at else "",
            log.action,
            log.resource_type,
            log.resource_id or "",
            log.user_id or "",
            log.ip_address or "",
            log.changes or "",
        ])

    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
