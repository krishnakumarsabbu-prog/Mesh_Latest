import asyncio
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models.migration import MigrationRun, MigrationWaveRecord, AppMigrationRecord, AdapterCallAudit
from app.dc_exit.failover_view_service import failover_view_service
from app.dc_exit.adapters import compute_adapter, storage_adapter, messaging_adapter, traffic_adapter, config_adapter, firewall_adapter


logger = logging.getLogger(__name__)

# In-memory registry of active execution tasks to prevent concurrent duplicate loops
_active_tasks: Dict[str, asyncio.Task] = {}


class SagaOrchestrator:
    """Saga orchestrator that executes a migration run wave-by-wave, step-by-step."""

    async def start_migration(
        self, session_factory: async_sessionmaker, session_id: str, source_dc: str, target_dc: str, mode: str = "STAGED"
    ) -> MigrationRun:
        async with session_factory() as db:
            # 1. Create MigrationRun
            run = MigrationRun(
                session_id=session_id,
                source_dc=source_dc,
                target_dc=target_dc,
                status="RUNNING",
                mode=mode,
                start_time=datetime.utcnow()
            )
            db.add(run)
            await db.flush()

            # 2. Derive Waves using FailoverViewService
            failover_view = await failover_view_service.get_failover_view(db, source_dc, target_dc)
            waves_data = failover_view.get("layer_6_waves", {}).get("waves", [])

            for w_idx, wave_data in enumerate(waves_data):
                wave_num = wave_data.get("wave", w_idx + 1)
                wave_rec = MigrationWaveRecord(
                    run_id=run.id,
                    wave_number=wave_num,
                    status="pending" if w_idx > 0 else "running",
                    start_time=datetime.utcnow() if w_idx == 0 else None
                )
                db.add(wave_rec)
                await db.flush()

                # Add application records for this wave
                for app in wave_data.get("apps", []):
                    app_rec = AppMigrationRecord(
                        run_id=run.id,
                        wave_id=wave_rec.id,
                        app_id=app["app_id"],
                        app_name=app.get("appName", app["app_id"]),
                        status="pending",
                        current_phase="NOTIFY",
                        progress=0
                    )
                    db.add(app_rec)

            await db.commit()
            await db.refresh(run)

            # 3. Spawn background execution loop
            task = asyncio.create_task(self._run_loop(run.id, session_factory))
            _active_tasks[run.id] = task

            return run

    async def get_run_status(self, db: AsyncSession, run_id: str) -> Dict[str, Any]:
        run_res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
        run = run_res.scalar_one_or_none()
        if not run:
            return {"error": "Migration run not found"}

        waves_res = await db.execute(select(MigrationWaveRecord).where(MigrationWaveRecord.run_id == run_id))
        waves = waves_res.scalars().all()

        apps_res = await db.execute(select(AppMigrationRecord).where(AppMigrationRecord.run_id == run_id))
        apps = apps_res.scalars().all()

        audits_res = await db.execute(
            select(AdapterCallAudit)
            .where(AdapterCallAudit.run_id == run_id)
            .order_by(AdapterCallAudit.timestamp.desc())
            .limit(100)
        )
        audits = audits_res.scalars().all()

        return {
            "run_id": run.id,
            "status": run.status,
            "mode": run.mode,
            "source_dc": run.source_dc,
            "target_dc": run.target_dc,
            "start_time": run.start_time.isoformat() if run.start_time else None,
            "end_time": run.end_time.isoformat() if run.end_time else None,
            "waves": [
                {
                    "id": w.id,
                    "wave_number": w.wave_number,
                    "status": w.status,
                }
                for w in sorted(waves, key=lambda x: x.wave_number)
            ],
            "apps": [
                {
                    "app_id": a.app_id,
                    "app_name": a.app_name,
                    "status": a.status,
                    "current_phase": a.current_phase,
                    "progress": a.progress,
                    "error": a.error_message,
                }
                for a in apps
            ],
            "audit_logs": [
                {
                    "id": au.id,
                    "app_id": au.app_id,
                    "adapter_name": au.adapter_name,
                    "operation": au.operation,
                    "target": au.target,
                    "status": au.status,
                    "error_message": au.error_message,
                    "timestamp": au.timestamp.isoformat(),
                }
                for au in audits
            ]
        }

    async def pause_migration(self, db: AsyncSession, run_id: str) -> bool:
        res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
        run = res.scalar_one_or_none()
        if run and run.status == "RUNNING":
            run.status = "PAUSED"
            await db.commit()
            if run_id in _active_tasks:
                _active_tasks[run_id].cancel()
                del _active_tasks[run_id]
            return True
        return False

    async def resume_migration(self, db: AsyncSession, session_factory: async_sessionmaker, run_id: str) -> bool:
        res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
        run = res.scalar_one_or_none()
        if run and run.status == "PAUSED":
            run.status = "RUNNING"
            await db.commit()
            task = asyncio.create_task(self._run_loop(run_id, session_factory))
            _active_tasks[run_id] = task
            return True
        return False

    async def rollback_migration(self, db: AsyncSession, session_factory: async_sessionmaker, run_id: str) -> bool:
        res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
        run = res.scalar_one_or_none()
        if run:
            run.status = "ROLLING_BACK"
            await db.commit()
            if run_id in _active_tasks:
                _active_tasks[run_id].cancel()
                del _active_tasks[run_id]
            task = asyncio.create_task(self._rollback_loop(run_id, session_factory))
            _active_tasks[run_id] = task
            return True
        return False

    # --- Background Loops ---

    async def _run_loop(self, run_id: str, session_factory: async_sessionmaker):
        try:
            logger.info(f"[SagaOrchestrator] Starting run loop for run {run_id}")
            semaphore = asyncio.Semaphore(3)  # limit concurrency to max 3 parallel apps
            
            wave_num = 1
            while True:
                async with session_factory() as db:
                    # Fetch run
                    run_res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
                    run = run_res.scalar_one_or_none()
                    if not run or run.status != "RUNNING":
                        break
                    run_mode = run.mode

                    # Fetch wave
                    wave_res = await db.execute(
                        select(MigrationWaveRecord)
                        .where(MigrationWaveRecord.run_id == run_id, MigrationWaveRecord.wave_number == wave_num)
                    )
                    wave = wave_res.scalar_one_or_none()
                    if not wave:
                        # All waves finished!
                        run.status = "COMPLETED"
                        run.end_time = datetime.utcnow()
                        await db.commit()
                        logger.info(f"[SagaOrchestrator] Run {run_id} completed successfully!")
                        break

                    # Journaling & Resumability Check: If wave is already complete, proceed to next
                    if wave.status == "complete":
                        logger.info(f"[SagaOrchestrator] Wave {wave_num} is already complete. Skipping.")
                        wave_num += 1
                        continue

                    # Set wave to running
                    wave.status = "running"
                    wave.start_time = datetime.utcnow()
                    await db.commit()

                    # Fetch apps in this wave
                    apps_res = await db.execute(
                        select(AppMigrationRecord)
                        .where(AppMigrationRecord.run_id == run_id, AppMigrationRecord.wave_id == wave.id)
                    )
                    apps = apps_res.scalars().all()

                logger.info(f"[SagaOrchestrator] Running wave {wave_num} with {len(apps)} apps (Throttle: max 3 concurrent)")

                # Run apps in parallel within this wave (governed by semaphore)
                tasks = [self._migrate_app(run_id, app.app_id, session_factory, semaphore) for app in apps]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Check if any app failed
                any_failed = False
                for r in results:
                    if isinstance(r, Exception) or r is False:
                        any_failed = True

                async with session_factory() as db:
                    wave_res = await db.execute(select(MigrationWaveRecord).where(MigrationWaveRecord.id == wave.id))
                    wave = wave_res.scalar_one()
                    
                    if any_failed:
                        wave.status = "failed"
                        wave.end_time = datetime.utcnow()
                        
                        run_res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
                        run = run_res.scalar_one()
                        run.status = "FAILED"
                        run.end_time = datetime.utcnow()
                        await db.commit()
                        logger.error(f"[SagaOrchestrator] Wave {wave_num} failed. Triggering automatic Saga rollback.")
                        
                        # Trigger automatic rollback compensating actions
                        await self._rollback_loop(run_id, session_factory)
                        break
                    else:
                        wave.status = "complete"
                        wave.end_time = datetime.utcnow()
                        
                        # Staged Wave Gates Check
                        if run_mode == "STAGED":
                            # Check if another wave exists ahead
                            next_wave_res = await db.execute(
                                select(MigrationWaveRecord)
                                .where(MigrationWaveRecord.run_id == run_id, MigrationWaveRecord.wave_number == wave_num + 1)
                            )
                            if next_wave_res.scalar_one_or_none():
                                run_res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
                                run = run_res.scalar_one()
                                run.status = "PAUSED"  # Pause at wave boundary for approval
                                await db.commit()
                                logger.info(f"[SagaOrchestrator] Wave {wave_num} completed. Paused at STAGED gate for approval.")
                                break
                                
                        await db.commit()
                
                wave_num += 1

        except asyncio.CancelledError:
            logger.info(f"[SagaOrchestrator] Run loop for {run_id} was paused/cancelled.")
        except Exception as e:
            logger.exception(f"[SagaOrchestrator] Error running migration {run_id}: {e}")

    async def _rollback_loop(self, run_id: str, session_factory: async_sessionmaker):
        try:
            logger.info(f"[SagaOrchestrator] Starting rollback loop for run {run_id}")
            async with session_factory() as db:
                apps_res = await db.execute(
                    select(AppMigrationRecord)
                    .where(AppMigrationRecord.run_id == run_id)
                )
                apps = apps_res.scalars().all()

            # Rollback apps in reverse order
            tasks = [self._rollback_app(run_id, app.app_id, session_factory) for app in reversed(apps)]
            await asyncio.gather(*tasks, return_exceptions=True)

            async with session_factory() as db:
                run_res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
                run = run_res.scalar_one()
                run.status = "FAILED"  # final state is failed after rollback
                run.end_time = datetime.utcnow()
                await db.commit()
            
            logger.info(f"[SagaOrchestrator] Rollback loop for run {run_id} completed.")
        except Exception as e:
            logger.exception(f"[SagaOrchestrator] Error during rollback of {run_id}: {e}")

    async def _migrate_app(
        self, run_id: str, app_id: str, session_factory: async_sessionmaker, semaphore: asyncio.Semaphore
    ) -> bool:
        # Check if already completed (Journaling / Resumability check)
        async with session_factory() as db:
            app_res = await db.execute(
                select(AppMigrationRecord)
                .where(AppMigrationRecord.run_id == run_id, AppMigrationRecord.app_id == app_id)
            )
            app_rec = app_res.scalar_one_or_none()
            if app_rec and app_rec.status == "completed":
                logger.info(f"[SagaOrchestrator] App {app_id} is already completed. Skipping.")
                return True

        async with semaphore:
            phases = ["NOTIFY", "DATA_PLANE", "MESSAGING_PLANE", "COMPUTE_PLANE", "TRAFFIC_SHIFT", "CONFIG_RIPPLE", "VALIDATE"]
            
            for idx, phase in enumerate(phases):
                # Check run status before proceeding to next phase
                async with session_factory() as db:
                    run_res = await db.execute(select(MigrationRun).where(MigrationRun.id == run_id))
                    run = run_res.scalar_one_or_none()
                    if not run or run.status != "RUNNING":
                        return False
                    source_dc = run.source_dc
                    target_dc = run.target_dc

                    app_res = await db.execute(
                        select(AppMigrationRecord)
                        .where(AppMigrationRecord.run_id == run_id, AppMigrationRecord.app_id == app_id)
                    )
                    app_rec = app_res.scalar_one()
                    app_rec.status = "running"
                    app_rec.current_phase = phase
                    app_rec.progress = int((idx / len(phases)) * 100)
                    await db.commit()

                # Call adapters based on phase
                logger.info(f"[SagaOrchestrator] App {app_id} entering phase {phase}")
                await asyncio.sleep(1.5)  # simulate network/adapter call delay
                
                async with session_factory() as db:
                    try:
                        if phase == "NOTIFY":
                            # Verify firewall rules
                            await firewall_adapter.verify_firewall_rules(db, run_id, app_id, source_dc, target_dc)
                        elif phase == "DATA_PLANE":
                            # Promote database replica
                            await storage_adapter.promote_standby(db, run_id, app_id, f"db-{app_id.lower()}", f"node-{app_id.lower()}-b")
                            await storage_adapter.verify_sync(db, run_id, app_id, f"db-{app_id.lower()}")
                        elif phase == "MESSAGING_PLANE":
                            # Pause message consumers, update topic configurations, resume consumers
                            await messaging_adapter.pause_consumers(db, run_id, app_id, f"topic-{app_id.lower()}")
                            await messaging_adapter.resume_consumers(db, run_id, app_id, f"topic-{app_id.lower()}")
                        elif phase == "COMPUTE_PLANE":
                            # Scale up the deployments in the target cluster
                            await compute_adapter.provision_namespace(db, run_id, app_id, f"{app_id.lower()}-prod", "ocp-prd-ma")
                            await compute_adapter.scale_replicas(db, run_id, app_id, f"deployment-{app_id.lower()}", 2, "ocp-prd-ma")
                            await compute_adapter.verify_health(db, run_id, app_id, f"deployment-{app_id.lower()}", "ocp-prd-ma")
                        elif phase == "TRAFFIC_SHIFT":
                            # Update load balancer weight
                            await traffic_adapter.shift_traffic(db, run_id, app_id, f"dns.gslb.{app_id.lower()}.corp", f"vip-target-{app_id.lower()}", 100)
                        elif phase == "CONFIG_RIPPLE":
                            # Update config files
                            await config_adapter.update_config_key(db, run_id, app_id, "SPRING_DATASOURCE_URL", f"jdbc:oracle:thin:@target-db-{app_id.lower()}:1521/prod", f"helm-charts/{app_id.lower()}/values-prod.yaml")

                        await db.commit()
                    except Exception as e:
                        logger.error(f"[SagaOrchestrator] Phase {phase} failed for App {app_id}: {e}")
                        app_rec.status = "failed"
                        app_rec.error_message = str(e)
                        await db.commit()
                        return False

            async with session_factory() as db:
                app_res = await db.execute(
                    select(AppMigrationRecord)
                    .where(AppMigrationRecord.run_id == run_id, AppMigrationRecord.app_id == app_id)
                )
                app_rec = app_res.scalar_one()
                app_rec.status = "completed"
                app_rec.progress = 100
                await db.commit()
            return True

    async def _rollback_app(self, run_id: str, app_id: str, session_factory: async_sessionmaker):
        async with session_factory() as db:
            app_res = await db.execute(
                select(AppMigrationRecord)
                .where(AppMigrationRecord.run_id == run_id, AppMigrationRecord.app_id == app_id)
            )
            app_rec = app_res.scalar_one()
            app_rec.status = "rolled_back"
            app_rec.progress = 0
            await db.commit()
            
            # Compensate: Shift traffic back to source
            await traffic_adapter.shift_traffic(db, run_id, app_id, f"dns.gslb.{app_id.lower()}.corp", f"vip-source-{app_id.lower()}", 0)
            await db.commit()


saga_orchestrator = SagaOrchestrator()
