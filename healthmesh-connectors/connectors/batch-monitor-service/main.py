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

logger = setup_logger("batch-monitor-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "batch_monitor.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_batch_check():
    logger.info("Evaluating active batch jobs execution schedules and duration SLA limits...")
    async with db_manager.session() as db:
        from app.models.db_models import BatchExecution, BatchAlert
        from sqlalchemy import select

        res = await db.execute(select(BatchExecution).where(BatchExecution.status == "FAILED"))
        failed_execs = res.scalars().all()
        for e in failed_execs:
            alert = BatchAlert(
                component="EXECUTION",
                component_name=e.job_name,
                alert_type="CRITICAL_RUN_FAILURE",
                severity="CRITICAL",
                message=f"BATCH INCIDENT: Job run execution for {e.job_name} failed! Error: {e.error_message or 'Core execution aborted'}"
            )
            db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest batch processing report CSV at startup."""
    import csv
    import io
    from datetime import datetime
    from app.models.db_models import BatchJob, BatchExecution, BatchAlert, IngestionLog
    from sqlalchemy import select

    # Batch.csv: Instance, JOB_NAME, JOB_TYPE, AS_GROUP, AS_APPLICATION,
    #            MACH_NAME, RUN_MACHINE, STATUS_TIMESTAMP, JOB_STATUS
    sample_files = ["Batch.csv"]
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
                    job_name = rec.get("JOB_NAME", "").strip()[:100]
                    job_status = rec.get("JOB_STATUS", "SUCCESS").strip().upper()
                    job_type = rec.get("JOB_TYPE", "CMD").strip()
                    application = rec.get("AS_APPLICATION", "").strip()

                    if not job_name:
                        continue

                    # Map statuses
                    exec_status = "SUCCESS" if job_status == "SUCCESS" else "FAILED"
                    job_active_status = "ACTIVE" if job_status == "SUCCESS" else "FAILING"

                    # Upsert BatchJob
                    stmt = select(BatchJob).where(BatchJob.name == job_name)
                    res = await db.execute(stmt)
                    job = res.scalar_one_or_none()
                    if not job:
                        db.add(BatchJob(
                            name=job_name,
                            status=job_active_status,
                            schedule="0 23 * * *"
                        ))

                    # Record execution
                    db.add(BatchExecution(
                        job_name=job_name,
                        status=exec_status,
                        start_time=datetime.utcnow(),
                        duration_seconds=0,
                        error_message=None if exec_status == "SUCCESS" else f"{job_type} execution failed"
                    ))

                    # Alert on failures
                    if exec_status == "FAILED":
                        db.add(BatchAlert(
                            component="JOB",
                            component_name=job_name,
                            alert_type="JOB_FAILED",
                            severity="CRITICAL",
                            message=f"Batch job {job_name} (app={application}) failed execution."
                        ))

                await db.commit()
            logger.info(f"Seeded Batch data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Batch Monitor service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_batch_check, 30, "batch_scheduler_evaluation")

    yield
    logger.info("Shutting down Batch Monitor service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh Batch Monitor Connector Service",
    description="Enterprise batch processing, scheduling execution, and job duration SLA monitoring connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1008, reload=False)
