import logging
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Set
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.runtime import RuntimeAsset, ApplicationIntent, RuntimeDataCenter
from app.models.ontology import OntologyNode, OntologyEdge
from app.dc_exit.traversal_service import traversal_service
from app.dc_exit.decision_service import decision_service

logger = logging.getLogger(__name__)


class FailoverViewService:
    """Computes a 6-layer Failover View ontology projection from Source DC to Target DC."""

    async def get_failover_view(
        self,
        db: AsyncSession,
        source_dc: str,
        target_dc: str,
        tenant_id: str = "default",
    ) -> Dict[str, Any]:
        # Validate DCs
        dc_res = await db.execute(select(RuntimeDataCenter))
        dcs = {d.short_name: d for d in dc_res.scalars().all()}
        
        if source_dc not in dcs:
            logger.warning(f"Source DC {source_dc} not found in database. Using mock fallback.")
        if target_dc not in dcs:
            logger.warning(f"Target DC {target_dc} not found in database. Using mock fallback.")

        # Fetch all production runtime assets in source DC
        result = await db.execute(
            select(RuntimeAsset).where(
                RuntimeAsset.data_center_short == source_dc,
                RuntimeAsset.environment == "PRODUCTION"
            )
        )
        source_assets = result.scalars().all()

        # Fetch all production assets in target DC to resolve standbys/replicas
        target_result = await db.execute(
            select(RuntimeAsset).where(
                RuntimeAsset.data_center_short == target_dc,
                RuntimeAsset.environment == "PRODUCTION"
            )
        )
        target_assets = target_result.scalars().all()

        # --- Layer 1: Affected Application Set ---
        resident_apps = self._resolve_resident_apps(source_assets)
        dependent_apps = await self._resolve_dependent_apps(db, resident_apps, source_dc)

        # --- Layer 2: Compute Failover Units & Capacity Check ---
        compute_info = self._build_compute_layer(source_assets, target_assets, resident_apps)

        # --- Layer 3: Storage Plane View ---
        storage_info = self._build_storage_layer(source_assets, target_assets)

        # --- Layer 4: Integration Plane View (Kafka / MQ) ---
        integration_info = self._build_integration_layer(source_assets, target_assets)

        # --- Layer 5: Downstream Configuration Change View ---
        config_info = self._build_config_layer(source_assets, target_assets, resident_apps)

        # --- Layer 6: Wave-Ordered Migration Plan ---
        waves_info = await self._build_wave_plan(db, resident_apps, source_dc)

        return {
            "source_dc": source_dc,
            "target_dc": target_dc,
            "summary": {
                "total_resident_apps": len(resident_apps),
                "total_dependent_apps": len(dependent_apps),
                "total_compute_units": len(compute_info["units"]),
                "total_storage_clusters": len(storage_info["clusters"]),
                "total_integration_channels": len(integration_info["channels"]),
                "readiness_verdict": "READY" if len(storage_info["blockers"]) == 0 else "BLOCKED",
            },
            "layer_1_apps": {
                "resident": resident_apps,
                "dependent": dependent_apps,
            },
            "layer_2_compute": compute_info,
            "layer_3_storage": storage_info,
            "layer_4_integration": integration_info,
            "layer_5_config": config_info,
            "layer_6_waves": waves_info,
            "timestamp": datetime.utcnow().isoformat() + "Z",
        }

    def _resolve_resident_apps(self, source_assets: List[RuntimeAsset]) -> List[Dict[str, Any]]:
        apps_map = {}
        for a in source_assets:
            app_id = (a.metadata_json or {}).get("application_id")
            if not app_id:
                # Fallbacks for infra types
                if a.tech_stack == "ibm_mq":
                    app_id = "MQ_INFRA"
                elif a.tech_stack == "mongodb":
                    app_id = "MONGO_INFRA"
                elif a.tech_stack == "oracle":
                    app_id = "ORACLE_INFRA"
                else:
                    continue

            app_name = (a.metadata_json or {}).get("application_name", app_id)
            if app_id not in apps_map:
                apps_map[app_id] = {
                    "app_id": app_id,
                    "app_name": app_name,
                    "tier": "CRITICAL" if app_id in ("PAYMENT", "CLAIMS", "BILLING") else "MEDIUM",
                    "asset_count": 0,
                    "tech_stacks": set(),
                }
            apps_map[app_id]["asset_count"] += 1
            apps_map[app_id]["tech_stacks"].add(a.tech_stack)

        return [
            {
                "app_id": v["app_id"],
                "app_name": v["app_name"],
                "tier": v["tier"],
                "asset_count": v["asset_count"],
                "tech_stacks": list(v["tech_stacks"]),
            }
            for v in apps_map.values()
        ]

    async def _resolve_dependent_apps(
        self, db: AsyncSession, resident_apps: List[Dict[str, Any]], source_dc: str
    ) -> List[Dict[str, Any]]:
        resident_ids = {a["app_id"] for a in resident_apps}
        
        # Load all production assets outside source_dc
        res = await db.execute(
            select(RuntimeAsset).where(
                RuntimeAsset.data_center_short != source_dc,
                RuntimeAsset.environment == "PRODUCTION"
            )
        )
        external_assets = res.scalars().all()

        dependent_map = {}
        for a in external_assets:
            app_id = (a.metadata_json or {}).get("application_id")
            if not app_id or app_id in resident_ids:
                continue

            # Check if this app shares a messaging group or depends on resident app (synthesized link)
            is_dependent = False
            app_name = (a.metadata_json or {}).get("application_name", app_id)
            
            # Simulated dependency rules:
            # Payment systems depend on Auth Systems
            # Billing depends on Payment systems
            # Claims depends on Auth and Database
            if app_id == "BILLING" and "PAYMENT" in resident_ids:
                is_dependent = True
            elif app_id == "CLAIMS" and "1AUTHB" in resident_ids:
                is_dependent = True
            elif random.random() < 0.15: # Random noise dependency for other systems
                is_dependent = True

            if is_dependent and app_id not in dependent_map:
                dependent_map[app_id] = {
                    "app_id": app_id,
                    "app_name": app_name,
                    "tier": "CRITICAL" if app_id in ("PAYMENT", "CLAIMS", "BILLING") else "MEDIUM",
                    "dependency_type": "API" if app_id == "BILLING" else "DATABASE",
                    "impact_severity": "HIGH" if app_id in ("PAYMENT", "CLAIMS") else "MEDIUM",
                }

        return list(dependent_map.values())

    def _build_compute_layer(
        self, source_assets: List[RuntimeAsset], target_assets: List[RuntimeAsset], resident_apps: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        units = []
        app_ids = {a["app_id"] for a in resident_apps}

        # Source clusters
        source_compute = [a for a in source_assets if a.tech_stack == "ocp"]
        target_compute = [a for a in target_assets if a.tech_stack == "ocp"]

        # Simple OCP Cluster name mappings
        cluster_mapping = {
            "ocp-prd-dc-a": "ocp-prd-dc-b",
            "ocp-prd-ga": "ocp-prd-ma",
            "default": "ocp-prd-failover"
        }

        required_cpu = 0
        required_mem = 0

        for asset in source_compute:
            meta = asset.metadata_json or {}
            app_id = meta.get("application_id", "MQ_INFRA")
            if app_id not in app_ids:
                continue
            
            cluster = meta.get("cluster", "ocp-prd-ga")
            namespace = meta.get("namespace", f"{app_id.lower()}-prod")
            replicas = meta.get("replicas", 2)
            
            # Resource estimates (2 cores, 4GB RAM per replica)
            cpu = replicas * 2
            mem = replicas * 4
            required_cpu += cpu
            required_mem += mem

            target_cluster = cluster_mapping.get(cluster, cluster_mapping["default"])

            units.append({
                "app_id": app_id,
                "asset_id": asset.id,
                "name": asset.name,
                "source_cluster": cluster,
                "source_namespace": namespace,
                "replicas": replicas,
                "target_cluster": target_cluster,
                "target_namespace": namespace,
                "cpu_cores_required": cpu,
                "memory_gb_required": mem,
                "status": "READY",
            })

        # Calculate target headroom
        total_target_cpu = 1000
        total_target_mem = 4000
        used_target_cpu = sum(t.metadata_json.get("replicas", 2) * 2 for t in target_compute if t.metadata_json)
        used_target_mem = sum(t.metadata_json.get("replicas", 2) * 4 for t in target_compute if t.metadata_json)

        available_cpu = total_target_cpu - used_target_cpu
        available_mem = total_target_mem - used_target_mem

        capacity_adequate = (available_cpu >= required_cpu) and (available_mem >= required_mem)

        return {
            "units": units,
            "capacity_check": {
                "required_cpu_cores": required_cpu,
                "required_memory_gb": required_mem,
                "available_cpu_cores": available_cpu,
                "available_memory_gb": available_mem,
                "status": "ADEQUATE" if capacity_adequate else "WARNING",
                "headroom_percent": int((available_cpu - required_cpu) / total_target_cpu * 100) if total_target_cpu else 100,
            }
        }

    def _build_storage_layer(
        self, source_assets: List[RuntimeAsset], target_assets: List[RuntimeAsset]
    ) -> Dict[str, Any]:
        clusters = []
        blockers = []

        source_db = [a for a in source_assets if a.tech_stack in ("oracle", "mssql", "mongodb")]
        target_db = [a for a in target_assets if a.tech_stack in ("oracle", "mssql", "mongodb")]

        # Match source DBs with target standbys
        for s in source_db:
            db_name = (s.metadata_json or {}).get("db_name") or s.name
            
            # Try to find matching DB in target DC
            standby = None
            for t in target_db:
                t_name = (t.metadata_json or {}).get("db_name") or t.name
                if t_name == db_name:
                    standby = t
                    break
            
            if standby:
                role = standby.latest_replication_role or "STANDBY"
                lag = random.randint(0, 4) # mock lag in seconds
                
                status = "SYNCHRONIZED"
                if lag > 10:
                    status = "LAG_WARNING"
                elif lag > 60:
                    status = "OUT_OF_SYNC"

                clusters.append({
                    "db_name": db_name,
                    "tech_stack": s.tech_stack,
                    "source_node": s.name,
                    "source_role": s.latest_replication_role or "PRIMARY",
                    "target_node": standby.name,
                    "target_role": role,
                    "replication_lag_seconds": lag,
                    "status": status,
                    "classification": "PROMOTE_LOCAL" if s.latest_operational_state == "ACTIVE" and standby.latest_operational_state == "ACTIVE" else "FAILOVER",
                })
            else:
                # No standby cluster found - Blocker!
                blockers.append(f"No standby database cluster configured in target DC for database: {db_name}")
                clusters.append({
                    "db_name": db_name,
                    "tech_stack": s.tech_stack,
                    "source_node": s.name,
                    "source_role": "PRIMARY",
                    "target_node": "NONE",
                    "target_role": "NONE",
                    "replication_lag_seconds": -1,
                    "status": "UNREPLICATED",
                    "classification": "BLOCKER",
                })

        return {
            "clusters": clusters,
            "blockers": blockers,
        }

    def _build_integration_layer(
        self, source_assets: List[RuntimeAsset], target_assets: List[RuntimeAsset]
    ) -> Dict[str, Any]:
        channels = []

        source_msg = [a for a in source_assets if a.tech_stack in ("kafka", "ibm_mq")]
        target_msg = [a for a in target_assets if a.tech_stack in ("kafka", "ibm_mq")]

        for s in source_msg:
            # Match by tech stack and metadata group
            standby = next((t for t in target_msg if t.tech_stack == s.tech_stack), None)
            
            lag_msg = random.choice([0, 0, 0, 12, 45, 118])
            mirror_sync = "ACTIVE" if lag_msg < 50 else "LAGGING"

            channels.append({
                "type": s.tech_stack.upper(),
                "name": s.name,
                "source_endpoint": f"{s.host}:{s.port}" if s.host else "localhost:9092",
                "target_endpoint": f"{standby.host}:{standby.port}" if standby and standby.host else "localhost:9093",
                "mirror_status": mirror_sync,
                "consumer_group_lag": lag_msg,
                "status": "READY" if lag_msg < 100 else "DRAIN_REQUIRED",
            })

        return {
            "channels": channels,
        }

    def _build_config_layer(
        self, source_assets: List[RuntimeAsset], target_assets: List[RuntimeAsset], resident_apps: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        # VIPs, configurations, DNS TTLs
        items = []

        for app in resident_apps:
            app_id = app["app_id"]
            
            # DNS VIP update
            items.append({
                "app_id": app_id,
                "config_type": "DNS_RECORD",
                "property_key": f"dns.gslb.{app_id.lower()}.corp",
                "current_value": f"vip-source-{app_id.lower()}.gaprd.corp",
                "proposed_value": f"vip-target-{app_id.lower()}.maprd.corp",
                "file_path": f"gitops/dns-records/{app_id.lower()}.yaml",
                "remediation": "AUTOMATIC_GSLB_SWAP",
            })

            # DB URL update
            items.append({
                "app_id": app_id,
                "config_type": "ENVIRONMENT_VARIABLE",
                "property_key": "SPRING_DATASOURCE_URL",
                "current_value": f"jdbc:oracle:thin:@source-db-{app_id.lower()}:1521/prod",
                "proposed_value": f"jdbc:oracle:thin:@target-db-{app_id.lower()}:1521/prod",
                "file_path": f"helm-charts/{app_id.lower()}/values-prod.yaml",
                "remediation": "GITOPS_PR",
            })

        return {
            "items": items,
        }

    async def _build_wave_plan(
        self, db: AsyncSession, resident_apps: List[Dict[str, Any]], source_dc: str
    ) -> Dict[str, Any]:
        # Leverage existing decision prioritizations
        app_list = []
        for app in resident_apps:
            tier = "T1" if app["tier"] == "CRITICAL" else "T2"
            app_list.append({
                "app_id": app["app_id"],
                "app_name": app["app_name"],
                "tier": tier,
                "business_criticality": "high" if app["tier"] == "CRITICAL" else "medium",
                "dependency_count": len(app["tech_stacks"]),
                "dependency_detail": ", ".join(sorted(app["tech_stacks"])),
                "confidence_score": 85,
                "confidence_label": "HIGH",
                "alignment_status": "UNKNOWN",
                "active_dc": source_dc,
            })

        # Run wave prioritize helper from decision service
        priority_rows = decision_service._prioritize(app_list)
        waves = decision_service._build_waves(priority_rows)

        return {
            "waves": waves,
            "total_waves": len(waves),
        }



failover_view_service = FailoverViewService()
