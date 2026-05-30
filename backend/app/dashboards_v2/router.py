from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.dashboards_v2.schemas import (
    ComponentAssignmentCreate,
    ComponentAssignmentResponse,
    ComponentAssignmentUpdate,
    ComponentAssignmentValidationResult,
    ComponentLiveDashboardResponse,
    ComponentWidgetOverrideCreate,
    ComponentWidgetOverrideResponse,
    ComponentAssignmentReorder,
)
from app.dashboards_v2.services import component_dashboard_assignment_service

router = APIRouter(prefix="/components/{component_id}/dashboards", tags=["component-dashboard-assignments"])


@router.get("", response_model=List[ComponentAssignmentResponse])
async def list_assignments(
    component_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ComponentAssignmentResponse]:
    return await component_dashboard_assignment_service.list_assignments(db, component_id)


@router.post("", response_model=ComponentAssignmentResponse, status_code=status.HTTP_201_CREATED)
async def assign_template(
    component_id: str,
    data: ComponentAssignmentCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentResponse:
    try:
        return await component_dashboard_assignment_service.assign_template(
            db, component_id, data, current_user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/validate/{template_id}", response_model=ComponentAssignmentValidationResult)
async def validate_template(
    component_id: str,
    template_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentValidationResult:
    return await component_dashboard_assignment_service.validate_template(db, component_id, template_id)


@router.post("/reorder", response_model=List[ComponentAssignmentResponse])
async def reorder_assignments(
    component_id: str,
    data: ComponentAssignmentReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ComponentAssignmentResponse]:
    success = await component_dashboard_assignment_service.reorder_assignments(
        db, component_id, data.ordered_assignment_ids
    )
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reorder assignments")
    return await component_dashboard_assignment_service.list_assignments(db, component_id)


@router.get("/{assignment_id}", response_model=ComponentAssignmentResponse)
async def get_assignment(
    component_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentResponse:
    result = await component_dashboard_assignment_service.get_assignment(db, component_id, assignment_id)
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.patch("/{assignment_id}", response_model=ComponentAssignmentResponse)
async def update_assignment(
    component_id: str,
    assignment_id: str,
    data: ComponentAssignmentUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentResponse:
    result = await component_dashboard_assignment_service.update_assignment(
        db, component_id, assignment_id, data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.post("/{assignment_id}/set-default", response_model=ComponentAssignmentResponse)
async def set_default(
    component_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentResponse:
    success = await component_dashboard_assignment_service.set_default_assignment(db, component_id, assignment_id)
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    result = await component_dashboard_assignment_service.get_assignment(db, component_id, assignment_id)
    return result


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_assignment(
    component_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    removed = await component_dashboard_assignment_service.remove_assignment(db, component_id, assignment_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Assignment not found")


@router.get("/{assignment_id}/render", response_model=ComponentLiveDashboardResponse)
async def render_live_dashboard(
    component_id: str,
    assignment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentLiveDashboardResponse:
    result = await component_dashboard_assignment_service.render_dashboard(
        db, component_id, assignment_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.put(
    "/{assignment_id}/widgets/{widget_id}/override",
    response_model=ComponentAssignmentResponse,
)
async def upsert_widget_override(
    component_id: str,
    assignment_id: str,
    widget_id: str,
    data: ComponentWidgetOverrideCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentResponse:
    success = await component_dashboard_assignment_service.upsert_widget_override(
        db, component_id, assignment_id, widget_id, data.dict()
    )
    if not success:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return await component_dashboard_assignment_service.get_assignment(db, component_id, assignment_id)


@router.delete(
    "/{assignment_id}/widgets/{widget_id}/override",
    status_code=status.HTTP_200_OK,
    response_model=ComponentAssignmentResponse,
)
async def delete_widget_override(
    component_id: str,
    assignment_id: str,
    widget_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ComponentAssignmentResponse:
    removed = await component_dashboard_assignment_service.delete_widget_override(
        db, component_id, assignment_id, widget_id
    )
    if not removed:
        raise HTTPException(status_code=404, detail="Override not found")
    return await component_dashboard_assignment_service.get_assignment(db, component_id, assignment_id)
