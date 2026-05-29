"""
WebSocket Connection Manager.

Tracks active WebSocket connections and provides broadcast utilities
for pushing server-initiated events (e.g. rule violations) to clients.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Set

from fastapi import WebSocket

logger = logging.getLogger("healthmesh.ws_manager")


class ConnectionManager:
    """
    Tracks active WebSocket connections by project ID.

    Connections are registered on connect and removed on disconnect.
    Broadcasts are best-effort: a failed send to one client does not
    prevent delivery to others.
    """

    def __init__(self) -> None:
        # project_id -> set of active WebSocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}

    def connect(self, websocket: WebSocket, project_id: str) -> None:
        if project_id not in self._connections:
            self._connections[project_id] = set()
        self._connections[project_id].add(websocket)
        logger.debug("WS registered: project=%s total=%d", project_id, len(self._connections[project_id]))

    def disconnect(self, websocket: WebSocket, project_id: str) -> None:
        bucket = self._connections.get(project_id)
        if bucket:
            bucket.discard(websocket)
            if not bucket:
                del self._connections[project_id]

    async def broadcast_to_project(self, project_id: str, payload: Dict[str, Any]) -> None:
        """Send a JSON payload to all clients watching a specific project."""
        bucket = list(self._connections.get(project_id, []))
        if not bucket:
            return

        dead: List[WebSocket] = []
        for ws in bucket:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws, project_id)

    async def broadcast_global(self, payload: Dict[str, Any]) -> None:
        """Send a JSON payload to all connected clients across all projects."""
        for project_id in list(self._connections.keys()):
            await self.broadcast_to_project(project_id, payload)

    @property
    def active_project_ids(self) -> List[str]:
        return list(self._connections.keys())


ws_manager = ConnectionManager()
