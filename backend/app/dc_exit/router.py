"""
Enterprise Digital Twin - DC Exit module (backend).

API router for the dc-exit workflow.
Placeholder only - no endpoints implemented yet.

This router is intentionally NOT wired into app.api.v1.router yet,
since no backend business logic has been requested.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/dc-exit", tags=["dc-exit"])
