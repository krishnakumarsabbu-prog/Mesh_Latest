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

logger = setup_logger("splunk-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "splunk.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))

async def periodic_check():
    pass

async def seed_sample_data():
    from app.models.db_models import SplunkIndex, LogExceptionRecord
    async with db_manager.session() as db:
        db.add(SplunkIndex(name="patient_portal_logs", status="ACTIVE", events_indexed_count=2541000))
        db.add(SplunkIndex(name="billing_service_logs", status="ACTIVE", events_indexed_count=982100))
        
        db.add(LogExceptionRecord(index_name="patient_portal_logs", exception_class="NullPointerException", message="Attempt to read patient profile on null object", occurrences=12))
        db.add(LogExceptionRecord(index_name="billing_service_logs", exception_class="SqlTimeoutException", message="Database connection timeout executing billing rollups", occurrences=74))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Splunk Core service on port 1016...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_check, 30, "splunk_evaluation")

    yield
    logger.info("Shutting down Splunk Core service...")
    scheduler.shutdown()

app = FastAPI(
    title="HealthMesh Splunk Core Connector Service",
    description="Splunk Core log indexes and critical application stack trace exception collector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1016, reload=False)
