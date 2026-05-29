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

logger = setup_logger("oracle-oem-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "oracle_oem.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_replication_check():
    logger.info("Evaluating Oracle Active DataGuard replication states...")
    async with db_manager.session() as db:
        from app.models.db_models import ReplicationStatus, DBAlert
        from sqlalchemy import select

        res = await db.execute(select(ReplicationStatus))
        replicas = res.scalars().all()
        for r in replicas:
            if r.replication_lag_seconds > 600:
                alert = DBAlert(
                    component="DATAGUARD",
                    component_name=r.database_name,
                    alert_type="LAG_CRITICAL",
                    severity="CRITICAL",
                    message=f"CRITICAL LAG: Replication standby for {r.database_name} is behind by {r.replication_lag_seconds} seconds!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest Oracle OEM sample files at startup."""
    from shared.ingestion.engine import IngestionEngine
    from app.models.db_models import DatabaseInstance, ReplicationStatus, DBAlert, IngestionLog
    from sqlalchemy import select
    from datetime import datetime

    # oem_db_role.csv columns: __name__, agent_hostname, collector_id, env, instance, job, role_name, target_name, Value
    sample_files = ["oem_db_role.csv"]
    for fname in sample_files:
        fpath = os.path.join(SAMPLES_DIR, fname)
        if not os.path.exists(fpath):
            logger.warning(f"Sample file not found: {fpath}")
            continue
        try:
            with open(fpath, "rb") as f:
                content = f.read()

            # Parse CSV manually since columns don't match expected schema exactly
            import csv
            import io
            rows = list(csv.DictReader(io.StringIO(content.decode("utf-8"))))

            async with db_manager.session() as db:
                log_entry = IngestionLog(
                    filename=fname, file_type="CSV", status="SUCCESS",
                    total_rows=len(rows), valid_rows=len(rows), invalid_rows=0,
                    duplicates=0, quality_score=100.0, confidence_level="HIGH", error_summary=""
                )
                db.add(log_entry)

                for rec in rows:
                    db_name = rec.get("target_name") or rec.get("database_name")
                    role = rec.get("role_name", "PHYSICAL STANDBY").upper()
                    if not db_name:
                        continue

                    stmt = select(DatabaseInstance).where(DatabaseInstance.name == db_name)
                    res = await db.execute(stmt)
                    db_inst = res.scalar_one_or_none()

                    if db_inst:
                        db_inst.db_role = role
                    else:
                        db.add(DatabaseInstance(
                            name=db_name,
                            status="OPEN",
                            db_role=role,
                            host=rec.get("agent_hostname"),
                            port=1521
                        ))

                    # Seed replication status for standbys
                    if "STANDBY" in role:
                        stmt2 = select(ReplicationStatus).where(ReplicationStatus.database_name == db_name)
                        res2 = await db.execute(stmt2)
                        repl = res2.scalar_one_or_none()
                        if not repl:
                            db.add(ReplicationStatus(
                                database_name=db_name,
                                replication_lag_seconds=0,
                                dr_ready=True,
                                last_synced_at=datetime.utcnow()
                            ))

                await db.commit()
            logger.info(f"Seeded Oracle OEM data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Oracle OEM service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_replication_check, 30, "oracle_replication_evaluation")

    yield
    logger.info("Shutting down Oracle OEM service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh Oracle OEM Connector Service",
    description="Enterprise database role, replication lag and DataGuard validation connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1002, reload=False)
