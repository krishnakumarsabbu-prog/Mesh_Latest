from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.base import get_db
from app.schemas.connector import ConnectorCreate, ConnectorUpdate, ConnectorResponse
from app.services.connector_service import connector_service
from app.services.project_service import project_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/connectors", tags=["connectors"])

CONNECTOR_WRITE_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}
READ_SCOPED_ROLES = {UserRole.PROJECT_USER, UserRole.ANALYST, UserRole.VIEWER}


async def _assert_project_access(db: AsyncSession, project_id: str, user: User):
    if user.role in READ_SCOPED_ROLES:
        if not await project_service.is_member(db, project_id, user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")


@router.get("", response_model=List[dict])
async def list_connectors(
    project_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if project_id and current_user.role in READ_SCOPED_ROLES:
        await _assert_project_access(db, project_id, current_user)
    connectors = await connector_service.get_all(db, project_id=project_id)
    return [{k: v for k, v in c.__dict__.items() if not k.startswith("_")} for c in connectors]


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_connector(data: ConnectorCreate, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in CONNECTOR_WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to create connectors")
    if current_user.role == UserRole.PROJECT_ADMIN:
        if not await project_service.is_member(db, data.project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
    try:
        connector = await connector_service.create(db, data, current_user.id)
        await audit_service.log(
            db, action="connector.create", resource_type="connector", resource_id=connector.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"name": connector.name, "type": str(connector.type), "project_id": connector.project_id},
        )
        return {k: v for k, v in connector.__dict__.items() if not k.startswith("_")}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{connector_id}", response_model=dict)
async def get_connector(connector_id: str, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    connector = await connector_service.get_by_id(db, connector_id)
    if not connector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
    if current_user.role in READ_SCOPED_ROLES:
        await _assert_project_access(db, connector.project_id, current_user)
    return {k: v for k, v in connector.__dict__.items() if not k.startswith("_")}


@router.patch("/{connector_id}", response_model=dict)
async def update_connector(connector_id: str, data: ConnectorUpdate, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in CONNECTOR_WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to update connectors")
    existing = await connector_service.get_by_id(db, connector_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
    if current_user.role == UserRole.PROJECT_ADMIN:
        if not await project_service.is_member(db, existing.project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
    connector = await connector_service.update(db, connector_id, data)
    if not connector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
    await audit_service.log(
        db, action="connector.update", resource_type="connector", resource_id=connector_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=data.model_dump(exclude_none=True),
    )
    return {k: v for k, v in connector.__dict__.items() if not k.startswith("_")}


@router.delete("/{connector_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_connector(connector_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role not in CONNECTOR_WRITE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions to delete connectors")
    existing = await connector_service.get_by_id(db, connector_id)
    if not existing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
    if current_user.role == UserRole.PROJECT_ADMIN:
        if not await project_service.is_member(db, existing.project_id, current_user.id):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this project")
    if not await connector_service.delete(db, connector_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
    await audit_service.log(
        db, action="connector.delete", resource_type="connector", resource_id=connector_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


@router.post("/{connector_id}/health-check", response_model=dict)
async def run_health_check(connector_id: str, request: Request, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == UserRole.VIEWER:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Viewers cannot execute health checks")
    connector = await connector_service.get_by_id(db, connector_id)
    if not connector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Connector not found")
    if current_user.role in {UserRole.PROJECT_USER, UserRole.ANALYST}:
        await _assert_project_access(db, connector.project_id, current_user)
    try:
        result = await connector_service.run_health_check(db, connector_id)
        await audit_service.log(
            db, action="connector.health_check", resource_type="connector", resource_id=connector_id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"status": str(result.status)},
        )
        return {k: v for k, v in result.__dict__.items() if not k.startswith("_")}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
