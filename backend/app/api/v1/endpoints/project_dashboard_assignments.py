"""
Project Dashboard Assignment API.

Routes:
  GET    /projects/{project_id}/dashboards                     — list assignments
  POST   /projects/{project_id}/dashboards                     — assign template
  GET    /projects/{project_id}/dashboards/{assignment_id}     — get assignment
  PATCH  /projects/{project_id}/dashboards/{assignment_id}     — update assignment
  DELETE /projects/{project_id}/dashboards/{assignment_id}     — remove assignment
  POST   /projects/{project_id}/dashboards/reorder             — reorder assignments
  POST   /projects/{project_id}/dashboards/{assignment_id}/set-default
  GET    /projects/{project_id}/dashboards/validate/{template_id}
  GET    /projects/{project_id}/dashboards/{assignment_id}/render
  PUT    /projects/{project_id}/dashboards/{assignment_id}/widgets/{widget_id}/override
  DELETE /projects/{project_id}/dashboards/{assignment_id}/widgets/{widget_id}/override
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.project_dashboard_assignment import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    AssignmentValidationResult,
    LiveDashboardResponse,
    WidgetOverrideCreate,
    WidgetOverrideResponse,
    AssignmentReorder,
)
from app.services.project_dashboard_assignment_service import project_dashboard_assignment_service

router = APIRouter(prefix="/projects/{project_id}/dashboards", tags=["project-dashboard-assignments"])


@router.get("", response_model=List[AssignmentResponse])
async def list_assignments(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssignmentResponse]:
    return await project_dashboard_assignment_service.list_assignments(db, project_id)


@router.post("", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_template(
    project_id: str,
    data: AssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentResponse:
    try:
        return await project_dashboard_assignment_service.assign_template(
            db, project_id, data, current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/validate/{template_id}", response_model=AssignmentValidationResult)
async def validate_template(
    project_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentValidationResult:
    return await project_dashboard_assignment_service.validate_assignment(db, project_id, template_id)


@router.post("/reorder", response_model=List[AssignmentResponse])
async def reorder_assignments(
    project_id: str,
    data: AssignmentReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[AssignmentResponse]:
    return await project_dashboard_assignment_service.reorder_assignments(
        db, project_id, data.ordered_assignment_ids
    )


@router.get("/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    project_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentResponse:
    result = await project_dashboard_assignment_service.get_assignment(db, project_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.patch("/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    project_id: str,
    assignment_id: str,
    data: AssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentResponse:
    result = await project_dashboard_assignment_service.update_assignment(
        db, project_id, assignment_id, data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.post("/{assignment_id}/set-default", response_model=AssignmentResponse)
async def set_default(
    project_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AssignmentResponse:
    result = await project_dashboard_assignment_service.set_default(db, project_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_assignment(
    project_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await project_dashboard_assignment_service.remove_assignment(db, project_id, assignment_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Assignment not found")


@router.get("/{assignment_id}/render", response_model=LiveDashboardResponse)
async def render_live_dashboard(
    project_id: str,
    assignment_id: str,
    time_range_hours: int = Query(default=24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LiveDashboardResponse:
    result = await project_dashboard_assignment_service.render_live_dashboard(
        db, project_id, assignment_id, time_range_hours=time_range_hours
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.put(
    "/{assignment_id}/widgets/{widget_id}/override",
    response_model=WidgetOverrideResponse,
)
async def upsert_widget_override(
    project_id: str,
    assignment_id: str,
    widget_id: str,
    data: WidgetOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> WidgetOverrideResponse:
    result = await project_dashboard_assignment_service.upsert_widget_override(
        db, project_id, assignment_id, data
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
    project_id: str,
    assignment_id: str,
    widget_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await project_dashboard_assignment_service.delete_widget_override(
        db, project_id, assignment_id, widget_id
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Override not found")
