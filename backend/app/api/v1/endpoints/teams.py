from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional
from app.db.base import get_db
from app.schemas.team import TeamCreate, TeamUpdate, TeamMemberCreate, TeamProjectAssign
from app.services.team_service import team_service
from app.services.audit_service import audit_service
from app.api.deps import get_current_user
from app.models.user import User, UserRole

router = APIRouter(prefix="/teams", tags=["teams"])

LOB_ADMIN_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.ADMIN}
TEAM_MANAGE_ROLES = {UserRole.SUPER_ADMIN, UserRole.LOB_ADMIN, UserRole.PROJECT_ADMIN, UserRole.ADMIN}


@router.get("", response_model=List[dict])
async def list_teams(
    lob_id: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await team_service.get_all(db, lob_id=lob_id)


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_team(
    data: TeamCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can create teams")
    try:
        team = await team_service.create(db, data, current_user.id, current_user.tenant_id or "default")
        d = {**team.__dict__}
        d.pop("_sa_instance_state", None)
        d.update({"member_count": 0, "project_count": 0})
        await audit_service.log(
            db, action="team.create", resource_type="team", resource_id=team.id,
            user_id=current_user.id, tenant_id=current_user.tenant_id,
            ip_address=request.client.host if request.client else None,
            changes={"name": team.name, "lob_id": team.lob_id},
        )
        return d
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{team_id}", response_model=dict)
async def get_team(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = await team_service.get_by_id_with_counts(db, team_id)
    if not data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return data


@router.patch("/{team_id}", response_model=dict)
async def update_team(
    team_id: str,
    data: TeamUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in TEAM_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    team = await team_service.update(db, team_id, data)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    d = {**team.__dict__}
    d.pop("_sa_instance_state", None)
    await audit_service.log(
        db, action="team.update", resource_type="team", resource_id=team_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
        changes=data.model_dump(exclude_none=True),
    )
    return d


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_team(
    team_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in LOB_ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only LOB Admins can delete teams")
    if not await team_service.delete(db, team_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    await audit_service.log(
        db, action="team.delete", resource_type="team", resource_id=team_id,
        user_id=current_user.id, tenant_id=current_user.tenant_id,
        ip_address=request.client.host if request.client else None,
    )


@router.get("/{team_id}/members", response_model=List[dict])
async def list_members(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await team_service.get_members(db, team_id)


@router.post("/{team_id}/members", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_member(
    team_id: str,
    data: TeamMemberCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in TEAM_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    try:
        return await team_service.add_member(db, team_id, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.delete("/{team_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_member(
    team_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in TEAM_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if not await team_service.remove_member(db, team_id, member_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")


@router.get("/{team_id}/projects", response_model=List[dict])
async def list_projects(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await team_service.get_projects(db, team_id)


@router.post("/{team_id}/projects", response_model=dict, status_code=status.HTTP_201_CREATED)
async def assign_project(
    team_id: str,
    data: TeamProjectAssign,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in TEAM_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    try:
        return await team_service.assign_project(db, team_id, data, current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.delete("/{team_id}/projects/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_project(
    team_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in TEAM_MANAGE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
    if not await team_service.remove_project(db, team_id, assignment_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project assignment not found")
