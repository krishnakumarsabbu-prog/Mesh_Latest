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

logger = setup_logger("vm-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "vm.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))

async def periodic_check():
    pass

async def seed_sample_data():
    from app.models.db_models import ESXiHost, VirtualMachine
    async with db_manager.session() as db:
        db.add(ESXiHost(name="esxi-srv-01.healthmesh.ai", status="CONNECTED", cpu_cores=64, memory_gb=512))
        db.add(ESXiHost(name="esxi-srv-02.healthmesh.ai", status="CONNECTED", cpu_cores=64, memory_gb=512))
        
        db.add(VirtualMachine(name="shv-web-billing-01", host_name="esxi-srv-01.healthmesh.ai", power_state="POWERED_ON", cpu_provisioned=8, ram_provisioned_gb=32))
        db.add(VirtualMachine(name="shv-web-auth-02", host_name="esxi-srv-01.healthmesh.ai", power_state="POWERED_OFF", cpu_provisioned=4, ram_provisioned_gb=16))
        await db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up VM vCenter service on port 1014...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_check, 30, "vm_evaluation")

    yield
    logger.info("Shutting down VM vCenter service...")
    scheduler.shutdown()

app = FastAPI(
    title="HealthMesh VM vCenter Connector Service",
    description="VMware vCenter ESXi hypervisor cluster allocation and active VM statistics connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1014, reload=False)
