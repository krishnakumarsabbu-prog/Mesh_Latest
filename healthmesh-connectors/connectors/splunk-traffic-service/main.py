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

logger = setup_logger("splunk-traffic-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "splunk_traffic.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_splunk_check():
    logger.info("Evaluating Splunk API gateway traffic logs and HTTP success rate SLAs...")
    async with db_manager.session() as db:
        from app.models.db_models import APIMetric, TrafficAlert
        from sqlalchemy import select

        res = await db.execute(select(APIMetric))
        metrics = res.scalars().all()
        for m in metrics:
            if m.success_rate < 80.0:
                alert = TrafficAlert(
                    component="ENDPOINT",
                    component_name=m.api_endpoint,
                    alert_type="CRITICAL_API_FAILURE",
                    severity="CRITICAL",
                    message=f"CRITICAL API FAILURE: Endpoint {m.api_endpoint} success rate dropped to {round(m.success_rate, 2)}%!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest Splunk traffic sample CSVs at startup."""
    import csv
    import io
    from app.models.db_models import TrafficLog, APIMetric, IngestionLog
    from sqlalchemy import select

    # SPLOC_App_Traffic_Samples.csv columns: id, app_id, ts_id, wf_dc, sf_service, wf_acin,
    # total_value, sample_count, avg_value, bucket_start, duration_mins, load_date, fetched_at
    sample_files = ["SPLOC_App_Traffic_Samples.csv"]
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
                    app_id = rec.get("app_id", "unknown")
                    service = rec.get("sf_service") or rec.get("wf_acin") or "unknown"
                    dc = rec.get("wf_dc", "")
                    endpoint = f"{app_id}/{service}"[:200]

                    try:
                        total = int(rec.get("total_value") or 0)
                        sample_count = int(rec.get("sample_count") or 0)
                        avg_val = float(rec.get("avg_value") or 0.0)
                    except (ValueError, TypeError):
                        total = 0
                        sample_count = 0
                        avg_val = 0.0

                    # Record traffic log
                    db.add(TrafficLog(
                        application_name=app_id,
                        api_endpoint=endpoint,
                        request_count=sample_count,
                        error_count=0,
                        retry_count=0
                    ))

                    # Upsert APIMetric
                    stmt = select(APIMetric).where(APIMetric.api_endpoint == endpoint)
                    res = await db.execute(stmt)
                    metric = res.scalar_one_or_none()

                    if metric:
                        metric.avg_latency_ms = avg_val
                    else:
                        db.add(APIMetric(
                            api_endpoint=endpoint,
                            avg_latency_ms=avg_val,
                            success_rate=100.0
                        ))

                await db.commit()
            logger.info(f"Seeded Splunk Traffic data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Splunk Traffic service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_splunk_check, 30, "splunk_traffic_evaluation")

    yield
    logger.info("Shutting down Splunk Traffic service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh Splunk Traffic Connector Service",
    description="Enterprise Splunk log aggregator, API gateway, and Load Balancer traffic SLA validation connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1006, reload=False)
