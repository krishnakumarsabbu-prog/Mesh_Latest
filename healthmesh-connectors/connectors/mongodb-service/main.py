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

logger = setup_logger("mongodb-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "mongodb.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_mongodb_check():
    logger.info("Evaluating MongoDB replica sync logs and performance status...")
    async with db_manager.session() as db:
        from app.models.db_models import ReplicaMetric, MongoAlert
        from sqlalchemy import select

        res = await db.execute(select(ReplicaMetric))
        metrics = res.scalars().all()
        for m in metrics:
            if m.sync_lag_seconds > 30:
                alert = MongoAlert(
                    component="REPLICA_SET",
                    component_name=m.node_name,
                    alert_type="SYNC_LAG_CRITICAL",
                    severity="CRITICAL",
                    message=f"CRITICAL SYNC LAG: Replica node {m.node_name} is behind by {m.sync_lag_seconds}s!"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest MongoDB sample CSV at startup."""
    import csv
    import io
    from app.models.db_models import ReplicaSet, MongoNode, IngestionLog
    from sqlalchemy import select

    sample_files = ["mongodb_info.csv"]
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
                    # Columns: agent_hostname, cl_name, cl_role, collector_id, env, group_id,
                    #          hostname, instance, job, mongodb_ver, org_id, process_port,
                    #          process_type, replica_state, rs_nm, rs_state, Value
                    rs_name = rec.get("rs_nm") or rec.get("cl_name") or "unknown"
                    node_name = rec.get("hostname") or rec.get("agent_hostname")
                    role = rec.get("cl_role", "shardsvr")
                    replica_state = rec.get("replica_state", "primary")

                    if not node_name:
                        continue

                    # Upsert ReplicaSet
                    stmt = select(ReplicaSet).where(ReplicaSet.name == rs_name)
                    res = await db.execute(stmt)
                    rs = res.scalar_one_or_none()
                    if not rs:
                        db.add(ReplicaSet(
                            name=rs_name,
                            status="PRIMARY_OK",
                            node_count=3
                        ))

                    # Upsert MongoNode - use truncated name to avoid unique constraint issues
                    node_key = f"{node_name}-{rs_name}"[:100]
                    stmt2 = select(MongoNode).where(MongoNode.name == node_key)
                    res2 = await db.execute(stmt2)
                    existing_node = res2.scalar_one_or_none()

                    node_status = "ONLINE" if replica_state in ("primary", "secondary") else "OFFLINE"
                    if existing_node:
                        existing_node.status = node_status
                        existing_node.role = replica_state.upper()
                    else:
                        db.add(MongoNode(
                            name=node_key,
                            replica_set_name=rs_name,
                            role=replica_state.upper(),
                            status=node_status,
                            host=rec.get("hostname"),
                            port=int(rec.get("process_port") or 27017)
                        ))

                await db.commit()
            logger.info(f"Seeded MongoDB data from {fname} ({len(rows)} rows)")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up MongoDB service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_mongodb_check, 30, "mongodb_replica_evaluation")

    yield
    logger.info("Shutting down MongoDB service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh MongoDB Connector Service",
    description="Enterprise replica set, oplog lag and collection metric validation connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1003, reload=False)
