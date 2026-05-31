from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.base import get_db
from app.schemas.sub_lob import SubLobCreate, SubLobUpdate, SubLobAdminAssign
from app.services.sub_lob_service import sub_lob_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user, require_super_admin, require_roles
from app.models.user import User

router = APIRouter(prefix="/sublobs", tags=["sublobs"])

_sub_lob_write_guard = [Depends(require_roles(["super_admin", "admin"]))]


@router.get("", response_model=List[dict])
async def list_sub_lobs(
    search: Optional[str] = Query(None),
    lob_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub_lobs = await sub_lob_service.get_all(
        db, 
        tenant_id=current_user.tenant_id or "default",
        lob_id=lob_id
    )
    if search:
        search_lower = search.lower()
        sub_lobs = [
            s for s in sub_lobs 
            if search_lower in s["name"].lower() or search_lower in s.get("slug", "").lower()
        ]
    return sub_lobs


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED, dependencies=_sub_lob_write_guard)
async def create_sub_lob(
    data: SubLobCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    try:
        sub_lob = await sub_lob_service.create(db, data, current_user.id)
        d = {**sub_lob.__dict__}
        d.pop("_sa_instance_state", None)
        d["team_count"] = 0
        d["project_count"] = 0
        d["component_count"] = 0
        d["member_count"] = 0
        await audit_service.log(
            db, action="sub_lob.create", resource_type="sub_lob", resource_id=sub_lob.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"name": sub_lob.name, "lob_id": sub_lob.lob_id},
        )
        return d
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{sub_lob_id}", response_model=dict)
async def get_sub_lob(
    sub_lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub_lob = await sub_lob_service.get_by_id_with_counts(db, sub_lob_id)
    if not sub_lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SubLob not found")
    return sub_lob


@router.patch("/{sub_lob_id}", response_model=dict, dependencies=_sub_lob_write_guard)
async def update_sub_lob(
    sub_lob_id: str,
    data: SubLobUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    sub_lob = await sub_lob_service.update(db, sub_lob_id, data)
    if not sub_lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SubLob not found")
    await audit_service.log(
        db, action="sub_lob.update", resource_type="sub_lob", resource_id=sub_lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=data.model_dump(exclude_none=True),
    )
    sub_lob_data = await sub_lob_service.get_by_id_with_counts(db, sub_lob_id)
    return sub_lob_data


@router.delete("/{sub_lob_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None, dependencies=_sub_lob_write_guard)
async def delete_sub_lob(
    sub_lob_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if not await sub_lob_service.delete(db, sub_lob_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SubLob not found")
    await audit_service.log(
        db, action="sub_lob.delete", resource_type="sub_lob", resource_id=sub_lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/{sub_lob_id}/admins", response_model=List[dict])
async def get_sub_lob_admins(
    sub_lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub_lob = await sub_lob_service.get_by_id(db, sub_lob_id)
    if not sub_lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SubLob not found")
    return await sub_lob_service.get_admins(db, sub_lob_id)


@router.post("/{sub_lob_id}/admins", response_model=dict, status_code=status.HTTP_201_CREATED)
async def assign_sub_lob_admin(
    sub_lob_id: str,
    data: SubLobAdminAssign,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    sub_lob = await sub_lob_service.get_by_id(db, sub_lob_id)
    if not sub_lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SubLob not found")
    member = await sub_lob_service.assign_admin(db, sub_lob_id, data.user_id)
    await audit_service.log(
        db, action="sub_lob.admin_assign", resource_type="sub_lob", resource_id=sub_lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"assigned_user_id": data.user_id},
    )
    d = {**member.__dict__}
    d.pop("_sa_instance_state", None)
    return d


@router.delete("/{sub_lob_id}/admins/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_sub_lob_admin(
    sub_lob_id: str,
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_super_admin),
):
    if not await sub_lob_service.remove_admin(db, sub_lob_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin assignment not found")
    await audit_service.log(
        db, action="sub_lob.admin_remove", resource_type="sub_lob", resource_id=sub_lob_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"removed_user_id": user_id},
    )


@router.get("/{sub_lob_id}/members", response_model=List[dict])
async def get_sub_lob_members(
    sub_lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sub_lob = await sub_lob_service.get_by_id(db, sub_lob_id)
    if not sub_lob:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="SubLob not found")
    return await sub_lob_service.get_members(db, sub_lob_id)
