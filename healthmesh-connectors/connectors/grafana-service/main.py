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

logger = setup_logger("grafana-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "grafana.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))

async def periodic_check():
    pass

async def seed_sample_data():
    from app.models.db_models import Dashboard, DataSource
    async with db_manager.session() as db:
        db.add(DataSource(name="prometheus-production", ds_type="prometheus", status="OK"))
        db.add(DataSource(name="splunk-audit-logs", ds_type="splunk", status="OK"))
        db.add(DataSource(name="influxdb-telemetry", ds_type="influxdb", status="ERROR"))
        
        db.add(Dashboard(title="Executive Cockpit Dashboard", uid="exec_cockpit", status="ACTIVE"))
        db.add(Dashboard(title="Billing Performance Cockpit", uid="billing_perf", status="ACTIVE"))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Grafana service on port 1012...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_check, 30, "grafana_evaluation")

    yield
    logger.info("Shutting down Grafana service...")
    scheduler.shutdown()

app = FastAPI(
    title="HealthMesh Grafana Connector Service",
    description="Grafana HTTP API dashboard and datasource validation connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1012, reload=False)
