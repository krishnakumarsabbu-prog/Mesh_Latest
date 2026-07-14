"""
TraversalService — graph traversal over OntologyNode / OntologyEdge.

BFS/DFS over the persisted ontology graph to compute blast radius,
dependency paths, and downstream impact for a given DC exit scope.
Reuses blast_radius_service for runtime-level impact and delegates
confidence scoring to confidence_service.
"""
import logging
from collections import deque
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ontology import OntologyNode, OntologyEdge
from app.models.runtime import RuntimeAsset, ApplicationIntent
from app.services.blast_radius_service import calculate_blast_radius
from app.services.confidence_service import engine as confidence_engine

logger = logging.getLogger(__name__)


class TraversalService:
    """Traverse the ontology graph to compute impact, paths, and dependency scope."""

    async def traverse_from_node(
        self,
        db: AsyncSession,
        node_id: str,
        direction: str = "downstream",
        max_depth: int = 5,
        edge_types: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """BFS traversal from a single node, returning visited nodes + edges."""
        adj = await self._load_adjacency(db)
        visited_nodes: Set[str] = set()
        visited_edges: List[Dict[str, Any]] = []
        layers: List[List[str]] = []

        queue: deque = deque([(node_id, 0)])
        while queue:
            current_id, depth = queue.popleft()
            if depth > max_depth:
                continue
            if current_id in visited_nodes:
                continue
            visited_nodes.add(current_id)

            if depth >= len(layers):
                layers.append([])
            layers[depth].append(current_id)

            neighbors = adj.get(current_id, {}).get(direction, [])
            for nbr in neighbors:
                if nbr["target_id"] in visited_nodes:
                    continue
                if edge_types and nbr["edge_type"] not in edge_types:
                    continue
                visited_edges.append({
                    "source": current_id,
                    "target": nbr["target_id"],
                    "edge_type": nbr["edge_type"],
                    "label": nbr["label"],
                    "depth": depth + 1,
                })
                queue.append((nbr["target_id"], depth + 1))

        node_details = await self._fetch_nodes(db, list(visited_nodes))
        return {
            "root_node_id": node_id,
            "direction": direction,
            "max_depth": max_depth,
            "visited_node_ids": list(visited_nodes),
            "layers": layers,
            "nodes": node_details,
            "edges": visited_edges,
            "total_nodes": len(visited_nodes),
            "total_edges": len(visited_edges),
            "traversed_at": datetime.utcnow().isoformat() + "Z",
        }

    async def compute_dc_exit_scope(
        self,
        db: AsyncSession,
        data_center_short: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        """
        Compute the full dependency scope for a DC exit.
        Traverses the ontology graph from all nodes tied to the target DC,
        then cross-references with blast_radius_service for runtime impact.
        """
        # Find all ontology nodes tied to this DC
        all_nodes_res = await db.execute(
            select(OntologyNode).where(OntologyNode.tenant_id == tenant_id)
        )
        all_nodes = all_nodes_res.scalars().all()

        dc_node_ids: List[str] = []
        asset_node_ids: List[str] = []
        for n in all_nodes:
            meta = n.metadata_json or {}
            if n.ontology_class == "DataCenter" and meta.get("short_name") == data_center_short:
                dc_node_ids.append(n.id)
            if n.domain in ("data", "messaging", "compute", "network") and meta.get("data_center") == data_center_short:
                asset_node_ids.append(n.id)

        # Traverse downstream from each asset node
        all_impacted_ids: Set[str] = set()
        all_path_edges: List[Dict[str, Any]] = []
        for asset_id in asset_node_ids:
            result = await self.traverse_from_node(db, asset_id, direction="downstream", max_depth=3)
            all_impacted_ids.update(result["visited_node_ids"])
            all_path_edges.extend(result["edges"])

        # Cross-reference with blast radius for runtime-level impact
        try:
            blast = await calculate_blast_radius(data_center_short, db)
            blast_json = {
                "total_apps_impacted": blast.total_apps_impacted,
                "critical_count": blast.critical_count,
                "warning_count": blast.warning_count,
                "estimated_recovery_summary": blast.estimated_recovery_summary,
            }
        except Exception as exc:
            logger.warning("blast_radius unavailable for %s: %s", data_center_short, exc)
            blast_json = None

        impacted_nodes = await self._fetch_nodes(db, list(all_impacted_ids))

        return {
            "data_center": data_center_short,
            "dc_node_ids": dc_node_ids,
            "source_asset_count": len(asset_node_ids),
            "impacted_node_count": len(all_impacted_ids),
            "impacted_nodes": impacted_nodes,
            "path_edges": all_path_edges,
            "blast_radius": blast_json,
            "computed_at": datetime.utcnow().isoformat() + "Z",
        }

    async def find_dependency_paths(
        self,
        db: AsyncSession,
        source_node_key: str,
        target_node_key: str,
        max_depth: int = 6,
    ) -> Dict[str, Any]:
        """Find all simple paths between two nodes by node_key."""
        src_res = await db.execute(
            select(OntologyNode).where(OntologyNode.node_key == source_node_key)
        )
        src = src_res.scalar_one_or_none()
        tgt_res = await db.execute(
            select(OntologyNode).where(OntologyNode.node_key == target_node_key)
        )
        tgt = tgt_res.scalar_one_or_none()
        if not src or not tgt:
            return {"paths": [], "error": "source or target node not found"}

        adj = await self._load_adjacency(db)
        paths = self._find_all_paths(adj, src.id, tgt.id, max_depth)
        all_node_ids: Set[str] = set()
        for path in paths:
            all_node_ids.update(path)
        node_details = await self._fetch_nodes(db, list(all_node_ids))

        return {
            "source": source_node_key,
            "target": target_node_key,
            "path_count": len(paths),
            "paths": paths,
            "nodes": node_details,
            "found_at": datetime.utcnow().isoformat() + "Z",
        }

    # ── internals ──────────────────────────────────────────────────────────────

    async def _load_adjacency(self, db: AsyncSession) -> Dict[str, Dict[str, List[Dict[str, Any]]]]:
        """Load all edges into an adjacency map with downstream/upstream lists."""
        edge_res = await db.execute(select(OntologyEdge))
        edges = edge_res.scalars().all()

        adj: Dict[str, Dict[str, List[Dict[str, Any]]]] = {}
        for e in edges:
            adj.setdefault(e.source_node_id, {"downstream": [], "upstream": []})
            adj.setdefault(e.target_node_id, {"downstream": [], "upstream": []})
            adj[e.source_node_id]["downstream"].append({
                "target_id": e.target_node_id,
                "edge_type": e.edge_type,
                "label": e.label,
            })
            adj[e.target_node_id]["upstream"].append({
                "target_id": e.source_node_id,
                "edge_type": e.edge_type,
                "label": e.label,
            })
        return adj

    def _find_all_paths(
        self,
        adj: Dict[str, Dict[str, List[Dict[str, Any]]]],
        source: str,
        target: str,
        max_depth: int,
    ) -> List[List[str]]:
        """DFS to find all simple paths from source to target."""
        paths: List[List[str]] = []

        def dfs(current: str, path: List[str], depth: int):
            if depth > max_depth:
                return
            if current == target:
                paths.append(list(path))
                return
            for nbr in adj.get(current, {}).get("downstream", []):
                nid = nbr["target_id"]
                if nid not in path:
                    dfs(nid, path + [nid], depth + 1)

        dfs(source, [source], 0)
        return paths

    async def _fetch_nodes(self, db: AsyncSession, node_ids: List[str]) -> List[Dict[str, Any]]:
        if not node_ids:
            return []
        res = await db.execute(
            select(OntologyNode).where(OntologyNode.id.in_(node_ids))
        )
        rows = res.scalars().all()
        return [
            {
                "id": n.id,
                "node_key": n.node_key,
                "label": n.label,
                "domain": n.domain,
                "ontology_class": n.ontology_class,
                "status": n.status,
                "metadata": n.metadata_json,
            }
            for n in rows
        ]


traversal_service = TraversalService()
