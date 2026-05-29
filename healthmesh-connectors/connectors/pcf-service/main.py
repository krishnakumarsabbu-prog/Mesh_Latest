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

logger = setup_logger("pcf-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "pcf.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))

async def periodic_check():
    pass

async def seed_sample_data():
    from app.models.db_models import PCFApp, DiegoCell
    async with db_manager.session() as db:
        db.add(DiegoCell(cell_id="diego-cell-01", status="HEALTHY", memory_utilization_pct=42.5))
        db.add(DiegoCell(cell_id="diego-cell-02", status="HEALTHY", memory_utilization_pct=38.4))
        
        db.add(PCFApp(name="patient-intake-service", org="healthmesh-prod", space="billing", instances_desired=4, instances_running=4, status="STARTED"))
        db.add(PCFApp(name="clinical-record-api", org="healthmesh-prod", space="core-emr", instances_desired=2, instances_running=0, status="CRASHED"))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up PCF Cloud service on port 1013...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_check, 30, "pcf_evaluation")

    yield
    logger.info("Shutting down PCF Cloud service...")
    scheduler.shutdown()

app = FastAPI(
    title="HealthMesh PCF Cloud Connector Service",
    description="Pivotal Cloud Foundry (PCF) Diego cell and container operational status connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1013, reload=False)
