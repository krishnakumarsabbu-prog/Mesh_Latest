from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from app.db.base import get_db
from app.services.rbac_service import rbac_service, ENTITIES, ACTIONS, ROLE_PERMISSION_MAP
from app.services.audit_service import audit_service
from app.api.deps import get_current_user, require_rbac_manage, require_admin
from app.models.user import User, UserRole

router = APIRouter(prefix="/rbac", tags=["rbac"])


class RolePermissionsUpdate(BaseModel):
    permissions: List[str]


class ScopedAssignmentCreate(BaseModel):
    user_id: str
    role: str
    scope_type: str
    scope_id: str


@router.get("/permissions", response_model=List[dict])
async def list_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await rbac_service.get_all_permissions(db)


@router.get("/matrix", response_model=dict)
async def get_permission_matrix(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    matrix = await rbac_service.get_role_permissions_matrix(db)
    return {
        "entities": ENTITIES,
        "actions": ACTIONS,
        "roles": [r.value for r in UserRole],
        "matrix": matrix,
    }


@router.get("/roles/{role}/permissions", response_model=List[str])
async def get_role_permissions(
    role: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    valid_roles = {r.value for r in UserRole}
    if role not in valid_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    return await rbac_service.get_role_permissions(db, role)


@router.put("/roles/{role}/permissions", response_model=List[str])
async def set_role_permissions(
    role: str,
    data: RolePermissionsUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_rbac_manage),
):
    valid_roles = {r.value for r in UserRole}
    if role not in valid_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if role == UserRole.SUPER_ADMIN.value and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify super admin permissions")
    result = await rbac_service.set_role_permissions(db, role, data.permissions)
    await audit_service.log(
        db, action="rbac.role_permissions_updated", resource_type="role",
        resource_id=role, user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"role": role, "permission_count": len(data.permissions)},
    )
    return result


@router.get("/scoped-assignments", response_model=List[dict])
async def list_scoped_assignments(
    scope_type: Optional[str] = Query(None),
    scope_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    return await rbac_service.get_all_scoped_assignments(db, scope_type=scope_type, scope_id=scope_id)


@router.get("/users/{user_id}/scoped-assignments", response_model=List[dict])
async def get_user_scoped_assignments(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id and current_user.role not in {UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.LOB_ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    return await rbac_service.get_scoped_assignments(db, user_id)


@router.post("/scoped-assignments", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_scoped_assignment(
    data: ScopedAssignmentCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    valid_roles = {r.value for r in UserRole}
    if data.role not in valid_roles:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
    if data.role == UserRole.SUPER_ADMIN.value and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot assign super admin role")

    result = await rbac_service.create_scoped_assignment(
        db, data.user_id, data.role, data.scope_type, data.scope_id, current_user.id
    )
    await audit_service.log(
        db, action="rbac.scoped_assignment_created", resource_type="scoped_assignment",
        resource_id=result["id"], user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes={"user_id": data.user_id, "role": data.role, "scope_type": data.scope_type, "scope_id": data.scope_id},
    )
    return result


@router.delete("/scoped-assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def revoke_scoped_assignment(
    assignment_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    if not await rbac_service.revoke_scoped_assignment(db, assignment_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    await audit_service.log(
        db, action="rbac.scoped_assignment_revoked", resource_type="scoped_assignment",
        resource_id=assignment_id, user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/my-permissions", response_model=dict)
async def get_my_permissions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    permissions = await rbac_service.get_role_permissions(db, current_user.role.value)
    scoped = await rbac_service.get_scoped_assignments(db, current_user.id)
    return {
        "role": current_user.role.value,
        "permissions": permissions,
        "scoped_assignments": scoped,
    }
