"""
DC Exit Workflow API endpoints.

Endpoints:
  GET    /dc-exit/ontology/graph          — ontology graph (nodes + edges)
  GET    /dc-exit/ontology/domains        — distinct domains with counts
  POST   /dc-exit/ontology/build          — rebuild ontology from runtime data
  POST   /dc-exit/traverse                — BFS traversal from a node
  POST   /dc-exit/traverse/dc-scope       — DC exit dependency scope
  POST   /dc-exit/traverse/paths          — find paths between two nodes
  GET    /dc-exit/readiness               — readiness assessment
  GET    /dc-exit/readiness/blockers      — readiness blockers only
  GET    /dc-exit/decision                — full decision package
  GET    /dc-exit/decision/verdict        — verdict summary only
  GET    /dc-exit/decision/prioritization — wave plan only
  GET    /dc-exit/validation              — full validation report
  GET    /dc-exit/validation/checklist    — checklist only
  GET    /dc-exit/validation/drift        — drift report
  GET    /dc-exit/validation/confidence   — confidence breakdown
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_db, AsyncSessionLocal
from app.dc_exit.ontology_service import ontology_service
from app.dc_exit.traversal_service import traversal_service
from app.dc_exit.readiness_service import readiness_service
from app.dc_exit.decision_service import decision_service
from app.dc_exit.validation_service import validation_service
from app.dc_exit.failover_view_service import failover_view_service
from app.dc_exit.orchestrator import saga_orchestrator


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dc-exit", tags=["dc-exit"])


# ─── Failover View ────────────────────────────────────────────────────────────

@router.get("/failover-view", response_model=Dict[str, Any])
async def get_failover_view(
    source_dc: str = Query(..., description="Source DC short name"),
    target_dc: str = Query(..., description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Return the 6-layer Failover View ontology projection from source_dc to target_dc."""
    return await failover_view_service.get_failover_view(db, source_dc, target_dc)



# ─── Ontology ─────────────────────────────────────────────────────────────────

@router.get("/ontology/graph", response_model=Dict[str, Any])
async def get_ontology_graph(
    domain: Optional[str] = Query(None, description="Filter by domain"),
    db: AsyncSession = Depends(get_db),
):
    """Return the persisted ontology graph as JSON nodes + edges."""
    return await ontology_service.get_graph(db, domain=domain)


@router.get("/ontology/domains", response_model=List[Dict[str, Any]])
async def get_ontology_domains(db: AsyncSession = Depends(get_db)):
    """Return distinct ontology domains with node counts."""
    return await ontology_service.get_domains(db)


@router.post("/ontology/build", response_model=Dict[str, Any])
async def build_ontology_graph(db: AsyncSession = Depends(get_db)):
    """Rebuild the ontology graph from RuntimeAsset + Component data."""
    return await ontology_service.build_graph(db)


# ─── Traversal ────────────────────────────────────────────────────────────────

