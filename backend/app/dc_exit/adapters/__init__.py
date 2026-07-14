import logging
from datetime import datetime
from typing import Any, Dict, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.migration import AdapterCallAudit
from app.models.runtime import RuntimeAsset

logger = logging.getLogger(__name__)

class BaseAdapter:
    def __init__(self, name: str):
        self.name = name

    async def log_audit(
        self,
        db: AsyncSession,
        run_id: str,
        app_id: Optional[str],
        operation: str,
        target: Optional[str],
        parameters: Dict[str, Any],
        status: str,
        response: Optional[Dict[str, Any]] = None,
        error_message: Optional[str] = None,
    ) -> AdapterCallAudit:
        audit = AdapterCallAudit(
            run_id=run_id,
            app_id=app_id,
            adapter_name=self.name,
            operation=operation,
            target=target,
            parameters_json=parameters,
            status=status,
            response_json=response,
            error_message=error_message,
            timestamp=datetime.utcnow()
        )
        db.add(audit)
        await db.flush()
        return audit

    async def is_already_done(
        self, db: AsyncSession, run_id: str, operation: str, target: Optional[str]
    ) -> bool:
        """Check if this adapter operation was already completed successfully in this run."""
        stmt = select(AdapterCallAudit).where(
            AdapterCallAudit.run_id == run_id,
            AdapterCallAudit.adapter_name == self.name,
            AdapterCallAudit.operation == operation,
            AdapterCallAudit.target == target,
            AdapterCallAudit.status == "SUCCESS"
        )
        res = await db.execute(stmt)
        record = res.scalar_one_or_none()
        if record:
            logger.info(f"[{self.name}] Idempotency gate: operation '{operation}' on '{target}' already completed. Skipping.")
            return True
        return False


class ComputeAdapter(BaseAdapter):
    def __init__(self):
        super().__init__("ComputeAdapter")

    async def provision_namespace(
        self, db: AsyncSession, run_id: str, app_id: str, namespace: str, target_cluster: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "provision_namespace", namespace):
            return True

        params = {"namespace": namespace, "target_cluster": target_cluster}
        try:
            logger.info(f"[{self.name}] Provisioning namespace {namespace} on cluster {target_cluster}")
            
            # Mutate runtime asset: Set target workloads to ACTIVE
            stmt = select(RuntimeAsset).where(
                RuntimeAsset.tech_stack == "ocp",
                RuntimeAsset.data_center_short == "MA-PRD"  # target DC short
            )
            res = await db.execute(stmt)
            target_workloads = res.scalars().all()
            for asset in target_workloads:
                meta = asset.metadata_json or {}
                if meta.get("application_id") == app_id:
                    asset.latest_operational_state = "ACTIVE"
                    db.add(asset)

            res_payload = {"status": "Created", "namespace": namespace, "cluster": target_cluster, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "provision_namespace", namespace, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "provision_namespace", namespace, params, "FAILED", error_message=str(e))
            raise e

    async def scale_replicas(
        self, db: AsyncSession, run_id: str, app_id: str, workload: str, replicas: int, target_cluster: str
    ) -> bool:
        target_key = f"{workload}:{replicas}"
        if await self.is_already_done(db, run_id, "scale_replicas", target_key):
            return True

        params = {"workload": workload, "replicas": replicas, "target_cluster": target_cluster}
        try:
            logger.info(f"[{self.name}] Scaling workload {workload} to {replicas} replicas on {target_cluster}")
            
            # Mutate runtime asset: update replicas metadata
            stmt = select(RuntimeAsset).where(
                RuntimeAsset.name == workload
            )
            res = await db.execute(stmt)
            asset = res.scalar_one_or_none()
            if asset:
                meta = dict(asset.metadata_json or {})
                meta["replicas"] = replicas
                asset.metadata_json = meta
                db.add(asset)

            res_payload = {"status": "Scaled", "replicas": replicas, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "scale_replicas", target_key, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "scale_replicas", target_key, params, "FAILED", error_message=str(e))
            raise e

    async def verify_health(
        self, db: AsyncSession, run_id: str, app_id: str, workload: str, target_cluster: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "verify_health", workload):
            return True

        params = {"workload": workload, "target_cluster": target_cluster}
        try:
            logger.info(f"[{self.name}] Verifying workload health for {workload} on {target_cluster}")
            res_payload = {"status": "Healthy", "ready_replicas": 2, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "verify_health", workload, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "verify_health", workload, params, "FAILED", error_message=str(e))
            raise e


