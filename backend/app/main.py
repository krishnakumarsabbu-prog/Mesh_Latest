import asyncio
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.middleware import register_middlewares
from app.api.v1.router import api_router
from app.db.base import init_db

try:
    from slowapi import Limiter, _rate_limit_exceeded_handler
    from slowapi.util import get_remote_address
    from slowapi.errors import RateLimitExceeded
    limiter = Limiter(key_func=get_remote_address)
    _SLOWAPI_AVAILABLE = True
except ImportError:
    limiter = None
    _SLOWAPI_AVAILABLE = False

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

_scheduler_task = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler_task
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    from app.connectors.base.registry import initialize_registry
    initialize_registry()
    await init_db()
    logger.info("Database initialized")

    # Always auto-import telemetry docs on startup if empty
    from app.api.v1.endpoints.runtime import import_all_docs
    from app.db.base import AsyncSessionLocal
    from app.models.runtime import RuntimeAsset
    from sqlalchemy import select, func
    async with AsyncSessionLocal() as session:
        try:
            count_res = await session.execute(select(func.count(RuntimeAsset.id)))
            count = count_res.scalar() or 0
            if count == 0:
                logger.info("Database is empty. Auto-importing telemetry docs from docs directory...")
                result = await import_all_docs(db=session)
                logger.info(f"Auto-import completed: {result.get('message', '')} "
                            f"Loaded {result.get('total_assets', 0)} assets.")
            else:
                logger.info(f"Database already contains {count} assets. Skipping auto-import to preserve data.")
        except Exception as e:
            try:
                await session.rollback()
            except Exception:
                pass
            logger.error(f"Failed to auto-import telemetry docs on startup: {e}", exc_info=True)

    from app.services.aggregation_scheduler import aggregation_scheduler
    _scheduler_task = asyncio.ensure_future(aggregation_scheduler.run_scheduled_refresh())
    logger.info("Aggregation scheduler started")

    yield

    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass
    logger.info("Shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Enterprise Multi-LOB Health Monitoring Platform",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

if _SLOWAPI_AVAILABLE and limiter:
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_middlewares(app)
register_exception_handlers(app)

app.include_router(api_router)


@app.get("/health", tags=["system"])
async def health_check():
    return {
        "status": "ok",
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": "development" if settings.DEBUG else "production",
    }


@app.get("/api/v1/system/info", tags=["system"])
async def system_info():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "api_version": "v1",
        "database": "SQLite3",
        "features": ["auth", "users", "lobs", "projects", "connectors", "health", "dashboard", "chatbot", "audit"],
    }
