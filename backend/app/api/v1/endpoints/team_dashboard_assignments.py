"""
Team Dashboard Assignment API.

Routes:
  GET    /teams/{team_id}/dashboards                     — list assignments
  POST   /teams/{team_id}/dashboards                     — assign template
  GET    /teams/{team_id}/dashboards/{assignment_id}     — get assignment
  PATCH  /teams/{team_id}/dashboards/{assignment_id}     — update assignment
  DELETE /teams/{team_id}/dashboards/{assignment_id}     — remove assignment
  POST   /teams/{team_id}/dashboards/reorder             — reorder assignments
  POST   /teams/{team_id}/dashboards/{assignment_id}/set-default
  GET    /teams/{team_id}/dashboards/validate/{template_id}
  GET    /teams/{team_id}/dashboards/{assignment_id}/render
  PUT    /teams/{team_id}/dashboards/{assignment_id}/widgets/{widget_id}/override
  DELETE /teams/{team_id}/dashboards/{assignment_id}/widgets/{widget_id}/override
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.team_dashboard_assignment import (
    TeamAssignmentCreate,
    TeamAssignmentReorder,
    TeamAssignmentResponse,
    TeamAssignmentUpdate,
    TeamAssignmentValidationResult,
    TeamLiveDashboardResponse,
    TeamWidgetOverrideCreate,
    TeamWidgetOverrideResponse,
)
from app.services.team_dashboard_assignment_service import team_dashboard_assignment_service

router = APIRouter(prefix="/teams/{team_id}/dashboards", tags=["team-dashboard-assignments"])


@router.get("", response_model=List[TeamAssignmentResponse])
async def list_assignments(
    team_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TeamAssignmentResponse]:
    return await team_dashboard_assignment_service.list_assignments(db, team_id)


@router.post("", response_model=TeamAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_template(
    team_id: str,
    data: TeamAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAssignmentResponse:
    try:
        return await team_dashboard_assignment_service.assign_template(
            db, team_id, data, current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/validate/{template_id}", response_model=TeamAssignmentValidationResult)
async def validate_template(
    team_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAssignmentValidationResult:
    return await team_dashboard_assignment_service.validate_assignment(db, team_id, template_id)


@router.post("/reorder", response_model=List[TeamAssignmentResponse])
async def reorder_assignments(
    team_id: str,
    data: TeamAssignmentReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[TeamAssignmentResponse]:
    return await team_dashboard_assignment_service.reorder_assignments(
        db, team_id, data.ordered_assignment_ids
    )


@router.get("/{assignment_id}", response_model=TeamAssignmentResponse)
async def get_assignment(
    team_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAssignmentResponse:
    result = await team_dashboard_assignment_service.get_assignment(db, team_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.patch("/{assignment_id}", response_model=TeamAssignmentResponse)
async def update_assignment(
    team_id: str,
    assignment_id: str,
    data: TeamAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAssignmentResponse:
    result = await team_dashboard_assignment_service.update_assignment(
        db, team_id, assignment_id, data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.post("/{assignment_id}/set-default", response_model=TeamAssignmentResponse)
async def set_default(
    team_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamAssignmentResponse:
    result = await team_dashboard_assignment_service.set_default(db, team_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_assignment(
    team_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await team_dashboard_assignment_service.remove_assignment(db, team_id, assignment_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Assignment not found")


@router.get("/{assignment_id}/render", response_model=TeamLiveDashboardResponse)
async def render_live_dashboard(
    team_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamLiveDashboardResponse:
    result = await team_dashboard_assignment_service.render_live_dashboard(
        db, team_id, assignment_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.put(
    "/{assignment_id}/widgets/{widget_id}/override",
    response_model=TeamWidgetOverrideResponse,
)
async def upsert_widget_override(
    team_id: str,
    assignment_id: str,
    widget_id: str,
    data: TeamWidgetOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamWidgetOverrideResponse:
    result = await team_dashboard_assignment_service.upsert_widget_override(
        db, team_id, assignment_id, data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.delete(
    "/{assignment_id}/widgets/{widget_id}/override",
    status_code=status.HTTP_204_NO_CONTENT,
    response_model=None,
)
async def delete_widget_override(
    team_id: str,
    assignment_id: str,
    widget_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await team_dashboard_assignment_service.delete_widget_override(
        db, team_id, assignment_id, widget_id
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Override not found")
