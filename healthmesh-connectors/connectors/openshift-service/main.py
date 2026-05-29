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

logger = setup_logger("openshift-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "openshift.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_openshift_check():
    logger.info("Evaluating OpenShift workload health, restart counters, and scaling...")
    async with db_manager.session() as db:
        from app.models.db_models import OCPPod, OCPAlert
        from sqlalchemy import select

        res = await db.execute(select(OCPPod))
        pods = res.scalars().all()
        for p in pods:
            if p.restart_count > 50:
                alert = OCPAlert(
                    component="POD",
                    component_name=p.name,
                    alert_type="CRITICAL_RESTARTS",
                    severity="CRITICAL",
                    message=f"CRITICAL RESTART THRESHOLD EXCEEDED: Pod {p.name} has restarted {p.restart_count} times!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest OCP pod info CSV at startup."""
    import csv
    import io
    from app.models.db_models import OCPCluster, OCPNamespace, OCPPod, IngestionLog
    from sqlalchemy import select

    sample_files = ["OCP_pod_info.csv"]
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
                    # Columns: cluster, env, lob, namespace, neighborhood, pod
                    cluster_name = rec.get("cluster")
                    ns_name = rec.get("namespace")
                    pod_name = rec.get("pod")
                    if not cluster_name or not pod_name:
                        continue

                    # Upsert cluster
                    stmt = select(OCPCluster).where(OCPCluster.name == cluster_name)
                    res = await db.execute(stmt)
                    cluster = res.scalar_one_or_none()
                    if not cluster:
                        db.add(OCPCluster(name=cluster_name, status="READY", node_count=5))

                    # Upsert namespace
                    if ns_name:
                        stmt2 = select(OCPNamespace).where(OCPNamespace.name == ns_name)
                        res2 = await db.execute(stmt2)
                        ns = res2.scalar_one_or_none()
                        if not ns:
                            db.add(OCPNamespace(
                                cluster_name=cluster_name,
                                name=ns_name,
                                status="ACTIVE"
                            ))

                    # Upsert pod - truncate name to fit column
                    pod_key = pod_name[:150]
                    stmt3 = select(OCPPod).where(OCPPod.name == pod_key)
                    res3 = await db.execute(stmt3)
                    existing_pod = res3.scalar_one_or_none()
                    if not existing_pod:
                        db.add(OCPPod(
                            namespace_name=ns_name or cluster_name,
                            name=pod_key,
                            status="RUNNING",
                            restart_count=0
                        ))

                await db.commit()
            logger.info(f"Seeded OpenShift data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up OpenShift service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_openshift_check, 30, "openshift_pod_evaluation")

    yield
    logger.info("Shutting down OpenShift service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh OpenShift Connector Service",
    description="Enterprise OpenShift pod topology, namespace resource allocations and scaling monitoring connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1004, reload=False)
