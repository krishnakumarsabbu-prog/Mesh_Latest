"""
OntologyService — builds and persists the enterprise ontology graph
from existing RuntimeAsset + Component (ApplicationComponent) records.

Reads RuntimeAsset (runtime topology) and Component (application catalog)
to synthesize OntologyNode / OntologyEdge rows. No duplicate runtime logic;
it delegates confidence scoring to confidence_service.
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.runtime import RuntimeAsset, RuntimeDataCenter
from app.models.component import Component
from app.models.ontology import OntologyNode, OntologyEdge
from app.services.confidence_service import engine as confidence_engine

logger = logging.getLogger(__name__)

# Map tech_stack -> ontology domain + class
_TECH_DOMAIN: Dict[str, str] = {
    "oracle": "data",
    "mssql": "data",
    "mongodb": "data",
    "ibm_mq": "messaging",
    "kafka": "messaging",
    "ocp": "compute",
    "vm": "compute",
    "avi_loadbalancer": "network",
    "dns": "network",
}

_TECH_CLASS: Dict[str, str] = {
    "oracle": "OracleDatabase",
    "mssql": "MssqlDatabase",
    "mongodb": "MongoCluster",
    "ibm_mq": "MqQueueManager",
    "kafka": "KafkaBroker",
    "ocp": "OcpPod",
    "vm": "VirtualMachine",
    "avi_loadbalancer": "VirtualIP",
    "dns": "DnsZone",
}


class OntologyService:
    """Materialize the enterprise ontology graph from live runtime + catalog data."""

    async def build_graph(self, db: AsyncSession, tenant_id: str = "default") -> Dict[str, Any]:
        """Rebuild ontology_nodes + ontology_edges from RuntimeAsset and Component."""
        # Wipe existing tenant graph
        await db.execute(
            delete(OntologyEdge).where(OntologyEdge.tenant_id == tenant_id)
        )
        await db.execute(
            delete(OntologyNode).where(OntologyNode.tenant_id == tenant_id)
        )

        nodes, edges = await self._materialize(db, tenant_id)
        return {
            "tenant_id": tenant_id,
            "node_count": len(nodes),
            "edge_count": len(edges),
            "rebuilt_at": datetime.utcnow().isoformat() + "Z",
        }

    async def get_graph(
        self,
        db: AsyncSession,
        tenant_id: str = "default",
        domain: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Return the persisted ontology graph as JSON nodes + edges."""
        node_q = select(OntologyNode).where(OntologyNode.tenant_id == tenant_id)
        if domain:
            node_q = node_q.where(OntologyNode.domain == domain)
        node_res = await db.execute(node_q)
        node_rows = node_res.scalars().all()
        node_ids = [n.id for n in node_rows]

        edge_res = await db.execute(
            select(OntologyEdge).where(
                OntologyEdge.tenant_id == tenant_id,
                OntologyEdge.source_node_id.in_(node_ids),
            )
        )
        edge_rows = edge_res.scalars().all()

        return {
            "nodes": [self._node_json(n) for n in node_rows],
            "edges": [self._edge_json(e) for e in edge_rows],
            "node_count": len(node_rows),
            "edge_count": len(edge_rows),
        }

    async def get_domains(self, db: AsyncSession, tenant_id: str = "default") -> List[Dict[str, Any]]:
        """Return distinct domains with counts."""
        res = await db.execute(
            select(OntologyNode.domain).where(OntologyNode.tenant_id == tenant_id)
        )
        all_domains = res.scalars().all()
        counts: Dict[str, int] = {}
        for d in all_domains:
            counts[d] = counts.get(d, 0) + 1
        return [
            {"domain": d, "node_count": c}
            for d, c in sorted(counts.items(), key=lambda x: x[0])
        ]

    # ── internals ──────────────────────────────────────────────────────────────

    async def _materialize(
        self, db: AsyncSession, tenant_id: str
    ) -> tuple[List[OntologyNode], List[OntologyEdge]]:
        nodes: List[OntologyNode] = []
        edges: List[OntologyEdge] = []

        # 1. Application nodes from Component catalog
        comp_res = await db.execute(select(Component).where(Component.tenant_id == tenant_id))
        components = comp_res.scalars().all()
        comp_node_map: Dict[str, OntologyNode] = {}

        for comp in components:
            node = OntologyNode(
                id=str(uuid.uuid4()),
                node_key=f"app:{comp.slug}",
                label=comp.name,
                domain="applications",
                ontology_class="Application",
                icon=comp.icon or "AppWindow",
                color=comp.color or "#3B82F6",
                status="healthy",
                tenant_id=tenant_id,
                metadata_json={"component_id": comp.id, "team_id": comp.team_id, "lob_id": comp.lob_id},
            )
            db.add(node)
            nodes.append(node)
            comp_node_map[comp.slug] = node

        # 2. Data Center nodes
        dc_res = await db.execute(select(RuntimeDataCenter))
        dcs = dc_res.scalars().all()
        dc_node_map: Dict[str, OntologyNode] = {}

        for dc in dcs:
            node = OntologyNode(
                id=str(uuid.uuid4()),
                node_key=f"dc:{dc.short_name}",
                label=dc.name,
                domain="runtime",
                ontology_class="DataCenter",
                icon="Building2",
                color="#10B981",
                status="healthy",
                tenant_id=tenant_id,
                metadata_json={"short_name": dc.short_name, "region": dc.region, "zone": dc.zone},
            )
            db.add(node)
            nodes.append(node)
            dc_node_map[dc.short_name] = node

        # 3. Asset nodes from RuntimeAsset, grouped by app + tech_stack
        asset_res = await db.execute(select(RuntimeAsset))
        assets = asset_res.scalars().all()

        app_asset_groups: Dict[str, List[RuntimeAsset]] = {}
        infra_groups: Dict[str, List[RuntimeAsset]] = {}

        for a in assets:
            meta = a.metadata_json or {}
            app_id = meta.get("application_id")
            if app_id:
                app_asset_groups.setdefault(app_id, []).append(a)
            elif a.data_source in ("ibm_mq", "mongodb", "oracle_oem"):
                infra_key = {"ibm_mq": "MQ_INFRA", "mongodb": "MONGO_INFRA", "oracle_oem": "ORACLE_INFRA"}[a.data_source]
                infra_groups.setdefault(infra_key, []).append(a)

        # Asset nodes
        for app_id, app_assets in app_asset_groups.items():
            confidence = confidence_engine.score_application(app_assets)
            for a in app_assets:
                domain = _TECH_DOMAIN.get(a.tech_stack, "compute")
                cls = _TECH_CLASS.get(a.tech_stack, "RuntimeAsset")
                asset_node = OntologyNode(
                    id=str(uuid.uuid4()),
                    node_key=f"asset:{a.id}",
                    label=a.name,
                    domain=domain,
                    ontology_class=cls,
                    icon="Server",
                    color=self._health_color(a.latest_operational_state),
                    status=self._state_to_health(a.latest_operational_state),
                    tenant_id=tenant_id,
                    metadata_json={
                        "tech_stack": a.tech_stack,
                        "environment": a.environment,
                        "data_center": a.data_center_short,
                        "application_id": app_id,
                        "confidence_score": confidence.score,
                        "confidence_label": confidence.level,
                    },
                )
                db.add(asset_node)
                nodes.append(asset_node)

                # Edge: application -> asset (owns)
                comp_slug = self._slug_from_app_id(app_id)
                comp_node = comp_node_map.get(comp_slug)
                if comp_node:
                    edges.append(self._make_edge(db, comp_node.id, asset_node.id, "owns", "owns", tenant_id))

                # Edge: asset -> datacenter (runs_in)
                dc_node = dc_node_map.get(a.data_center_short) if a.data_center_short else None
                if dc_node:
                    edges.append(self._make_edge(db, asset_node.id, dc_node.id, "runs_in", "runs in", tenant_id))

        # Infra asset nodes (shared platforms without a Component)
        for infra_key, infra_assets in infra_groups.items():
            for a in infra_assets:
                domain = _TECH_DOMAIN.get(a.tech_stack, "compute")
                cls = _TECH_CLASS.get(a.tech_stack, "RuntimeAsset")
                asset_node = OntologyNode(
                    id=str(uuid.uuid4()),
                    node_key=f"asset:{a.id}",
                    label=a.name,
                    domain=domain,
                    ontology_class=cls,
                    icon="Server",
                    color=self._health_color(a.latest_operational_state),
                    status=self._state_to_health(a.latest_operational_state),
                    tenant_id=tenant_id,
                    metadata_json={
                        "tech_stack": a.tech_stack,
                        "environment": a.environment,
                        "data_center": a.data_center_short,
                        "application_id": infra_key,
                        "is_infra": True,
                    },
                )
                db.add(asset_node)
                nodes.append(asset_node)

                dc_node = dc_node_map.get(a.data_center_short) if a.data_center_short else None
                if dc_node:
                    edges.append(self._make_edge(db, asset_node.id, dc_node.id, "runs_in", "runs in", tenant_id))

        await db.commit()
        return nodes, edges

    def _make_edge(
        self, db: AsyncSession, source_id: str, target_id: str, edge_type: str, label: str, tenant_id: str
    ) -> OntologyEdge:
        edge = OntologyEdge(
            id=str(uuid.uuid4()),
            source_node_id=source_id,
            target_node_id=target_id,
            edge_type=edge_type,
            label=label,
            tenant_id=tenant_id,
        )
        db.add(edge)
        return edge

    def _slug_from_app_id(self, app_id: str) -> str:
        return app_id.lower().replace("_", "-").replace(" ", "-")

    def _state_to_health(self, state: Optional[str]) -> str:
        s = (state or "").upper()
        if s in ("ACTIVE", "ONLINE", "STANDBY"):
            return "healthy"
        if s in ("DEGRADED",):
            return "degraded"
        if s in ("INACTIVE", "DOWN", "OFFLINE"):
            return "down"
        return "unknown"

    def _health_color(self, state: Optional[str]) -> str:
        h = self._state_to_health(state)
        return {"healthy": "#00B074", "degraded": "#FFB100", "down": "#FF003C"}.get(h, "#64748B")

    def _node_json(self, n: OntologyNode) -> Dict[str, Any]:
        return {
            "id": n.id,
            "node_key": n.node_key,
            "label": n.label,
            "domain": n.domain,
            "ontology_class": n.ontology_class,
            "sub_class_of": n.sub_class_of,
            "icon": n.icon,
            "color": n.color,
            "status": n.status,
            "is_root": n.is_root,
            "parent_id": n.parent_id,
            "properties": n.properties_json,
            "metadata": n.metadata_json,
        }

    def _edge_json(self, e: OntologyEdge) -> Dict[str, Any]:
        return {
            "id": e.id,
            "source": e.source_node_id,
            "target": e.target_node_id,
            "edge_type": e.edge_type,
            "label": e.label,
            "is_animated": e.is_animated,
            "weight": e.weight,
            "properties": e.properties_json,
        }


ontology_service = OntologyService()
