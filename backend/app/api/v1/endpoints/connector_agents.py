"""
Connector Agent API endpoints.

Provides test, sync, status, and execution log operations for
project connectors backed by dedicated connector agent implementations.

Routes:
  POST /projects/{project_id}/connectors/{pc_id}/agent/test    — test connection
  POST /projects/{project_id}/connectors/{pc_id}/agent/sync    — run health sync
  GET  /projects/{project_id}/connectors/{pc_id}/agent/status  — get agent status
  GET  /projects/{project_id}/connectors/{pc_id}/agent/logs    — get execution logs
  GET  /projects/{project_id}/connectors/agent/statuses        — all statuses in project
  GET  /connectors/agents/registry                             — list registered connectors
"""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_project_admin
from app.connectors.base.registry import ConnectorRegistry
from app.db.base import get_db
from app.models.connector_execution_log import ExecutionTrigger
from app.models.user import User
from app.services.connector_agent_service import connector_agent_service

router = APIRouter(tags=["connector-agents"])


class AgentTestRequest(BaseModel):
    config: Optional[Dict[str, Any]] = None
    credentials: Optional[Dict[str, Any]] = None


class AgentSyncRequest(BaseModel):
    pass


@router.post(
    "/projects/{project_id}/connectors/{pc_id}/agent/test",
    response_model=dict,
    summary="Test connector connection via agent",
)
async def agent_test_connection(
    project_id: str,
    pc_id: str,
    body: AgentTestRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    """
    Run a connector test using the dedicated connector agent.

    Uses connector-specific auth and validation logic rather than
    the generic HTTP test in project_connector_service.
    """
    result = await connector_agent_service.test_connection(
        db=db,
        pc_id=pc_id,
        override_config=body.config,
        override_credentials=body.credentials,
        triggered_by=ExecutionTrigger.API,
        executor_id=current_user.id,
    )
    return result


@router.post(
    "/projects/{project_id}/connectors/{pc_id}/agent/sync",
    response_model=dict,
    summary="Run full health sync for a project connector",
)
async def agent_sync_health(
    project_id: str,
    pc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_project_admin),
):
    """
    Execute a full health sync for a project connector.

    Runs fetch_health() and fetch_metrics() on the appropriate connector
    agent, persists results, and returns normalized health data.
    """
    result = await connector_agent_service.sync_health(
        db=db,
        pc_id=pc_id,
        triggered_by=ExecutionTrigger.MANUAL,
        executor_id=current_user.id,
    )
    return result


@router.get(
    "/projects/{project_id}/connectors/{pc_id}/agent/status",
    response_model=dict,
    summary="Get latest agent status for a project connector",
)
async def get_agent_status(
    project_id: str,
    pc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recent agent status record for a project connector."""
    status_data = await connector_agent_service.get_status(db, pc_id)
    if status_data is None:
        return {
            "project_connector_id": pc_id,
            "health_status": "unknown",
            "last_sync_at": None,
            "last_error": None,
            "consecutive_failures": 0,
            "total_executions": 0,
            "uptime_percentage": None,
        }
    return status_data


@router.get(
    "/projects/{project_id}/connectors/{pc_id}/agent/logs",
    response_model=List[dict],
    summary="Get execution logs for a project connector",
)
async def get_agent_logs(
    project_id: str,
    pc_id: str,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return recent execution logs for a project connector, newest first."""
    logs = await connector_agent_service.get_execution_logs(db, pc_id, limit=limit)
    return logs


@router.get(
    "/projects/{project_id}/connectors/agent/statuses",
    response_model=List[dict],
    summary="Get agent statuses for all connectors in a project",
)
async def get_project_agent_statuses(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return agent health status for every connector assigned to a project."""
    statuses = await connector_agent_service.get_project_statuses(db, project_id)
    return statuses


@router.get(
    "/connectors/agents/registry",
    response_model=List[dict],
    summary="List all registered connector agent implementations",
)
async def list_connector_registry(
    current_user: User = Depends(get_current_user),
):
    """Return metadata for all registered connector agent implementations."""
    registry = ConnectorRegistry.list_registered()
    return [
        {
            "slug": slug,
            "name": getattr(cls, "CONNECTOR_NAME", slug),
            "version": getattr(cls, "CONNECTOR_VERSION", ""),
            "module": cls.__module__,
        }
        for slug, cls in registry.items()
    ]
