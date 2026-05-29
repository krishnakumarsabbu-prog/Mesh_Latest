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

logger = setup_logger("adc-loadbalancer-service")

db_path = os.path.join(os.path.dirname(__file__), "uploads", "adc_lb.db")
db_manager = DatabaseManager(db_path)
scheduler = ConnectorScheduler()

SAMPLES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "samples"))


async def periodic_health_check():
    logger.info("Running ADC health score evaluation...")
    async with db_manager.session() as db:
        from app.models.db_models import VirtualService, ADCAlert
        from sqlalchemy import select
        res = await db.execute(select(VirtualService))
        vss = res.scalars().all()
        for vs in vss:
            if vs.health_score < 30 and vs.health_score > 0:
                alert = ADCAlert(
                    component="VIRTUAL_SERVICE",
                    component_name=vs.name,
                    alert_type="VS_HEALTH_CRITICAL",
                    severity="CRITICAL",
                    message=f"Virtual Service {vs.name} health score critically degraded: {vs.health_score}"
                )
                db.add(alert)
        await db.commit()


async def seed_sample_data():
    """Ingest sample pool.json and virtual_service.json files at startup."""
    from app.api.endpoints import upload_telemetry
    import io
    from fastapi import UploadFile

    sample_files = ["pool.json", "virtual_service.json", "load_balancer_report.csv"]
    for fname in sample_files:
        fpath = os.path.join(SAMPLES_DIR, fname)
        if not os.path.exists(fpath):
            logger.warning(f"Sample file not found: {fpath}")
            continue
        try:
            with open(fpath, "rb") as f:
                content = f.read()
            async with db_manager.session() as db:
                from app.api.endpoints import upload_telemetry as _upload
                # Directly call the ingestion logic
                from app.api.endpoints import _parse_prometheus_line, _ingest_prometheus_data
                from app.models.db_models import VirtualService, Pool, LoadBalancerMetric, ADCAlert, PoolMembership, IngestionLog

                filename_lower = fname.lower()
                log_entry = IngestionLog(
                    filename=fname,
                    file_type=fname.split('.')[-1].upper(),
                    status="SUCCESS",
                    total_rows=0,
                    valid_rows=0,
                    invalid_rows=0,
                    duplicates=0,
                    quality_score=100.0,
                    confidence_level="HIGH",
                    error_summary=""
                )
                db.add(log_entry)

                if filename_lower.endswith(".json"):
                    import re
                    text = content.decode("utf-8")
                    lines = text.splitlines()
                    parsed = []
                    for line in lines:
                        result = _parse_prometheus_line(line)
                        if result:
                            parsed.append(result)

                    grouped = _ingest_prometheus_data(parsed, "pool" if "pool" in fname else "virtualservice")
                    log_entry.total_rows = len(grouped)
                    log_entry.valid_rows = len(grouped)

                    from sqlalchemy import select as sa_select
                    for item in grouped:
                        uuid = item["uuid"]
                        name = item["name"]
                        tenant = item["tenant"]
                        server = item["server"]
                        metrics = item["metrics"]
                        res_type = item["type"]
                        if not uuid:
                            continue

                        health_score = metrics.get("avi_healthscore_health_score_value", 0.0)
                        perf_score = metrics.get("avi_healthscore_performance_score_value", 0.0)
                        sec_penalty = metrics.get("avi_healthscore_security_penalty", 0.0)
                        res_penalty = metrics.get("avi_healthscore_resources_penalty", 0.0)
                        anom_penalty = metrics.get("avi_healthscore_anomaly_penalty", 0.0)

                        for mname, mval in metrics.items():
                            m = LoadBalancerMetric(
                                resource_uuid=uuid, resource_name=name,
                                resource_type=res_type, metric_name=mname,
                                metric_value=mval, tenant=tenant, server=server
                            )
                            db.add(m)

                        if res_type == "pool":
                            hs_status = metrics.get("avi_l4_server_avg_health_status", 0.0)
                            uptime = metrics.get("avi_l4_server_avg_uptime", 0.0)
                            complete = metrics.get("avi_l7_server_avg_pool_complete_responses", 0.0)
                            errors = metrics.get("avi_l7_server_avg_pool_error_responses", 0.0)
                            conns = metrics.get("avi_l4_server_avg_pool_new_established_conns", 0.0)
                            bw = metrics.get("avi_l4_server_avg_pool_bandwidth", 0.0)
                            status = "UP" if health_score > 50 or hs_status >= 100 else "DOWN"

                            stmt = sa_select(Pool).where(Pool.uuid == uuid, Pool.server == server)
                            res = await db.execute(stmt)
                            pool = res.scalar_one_or_none()
                            if pool:
                                pool.health_score = health_score
                                pool.status = status
                            else:
                                db.add(Pool(
                                    uuid=uuid, name=name, tenant=tenant, server=server,
                                    health_score=health_score, performance_score=perf_score,
                                    health_status=hs_status, uptime=uptime,
                                    avg_complete_responses=complete, avg_error_responses=errors,
                                    new_connections=conns, bandwidth=bw, status=status
                                ))
                        elif res_type == "virtualservice":
                            active_se = int(metrics.get("avi_l4_client_max_num_active_se", 0))
                            status = "UP" if health_score >= 50 else "DOWN"
                            stmt = sa_select(VirtualService).where(VirtualService.uuid == uuid)
                            res = await db.execute(stmt)
                            vs = res.scalar_one_or_none()
                            if vs:
                                vs.health_score = health_score
                                vs.status = status
                            else:
                                db.add(VirtualService(
                                    uuid=uuid, name=name, tenant=tenant,
                                    health_score=health_score, performance_score=perf_score,
                                    security_penalty=sec_penalty, resources_penalty=res_penalty,
                                    anomaly_penalty=anom_penalty, active_se_count=active_se,
                                    status=status
                                ))

                elif filename_lower.endswith(".csv"):
                    from shared.ingestion.engine import IngestionEngine
                    from app.api.endpoints import EXPECTED_SCHEMAS
                    from sqlalchemy import select as sa_select
                    parse_result = IngestionEngine.parse_file(content, fname, EXPECTED_SCHEMAS)
                    if parse_result.get("success"):
                        schema = parse_result["schema_detected"]
                        records = parse_result["data"]
                        log_entry.total_rows = parse_result["total_rows"]
                        log_entry.valid_rows = parse_result["valid_rows"]
                        if schema == "load_balancer_report":
                            for rec in records:
                                app_id = rec.get("app_id")
                                pool_name = rec.get("pool")
                                if not app_id or not pool_name:
                                    continue
                                stmt = sa_select(PoolMembership).where(
                                    PoolMembership.app_id == app_id,
                                    PoolMembership.pool_name == pool_name
                                )
                                res = await db.execute(stmt)
                                existing = res.scalar_one_or_none()
                                enabled_val = rec.get("enabled", "1")
                                enabled = str(enabled_val).strip() in ("1", "true", "True", "yes")
                                if not existing:
                                    db.add(PoolMembership(
                                        app_id=app_id, pool_name=pool_name,
                                        tenant=rec.get("tenant"), controller=rec.get("controller"),
                                        site=rec.get("site"), zone=rec.get("zone"), enabled=enabled
                                    ))

                await db.commit()
                logger.info(f"Seeded sample data from {fname}")
        except Exception as e:
            logger.error(f"Error seeding {fname}: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up ADC Load Balancer service...")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    await db_manager.init_db()
    logger.info("Database initialized.")

    await seed_sample_data()
    logger.info("Sample data seeded.")

    scheduler.start()
    scheduler.add_interval_job(periodic_health_check, 30, "adc_health_evaluation")

    yield

    logger.info("Shutting down ADC Load Balancer service...")
    scheduler.shutdown()


app = FastAPI(
    title="HealthMesh ADC / Load Balancer Connector Service",
    description="Network layer ADC and virtual service health mesh connector",
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
    uvicorn.run("main:app", host="0.0.0.0", port=1009, reload=False)
