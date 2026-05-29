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

logger = setup_logger("servicenow-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "servicenow.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))

async def periodic_check():
    pass

async def seed_sample_data():
    from app.models.db_models import CMDBAsset, ServiceNowIncident
    async with db_manager.session() as db:
        db.add(CMDBAsset(ci_name="shv-web-billing-01", ci_class="cmdb_ci_linux_server", operational_status="Operational", assigned_to="BillingTeam"))
        db.add(CMDBAsset(ci_name="shv-mongo-01", ci_class="cmdb_ci_db_instance", operational_status="Operational", assigned_to="DBATeam"))
        
        db.add(ServiceNowIncident(number="INC0094125", short_description="Billing Database cluster connectivity failures to shv-mongo-01", severity="1 - Critical", incident_state="In Progress", assigned_group="DBA_Group"))
        db.add(ServiceNowIncident(number="INC0094188", short_description="Minor warning: CPU utilization high on shv-web-billing-01", severity="3 - Moderate", incident_state="New", assigned_group="WebOps_Group"))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up ServiceNow CMDB service on port 1015...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_check, 30, "servicenow_evaluation")

    yield
    logger.info("Shutting down ServiceNow CMDB service...")
    scheduler.shutdown()

app = FastAPI(
    title="HealthMesh ServiceNow CMDB Connector Service",
    description="ServiceNow ITSM incident tracking and CMDB configuration item validation connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1015, reload=False)
