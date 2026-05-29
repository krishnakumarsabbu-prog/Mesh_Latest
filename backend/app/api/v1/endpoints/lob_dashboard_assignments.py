"""
LOB Dashboard Assignment API.

Routes:
  GET    /lobs/{lob_id}/dashboards                          — list assignments
  POST   /lobs/{lob_id}/dashboards                          — assign template
  GET    /lobs/{lob_id}/dashboards/{assignment_id}          — get assignment
  PATCH  /lobs/{lob_id}/dashboards/{assignment_id}          — update assignment
  DELETE /lobs/{lob_id}/dashboards/{assignment_id}          — remove assignment
  POST   /lobs/{lob_id}/dashboards/reorder                  — reorder assignments
  POST   /lobs/{lob_id}/dashboards/{assignment_id}/set-default
  GET    /lobs/{lob_id}/dashboards/validate/{template_id}
  GET    /lobs/{lob_id}/dashboards/{assignment_id}/render
  PUT    /lobs/{lob_id}/dashboards/{assignment_id}/widgets/{widget_id}/override
  DELETE /lobs/{lob_id}/dashboards/{assignment_id}/widgets/{widget_id}/override
"""
from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.lob_dashboard_assignment import (
    LobAssignmentCreate,
    LobAssignmentReorder,
    LobAssignmentResponse,
    LobAssignmentUpdate,
    LobAssignmentValidationResult,
    LobLiveDashboardResponse,
    LobWidgetOverrideCreate,
    LobWidgetOverrideResponse,
)
from app.services.lob_dashboard_assignment_service import lob_dashboard_assignment_service

router = APIRouter(prefix="/lobs/{lob_id}/dashboards", tags=["lob-dashboard-assignments"])


@router.get("", response_model=List[LobAssignmentResponse])
async def list_assignments(
    lob_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[LobAssignmentResponse]:
    return await lob_dashboard_assignment_service.list_assignments(db, lob_id)


@router.post("", response_model=LobAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_template(
    lob_id: str,
    data: LobAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobAssignmentResponse:
    try:
        return await lob_dashboard_assignment_service.assign_template(
            db, lob_id, data, current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/validate/{template_id}", response_model=LobAssignmentValidationResult)
async def validate_template(
    lob_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobAssignmentValidationResult:
    return await lob_dashboard_assignment_service.validate_assignment(db, lob_id, template_id)


@router.post("/reorder", response_model=List[LobAssignmentResponse])
async def reorder_assignments(
    lob_id: str,
    data: LobAssignmentReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[LobAssignmentResponse]:
    return await lob_dashboard_assignment_service.reorder_assignments(
        db, lob_id, data.ordered_assignment_ids
    )


@router.get("/{assignment_id}", response_model=LobAssignmentResponse)
async def get_assignment(
    lob_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobAssignmentResponse:
    result = await lob_dashboard_assignment_service.get_assignment(db, lob_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.patch("/{assignment_id}", response_model=LobAssignmentResponse)
async def update_assignment(
    lob_id: str,
    assignment_id: str,
    data: LobAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobAssignmentResponse:
    result = await lob_dashboard_assignment_service.update_assignment(
        db, lob_id, assignment_id, data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.post("/{assignment_id}/set-default", response_model=LobAssignmentResponse)
async def set_default(
    lob_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobAssignmentResponse:
    result = await lob_dashboard_assignment_service.set_default(db, lob_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def remove_assignment(
    lob_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await lob_dashboard_assignment_service.remove_assignment(db, lob_id, assignment_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Assignment not found")


@router.get("/{assignment_id}/render", response_model=LobLiveDashboardResponse)
async def render_live_dashboard(
    lob_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobLiveDashboardResponse:
    result = await lob_dashboard_assignment_service.render_live_dashboard(
        db, lob_id, assignment_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.put(
    "/{assignment_id}/widgets/{widget_id}/override",
    response_model=LobWidgetOverrideResponse,
)
async def upsert_widget_override(
    lob_id: str,
    assignment_id: str,
    widget_id: str,
    data: LobWidgetOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> LobWidgetOverrideResponse:
    result = await lob_dashboard_assignment_service.upsert_widget_override(
        db, lob_id, assignment_id, data
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
    lob_id: str,
    assignment_id: str,
    widget_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await lob_dashboard_assignment_service.delete_widget_override(
        db, lob_id, assignment_id, widget_id
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Override not found")
