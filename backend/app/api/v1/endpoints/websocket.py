"""
WebSocket streaming endpoints.

Routes:
  WS /projects/{project_id}/assignments/{assignment_id}/ws  — live dashboard metrics
  WS /runtime-location/ws                                   — runtime drift & asset-update events
"""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db
from app.services.project_dashboard_assignment_service import project_dashboard_assignment_service
from app.core.ws_manager import ws_manager

logger = logging.getLogger("healthmesh.websocket")

router = APIRouter(tags=["websocket"])

PUSH_INTERVAL = 5        # seconds between dashboard metric pushes
RUNTIME_PING_INTERVAL = 15  # seconds between keep-alive pings on runtime WS

_RUNTIME_CHANNEL = "__runtime_global__"


@router.websocket("/projects/{project_id}/assignments/{assignment_id}/ws")
async def project_dashboard_stream(
    websocket: WebSocket,
    project_id: str,
    assignment_id: str,
    hours: int = Query(default=24, ge=1, le=720),
    db: AsyncSession = Depends(get_db),
) -> None:
    await websocket.accept()
    ws_manager.connect(websocket, project_id)
    logger.info("WS connected: project=%s assignment=%s", project_id, assignment_id)

    try:
        while True:
            try:
                live = await project_dashboard_assignment_service.render_live_dashboard(
                    db, project_id, assignment_id, hours=hours
                )
                widgets = [w.model_dump() for w in live.widgets] if live else []

                health_summary: Optional[dict] = None
                if live and live.widgets:
                    health_summary = {
                        "widget_count": len(live.widgets),
                        "data_count": sum(1 for w in live.widgets if w.get("has_data")),
                    }

                await websocket.send_json({
                    "type": "metrics",
                    "widgets": widgets,
                    "health": health_summary,
                })
            except Exception as exc:
                logger.warning("WS render error: %s", exc)
                try:
                    await websocket.send_json({"type": "error", "message": str(exc)})
                except Exception:
                    break

            await asyncio.sleep(PUSH_INTERVAL)

    except WebSocketDisconnect:
        logger.info("WS disconnected: project=%s assignment=%s", project_id, assignment_id)
    except Exception as exc:
        logger.error("WS fatal error: %s", exc)
    finally:
        ws_manager.disconnect(websocket, project_id)


@router.websocket("/runtime-location/ws")
async def runtime_location_stream(websocket: WebSocket) -> None:
    """
    Global channel for runtime location events.
    Clients subscribe here to receive drift_detected and asset_updated events
    broadcast by the drift detection service after each import.
    """
    await websocket.accept()
    ws_manager.connect(websocket, _RUNTIME_CHANNEL)
    logger.info("Runtime WS connected (channel=%s)", _RUNTIME_CHANNEL)

    try:
        while True:
            await asyncio.sleep(RUNTIME_PING_INTERVAL)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except WebSocketDisconnect:
        logger.info("Runtime WS disconnected")
    except Exception as exc:
        logger.error("Runtime WS fatal error: %s", exc)
    finally:
        ws_manager.disconnect(websocket, _RUNTIME_CHANNEL)


async def broadcast_runtime_event(event: dict) -> None:
    """Broadcast a runtime event to all clients subscribed to the runtime channel."""
    await ws_manager.broadcast_to_project(_RUNTIME_CHANNEL, event)
