from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.base import get_db
from app.schemas.lob import LobCreate, LobUpdate, LobAdminAssign
from app.services.lob_service import lob_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user, require_super_admin, require_roles
from app.models.user import User

router = APIRouter(prefix="/lobs", tags=["lobs"])

# Write operations on LOBs require super_admin or admin role
_lob_write_guard = [Depends(require_roles(["super_admin", "admin"]))]


@router.get("", response_model=List[dict])
async def list_lobs(
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lobs = await lob_service.get_all(db, tenant_id=current_user.tenant_id or "default")
    if search:
        search_lower = search.lower()
        lobs = [l for l in lobs if search_lower in l["name"].lower() or search_lower in l.get("slug", "").lower()]
    return lobs


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED, dependencies=_lob_write_guard)
async def create_lob(
    data: LobCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    try:
        lob = await lob_service.create(db, data, current_user.id)
        d = {**lob.__dict__}
        d.pop("_sa_instance_state", None)
        d["project_count"] = 0
        d["member_count"] = 0
        await audit_service.log(
            db, action="lob.create", resource_type="lob", resource_id=lob.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"name": lob.name},
        )
        return d
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{lob_id}", response_model=dict)
async def get_lob(
    lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lob = await lob_service.get_by_id_with_counts(db, lob_id)
    if not lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LOB not found")
    return lob


@router.patch("/{lob_id}", response_model=dict, dependencies=_lob_write_guard)
async def update_lob(
    lob_id: str,
    data: LobUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    lob = await lob_service.update(db, lob_id, data)
    if not lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LOB not found")
    await audit_service.log(
        db, action="lob.update", resource_type="lob", resource_id=lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=data.model_dump(exclude_none=True),
    )
    lob_data = await lob_service.get_by_id_with_counts(db, lob_id)
    return lob_data


@router.delete("/{lob_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=_lob_write_guard)
async def delete_lob(
    lob_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if not await lob_service.delete(db, lob_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LOB not found")
    await audit_service.log(
        db, action="lob.delete", resource_type="lob", resource_id=lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/{lob_id}/admins", response_model=List[dict])
async def get_lob_admins(
    lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lob = await lob_service.get_by_id(db, lob_id)
    if not lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LOB not found")
    return await lob_service.get_admins(db, lob_id)


@router.post("/{lob_id}/admins", response_model=dict, status_code=status.HTTP_201_CREATED)
async def assign_lob_admin(
    lob_id: str,
    data: LobAdminAssign,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    lob = await lob_service.get_by_id(db, lob_id)
    if not lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LOB not found")
    member = await lob_service.assign_admin(db, lob_id, data.user_id)
    await audit_service.log(
        db, action="lob.admin_assign", resource_type="lob", resource_id=lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"assigned_user_id": data.user_id},
    )
    d = {**member.__dict__}
    d.pop("_sa_instance_state", None)
    return d


@router.delete("/{lob_id}/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_lob_admin(
    lob_id: str,
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if not await lob_service.remove_admin(db, lob_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin assignment not found")
    await audit_service.log(
        db, action="lob.admin_remove", resource_type="lob", resource_id=lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"removed_user_id": user_id},
    )


@router.get("/{lob_id}/members", response_model=List[dict])
async def get_lob_members(
    lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lob = await lob_service.get_by_id(db, lob_id)
    if not lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LOB not found")
    return await lob_service.get_members(db, lob_id)
