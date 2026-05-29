import sys
import os
from contextlib import asynccontextmanager

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from shared.logging.logger import setup_logger
from shared.database.session import DatabaseManager
from shared.scheduler.scheduler import ConnectorScheduler

logger = setup_logger("appdynamics-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "appdynamics.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_appdynamics_check():
    logger.info("Evaluating AppDynamics business transaction SLA bounds and health...")
    async with db_manager.session() as db:
        from app.models.db_models import AppDynamicsTransaction, AppDynamicsAlert
        from sqlalchemy import select

        res = await db.execute(select(AppDynamicsTransaction))
        txs = res.scalars().all()
        for t in txs:
            if t.average_response_time_ms > 3000.0:
                alert = AppDynamicsAlert(
                    component="TRANSACTION",
                    component_name=t.name,
                    alert_type="CRITICAL_SLA_BREACH",
                    severity="CRITICAL",
                    message=f"CRITICAL LATENCY BREACH: Transaction {t.name} average response is {t.average_response_time_ms}ms!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest AppDynamics sample CSV files at startup."""
    import csv
    import io
    from app.models.db_models import AppDynamicsApplication, AppDynamicsNode, AppDynamicsTransaction, IngestionLog
    from sqlalchemy import select

    # node_inventory: app_id, node_name, app_full_name, machine_name, tier_name
    # traffic_samples: id, app_id, metric_id, metric_name, current_value, min_value, max_value, value, ...
    sample_map = {
        "AppDynamics_Node_Inventory.csv": "node_inventory",
        "AppDynamics_Traffic_Samples.csv": "traffic_samples"
    }

    for fname, schema in sample_map.items():
        fpath = os.path.join(SAMPLES_DIR, fname)
        if not os.path.exists(fpath):
            logger.warning(f"Sample file not found: {fpath}")
            continue
        try:
            with open(fpath, "rb") as f:
                content = f.read()

            rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))

            async with db_manager.session() as db:
                log_entry = IngestionLog(
                    filename=fname, file_type="CSV", status="SUCCESS",
                    total_rows=len(rows), valid_rows=len(rows), invalid_rows=0,
                    duplicates=0, quality_score=100.0, confidence_level="HIGH", error_summary=""
                )
                db.add(log_entry)

                if schema == "node_inventory":
                    for rec in rows:
                        app_id = rec.get("app_id")
                        node_name = rec.get("node_name")
                        app_full_name = rec.get("app_full_name", app_id)
                        machine_name = rec.get("machine_name")
                        tier_name = rec.get("tier_name", "DefaultTier")

                        if not app_id or not node_name:
                            continue

                        # Upsert application
                        stmt = select(AppDynamicsApplication).where(AppDynamicsApplication.name == app_id)
                        res = await db.execute(stmt)
                        app = res.scalar_one_or_none()
                        if not app:
                            db.add(AppDynamicsApplication(
                                name=app_id,
                                status="NORMAL",
                                node_count=1
                            ))

                        # Upsert node
                        node_key = node_name[:100]
                        stmt2 = select(AppDynamicsNode).where(AppDynamicsNode.name == node_key)
                        res2 = await db.execute(stmt2)
                        existing = res2.scalar_one_or_none()
                        if not existing:
                            db.add(AppDynamicsNode(
                                application_name=app_id,
                                name=node_key,
                                tier_name=tier_name,
                                status="ACTIVE",
                                host=machine_name
                            ))

                elif schema == "traffic_samples":
                    for rec in rows:
                        app_id = rec.get("app_id")
                        metric_name = rec.get("metric_name", "BTM")
                        current_value = rec.get("current_value")
                        avg_value = rec.get("value") or rec.get("avg_value")

                        if not app_id:
                            continue

                        try:
                            avg_ms = float(avg_value) if avg_value else 0.0
                        except (ValueError, TypeError):
                            avg_ms = 0.0

                        tx_name = f"{app_id}_{metric_name}"[:150]
                        stmt = select(AppDynamicsTransaction).where(
                            AppDynamicsTransaction.name == tx_name,
                            AppDynamicsTransaction.application_name == app_id
                        )
                        res = await db.execute(stmt)
                        tx = res.scalar_one_or_none()

                        if tx:
                            tx.average_response_time_ms = avg_ms
                        else:
                            db.add(AppDynamicsTransaction(
                                application_name=app_id,
                                name=tx_name,
                                call_count=int(rec.get("count_value") or rec.get("occurrence") or 0),
                                average_response_time_ms=avg_ms,
                                error_percentage=0.0
                            ))

                await db.commit()
            logger.info(f"Seeded AppDynamics data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up AppDynamics service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_appdynamics_check, 30, "appdynamics_apm_evaluation")

    yield
    logger.info("Shutting down AppDynamics service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh AppDynamics Connector Service",
    description="Enterprise Application Performance Monitoring (APM) transaction and node topology connector",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api.endpoints import router as api_router, get_db
app.dependency_overrides[get_db] = db_manager.get_session_dependency
app.include_router(api_router)

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=1005, reload=False)