@router.post("/traverse", response_model=Dict[str, Any])
async def traverse_from_node(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    BFS traversal from a single ontology node.
    Body: { "node_id": "...", "direction": "downstream|upstream", "max_depth": 5, "edge_types": [] }
    """
    node_id = data.get("node_id")
    if not node_id:
        raise HTTPException(status_code=400, detail="Missing 'node_id' field")
    direction = data.get("direction", "downstream")
    max_depth = data.get("max_depth", 5)
    edge_types = data.get("edge_types")
    return await traversal_service.traverse_from_node(db, node_id, direction, max_depth, edge_types)


@router.post("/traverse/dc-scope", response_model=Dict[str, Any])
async def compute_dc_exit_scope(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    Compute the full dependency scope for a DC exit.
    Body: { "data_center_short": "ASH-DC1" }
    """
    dc_short = data.get("data_center_short")
    if not dc_short:
        raise HTTPException(status_code=400, detail="Missing 'data_center_short' field")
    return await traversal_service.compute_dc_exit_scope(db, dc_short)


@router.post("/traverse/paths", response_model=Dict[str, Any])
async def find_dependency_paths(
    data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
):
    """
    Find all simple paths between two ontology nodes.
    Body: { "source_node_key": "app:payments", "target_node_key": "dc:ASH-DC1", "max_depth": 6 }
    """
    source_key = data.get("source_node_key")
    target_key = data.get("target_node_key")
    if not source_key or not target_key:
        raise HTTPException(status_code=400, detail="Missing 'source_node_key' or 'target_node_key'")
    max_depth = data.get("max_depth", 6)
    return await traversal_service.find_dependency_paths(db, source_key, target_key, max_depth)


# ─── Readiness ────────────────────────────────────────────────────────────────

@router.get("/readiness", response_model=Dict[str, Any])
async def get_readiness(
    data_center: str = Query(..., description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Full readiness assessment for a DC exit."""
    return await readiness_service.assess(db, data_center)


@router.get("/readiness/blockers", response_model=Dict[str, Any])
async def get_readiness_blockers(
    data_center: str = Query(..., description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Return only the readiness blockers for a DC."""
    return await readiness_service.get_blockers(db, data_center)


# ─── Decision ─────────────────────────────────────────────────────────────────

@router.get("/decision", response_model=Dict[str, Any])
async def get_decision(
    data_center: str = Query(..., description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Full decision package: verdict + prioritization + evidence + reasoning."""
    return await decision_service.get_decision(db, data_center)


@router.get("/decision/verdict", response_model=Dict[str, Any])
async def get_verdict(
    data_center: str = Query(..., description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Return only the verdict summary."""
    return await decision_service.get_verdict(db, data_center)


@router.get("/decision/prioritization", response_model=Dict[str, Any])
async def get_prioritization(
    data_center: str = Query(..., description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Return only the prioritization / wave plan."""
    return await decision_service.get_prioritization(db, data_center)


# ─── Validation ───────────────────────────────────────────────────────────────

@router.get("/validation", response_model=Dict[str, Any])
async def get_validation(
    data_center: str = Query(..., description="Source DC short name"),
    target_dc: Optional[str] = Query(None, description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Full validation report for a DC exit cutover."""
    return await validation_service.validate(db, data_center, target_dc)


@router.get("/validation/checklist", response_model=Dict[str, Any])
async def get_validation_checklist(
    data_center: str = Query(..., description="Source DC short name"),
    target_dc: Optional[str] = Query(None, description="Target DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Return only the validation checklist."""
    return await validation_service.get_checklist(db, data_center, target_dc)


@router.get("/validation/drift", response_model=Dict[str, Any])
async def get_drift_report(
    environment: str = Query("PRODUCTION", description="Environment filter"),
    db: AsyncSession = Depends(get_db),
):
    """Return drift detection results across all applications."""
    return await validation_service.get_drift_report(db, environment)


@router.get("/validation/confidence", response_model=Dict[str, Any])
async def get_validation_confidence(
    data_center: str = Query(..., description="DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Return per-source confidence signal breakdown."""
    return await validation_service.get_confidence_breakdown(db, data_center)


@router.get("/validation/residual-traffic", response_model=Dict[str, Any])
async def get_residual_traffic(
    data_center: str = Query(..., description="Source DC short name"),
    db: AsyncSession = Depends(get_db),
):
    """Scan and verify that zero active connections remain on the source DC."""
    return await validation_service.get_residual_traffic_report(db, data_center)


# ─── Migration Orchestration ──────────────────────────────────────────────────

@router.post("/migrate/start", response_model=Dict[str, Any])
async def start_migration(
    session_id: str = Query(..., description="DC Exit session ID"),
    source_dc: str = Query(..., description="Source datacenter name"),
    target_dc: str = Query(..., description="Target datacenter name"),
    mode: str = Query("STAGED", description="Orchestration mode (DRY_RUN | STAGED | EXPRESS)"),
):
    """Start a stateful migration cutover."""
    run = await saga_orchestrator.start_migration(AsyncSessionLocal, session_id, source_dc, target_dc, mode)
    return {"run_id": run.id, "status": run.status, "message": "Migration run initiated successfully"}


@router.get("/migrate/status/{run_id}", response_model=Dict[str, Any])
async def get_migration_status(
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve the status and audit logs of a migration run."""
    status = await saga_orchestrator.get_run_status(db, run_id)
    if "error" in status:
        raise HTTPException(status_code=404, detail=status["error"])
    return status


@router.post("/migrate/pause/{run_id}", response_model=Dict[str, Any])
async def pause_migration(
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Pause a running migration execution."""
    success = await saga_orchestrator.pause_migration(db, run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot pause migration (run not found or not running)")
    return {"message": "Migration run paused successfully"}


@router.post("/migrate/resume/{run_id}", response_model=Dict[str, Any])
async def resume_migration(
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused migration execution."""
    success = await saga_orchestrator.resume_migration(db, AsyncSessionLocal, run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot resume migration (run not found or not paused)")
    return {"message": "Migration run resumed successfully"}


@router.post("/migrate/rollback/{run_id}", response_model=Dict[str, Any])
async def rollback_migration(
    run_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Roll back a migration run by executing compensating actions."""
    success = await saga_orchestrator.rollback_migration(db, AsyncSessionLocal, run_id)
    if not success:
        raise HTTPException(status_code=400, detail="Cannot rollback migration")
    return {"message": "Migration rollback initiated successfully"}

