from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.base import get_db
from app.schemas.component import ComponentCreate, ComponentUpdate
from app.services.component_service import component_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/components", tags=["components"])

LOB_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}
COMPONENT_MANAGE_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}


@router.get("", response_model=List[dict])
async def list_components(
    lob_id: Optional[str] = Query(None),
    team_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await component_service.get_all(db, lob_id=lob_id, team_id=team_id)


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_component(
    data: ComponentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can create components")
    try:
        component = await component_service.create(db, data, current_user.id)
        d = {**component.__dict__}
        d.pop("_sa_instance_state", None)
        d.update({"project_count": 0})
        await audit_service.log(
            db, action="component.create", resource_type="component", resource_id=component.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"name": component.name, "lob_id": component.lob_id, "team_id": component.team_id},
        )
        return d
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{component_id}", response_model=dict)
async def get_component(
    component_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await component_service.get_by_id_with_counts(db, component_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    return data


@router.patch("/{component_id}", response_model=dict)
async def update_component(
    component_id: str,
    data: ComponentUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in COMPONENT_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    component = await component_service.update(db, component_id, data)
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    d = {**component.__dict__}
    d.pop("_sa_instance_state", None)
    await audit_service.log(
        db, action="component.update", resource_type="component", resource_id=component_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=data.model_dump(exclude_none=True),
    )
    return d


@router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_component(
    component_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can delete components")
    if not await component_service.delete(db, component_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    await audit_service.log(
        db, action="component.delete", resource_type="component", resource_id=component_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )
