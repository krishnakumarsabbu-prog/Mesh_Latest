"""
WebSocket streaming endpoints.

Routes:
  WS /runtime-location/ws                                   — runtime drift & asset-update events
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.ws_manager import ws_manager

logger = logging.getLogger("healthmesh.websocket")

router = APIRouter(tags=["websocket"])

RUNTIME_PING_INTERVAL = 15  # seconds between keep-alive pings on runtime WS

_RUNTIME_CHANNEL = "__runtime_global__"


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
