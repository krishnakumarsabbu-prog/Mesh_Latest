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

logger = setup_logger("scom-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "scom.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_scom_check():
    logger.info("Evaluating SCOM bare-metal hypervisors, disk spaces, and replica SLAs...")
    async with db_manager.session() as db:
        from app.models.db_models import SCOMReplica, InfraAlert
        from sqlalchemy import select

        res = await db.execute(select(SCOMReplica))
        reps = res.scalars().all()
        for r in reps:
            if r.replication_lag_seconds > 7200:
                alert = InfraAlert(
                    component="REPLICA",
                    component_name=f"{r.source_server_name}->{r.target_server_name}",
                    alert_type="CRITICAL_REPLICA_LAG",
                    severity="CRITICAL",
                    message=f"CRITICAL REPLICA DELAY: Hyper-V VM replication {r.source_server_name}->{r.target_server_name} is behind by {r.replication_lag_seconds}s!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest SCOM replica status CSV at startup."""
    import csv
    import io
    from app.models.db_models import SCOMServer, SCOMReplica, InfraAlert, IngestionLog
    from sqlalchemy import select

    # SCOM_Prod_ReplicaStatus.csv: ReplicaName, Role, HealthState
    sample_files = ["SCOM_Prod_ReplicaStatus.csv"]
    for fname in sample_files:
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

                for rec in rows:
                    replica_name = rec.get("ReplicaName", "").strip()
                    role = rec.get("Role", "Secondary").strip()
                    health_state = rec.get("HealthState", "Success").strip()

                    if not replica_name:
                        continue

                    # Extract server name (strip instance part after \)
                    server_name = replica_name.split("\\")[0][:100]
                    server_status = "ONLINE" if health_state == "Success" else "UNREACHABLE"

                    # Upsert server
                    stmt = select(SCOMServer).where(SCOMServer.name == server_name)
                    res = await db.execute(stmt)
                    server = res.scalar_one_or_none()
                    if not server:
                        db.add(SCOMServer(
                            name=server_name,
                            status=server_status,
                            os_type="WINDOWS",
                            cpu_cores=4,
                            memory_mb=16384
                        ))

                    # Create replica pair if secondary
                    if role.lower() == "secondary":
                        repl_key = replica_name[:100]
                        stmt2 = select(SCOMReplica).where(SCOMReplica.source_server_name == repl_key)
                        res2 = await db.execute(stmt2)
                        repl = res2.scalar_one_or_none()

                        repl_status = "SYNCED" if health_state == "Success" else ("ERROR" if health_state == "Warning" else "ERROR")
                        if not repl:
                            db.add(SCOMReplica(
                                source_server_name=repl_key,
                                target_server_name=server_name,
                                replication_status=repl_status,
                                replication_lag_seconds=0,
                                dr_test_status="PASSED" if health_state == "Success" else "FAILED"
                            ))

                    # Generate alert for non-healthy replicas
                    if health_state != "Success":
                        db.add(InfraAlert(
                            component="REPLICA",
                            component_name=replica_name[:100],
                            alert_type="REPLICA_HEALTH_DEGRADED",
                            severity="WARNING",
                            message=f"SCOM Replica {replica_name} health state: {health_state}"
                        ))

                await db.commit()
            logger.info(f"Seeded SCOM data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up SCOM service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_scom_check, 30, "scom_infra_evaluation")

    yield
    logger.info("Shutting down SCOM service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh SCOM Connector Service",
    description="Enterprise System Center Operations Manager (SCOM) hypervisor and VM replication connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1007, reload=False)
