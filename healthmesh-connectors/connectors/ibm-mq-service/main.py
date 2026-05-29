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

logger = setup_logger("ibm-mq-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "ibm_mq.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_metrics_check():
    logger.info("Running scheduled Queue metrics and alert validations...")
    async with db_manager.session() as db:
        from app.models.db_models import Queue, MQAlert
        from sqlalchemy import select

        res = await db.execute(select(Queue))
        queues = res.scalars().all()
        for q in queues:
            if q.current_depth > (q.max_depth * 0.9):
                alert = MQAlert(
                    component="QUEUE",
                    component_name=q.name,
                    alert_type="DEPTH_CRITICAL",
                    severity="CRITICAL",
                    message=f"CRITICAL BACKLOG: Queue {q.name} is at {q.current_depth}/{q.max_depth} depth limit!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest sample IBM MQ CSV files at startup."""
    from shared.ingestion.engine import IngestionEngine
    from app.api.endpoints import EXPECTED_SCHEMAS
    from app.models.db_models import QueueManager, Queue, QueueMetric, MQAlert, IngestionLog
    from sqlalchemy import select

    sample_files = ["ibmmq_qmgr_status.csv"]
    for fname in sample_files:
        fpath = os.path.join(SAMPLES_DIR, fname)
        if not os.path.exists(fpath):
            logger.warning(f"Sample file not found: {fpath}")
            continue
        try:
            with open(fpath, "rb") as f:
                content = f.read()

            parse_result = IngestionEngine.parse_file(content, fname, EXPECTED_SCHEMAS)
            if not parse_result.get("success"):
                logger.warning(f"Could not parse {fname}: {parse_result.get('error')}")
                continue

            schema = parse_result["schema_detected"]
            records = parse_result["data"]

            async with db_manager.session() as db:
                log_entry = IngestionLog(
                    filename=fname,
                    file_type="CSV",
                    status=parse_result["status"],
                    total_rows=parse_result["total_rows"],
                    valid_rows=parse_result["valid_rows"],
                    invalid_rows=parse_result["invalid_rows"],
                    duplicates=parse_result["duplicates"],
                    quality_score=parse_result["quality_score"],
                    confidence_level=parse_result["confidence_level"],
                    error_summary=parse_result["error_summary"]
                )
                db.add(log_entry)

                if schema == "qmgr_status":
                    for rec in records:
                        # ibmmq_qmgr_status columns: _name_, qmgr, hostname, env, platform, Value
                        qmgr_name = rec.get("qmgr") or rec.get("queue_manager_name") or rec.get("name")
                        if not qmgr_name:
                            continue
                        host = rec.get("hostname") or rec.get("host")
                        env = rec.get("env", "")
                        platform = rec.get("platform", "UNIX")
                        value = rec.get("value", "2")
                        status = "RUNNING" if str(value).strip() in ("2", "1") else "STOPPED"

                        stmt = select(QueueManager).where(QueueManager.name == qmgr_name)
                        res = await db.execute(stmt)
                        qmgr = res.scalar_one_or_none()
                        if qmgr:
                            qmgr.status = status
                            qmgr.host = host or qmgr.host
                        else:
                            db.add(QueueManager(
                                name=qmgr_name,
                                status=status,
                                host=host,
                                port=1414,
                                channel_count=0,
                                queue_count=0
                            ))

                await db.commit()
            logger.info(f"Seeded IBM MQ data from {fname} (schema={schema}, rows={len(records)})")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up IBM MQ service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()
    logger.info("SQLite Database initialized and schemas verified.")

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_metrics_check, 30, "mq_metrics_evaluation")

    yield

    logger.info("Shutting down IBM MQ service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh IBM MQ Connector Service",
    description="Enterprise Queue Manager and backlog analytical mesh connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1001, reload=False)