class StorageAdapter(BaseAdapter):
    def __init__(self):
        super().__init__("StorageAdapter")

    async def promote_standby(
        self, db: AsyncSession, run_id: str, app_id: str, db_name: str, target_node: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "promote_standby", db_name):
            return True

        params = {"db_name": db_name, "target_node": target_node}
        try:
            logger.info(f"[{self.name}] Promoting standby node {target_node} for database {db_name}")
            
            # Mutate runtime assets: Swap Primary/Standby roles
            stmt = select(RuntimeAsset).where(
                RuntimeAsset.tech_stack.in_(["oracle", "mssql", "mongodb"])
            )
            res = await db.execute(stmt)
            databases = res.scalars().all()
            for db_asset in databases:
                asset_meta = db_asset.metadata_json or {}
                if asset_meta.get("db_name") == db_name or db_asset.name == db_name:
                    if db_asset.data_center_short == "MA-PRD":
                        db_asset.latest_replication_role = "PRIMARY"
                        db_asset.latest_operational_state = "ACTIVE"
                        db_asset.write_authority = True
                    else:
                        db_asset.latest_replication_role = "STANDBY"
                        db_asset.write_authority = False
                    db.add(db_asset)

            res_payload = {"status": "PROMOTED", "role": "PRIMARY", "db_name": db_name, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "promote_standby", db_name, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "promote_standby", db_name, params, "FAILED", error_message=str(e))
            raise e

    async def verify_sync(
        self, db: AsyncSession, run_id: str, app_id: str, db_name: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "verify_sync", db_name):
            return True

        params = {"db_name": db_name}
        try:
            logger.info(f"[{self.name}] Verifying database synchronization for {db_name}")
            res_payload = {"status": "SYNCHRONIZED", "replication_lag_seconds": 0, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "verify_sync", db_name, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "verify_sync", db_name, params, "FAILED", error_message=str(e))
            raise e


class MessagingAdapter(BaseAdapter):
    def __init__(self):
        super().__init__("MessagingAdapter")

    async def pause_consumers(
        self, db: AsyncSession, run_id: str, app_id: str, queue_name: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "pause_consumers", queue_name):
            return True

        params = {"queue_name": queue_name}
        try:
            logger.info(f"[{self.name}] Pausing consumer groups for queue/topic {queue_name}")
            res_payload = {"status": "PAUSED", "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "pause_consumers", queue_name, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "pause_consumers", queue_name, params, "FAILED", error_message=str(e))
            raise e

    async def resume_consumers(
        self, db: AsyncSession, run_id: str, app_id: str, queue_name: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "resume_consumers", queue_name):
            return True

        params = {"queue_name": queue_name}
        try:
            logger.info(f"[{self.name}] Resuming consumer groups for queue/topic {queue_name}")
            res_payload = {"status": "RUNNING", "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "resume_consumers", queue_name, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "resume_consumers", queue_name, params, "FAILED", error_message=str(e))
            raise e


class TrafficAdapter(BaseAdapter):
    def __init__(self):
        super().__init__("TrafficAdapter")

    async def shift_traffic(
        self, db: AsyncSession, run_id: str, app_id: str, dns_record: str, proposed_vip: str, weight_pct: int
    ) -> bool:
        target_key = f"{dns_record}:{weight_pct}"
        if await self.is_already_done(db, run_id, "shift_traffic", target_key):
            return True

        params = {"dns_record": dns_record, "proposed_vip": proposed_vip, "weight_pct": weight_pct}
        try:
            logger.info(f"[{self.name}] Shifting traffic for {dns_record} to {proposed_vip} at {weight_pct}%")
            
            # Mutate runtime configs in target assets
            stmt = select(RuntimeAsset).where(
                RuntimeAsset.name == dns_record
            )
            res = await db.execute(stmt)
            asset = res.scalar_one_or_none()
            if asset:
                meta = dict(asset.metadata_json or {})
                meta["active_vip"] = proposed_vip
                meta["weight"] = weight_pct
                asset.metadata_json = meta
                db.add(asset)

            res_payload = {"status": "UPDATED", "active_weight": weight_pct, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "shift_traffic", target_key, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "shift_traffic", target_key, params, "FAILED", error_message=str(e))
            raise e


class ConfigAdapter(BaseAdapter):
    def __init__(self):
        super().__init__("ConfigAdapter")

    async def update_config_key(
        self, db: AsyncSession, run_id: str, app_id: str, property_key: str, proposed_value: str, file_path: str
    ) -> bool:
        if await self.is_already_done(db, run_id, "update_config_key", property_key):
            return True

        params = {"property_key": property_key, "proposed_value": proposed_value, "file_path": file_path}
        try:
            logger.info(f"[{self.name}] Updating config key {property_key} to {proposed_value} in file {file_path}")
            res_payload = {"status": "COMMITTED", "commit_sha": "a1b2c3d4e5f6", "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "update_config_key", property_key, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "update_config_key", property_key, params, "FAILED", error_message=str(e))
            raise e


class FirewallAdapter(BaseAdapter):
    def __init__(self):
        super().__init__("FirewallAdapter")

    async def verify_firewall_rules(
        self, db: AsyncSession, run_id: str, app_id: str, source_dc: str, target_dc: str
    ) -> bool:
        target_key = f"{source_dc}->{target_dc}"
        if await self.is_already_done(db, run_id, "verify_firewall_rules", target_key):
            return True

        params = {"source_dc": source_dc, "target_dc": target_dc}
        try:
            logger.info(f"[{self.name}] Verifying firewall and routing security rules from {source_dc} to {target_dc}")
            res_payload = {"status": "VERIFIED", "policies_applied": True, "timestamp": datetime.utcnow().isoformat()}
            await self.log_audit(db, run_id, app_id, "verify_firewall_rules", target_key, params, "SUCCESS", res_payload)
            return True
        except Exception as e:
            await self.log_audit(db, run_id, app_id, "verify_firewall_rules", target_key, params, "FAILED", error_message=str(e))
            raise e


compute_adapter = ComputeAdapter()
storage_adapter = StorageAdapter()
messaging_adapter = MessagingAdapter()
traffic_adapter = TrafficAdapter()
config_adapter = ConfigAdapter()
firewall_adapter = FirewallAdapter()
