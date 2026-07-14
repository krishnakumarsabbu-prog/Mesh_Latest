from fastapi import APIRouter
from app.api.v1.endpoints import auth, users, runtime, websocket, digital_twin, dc_exit

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(runtime.router)
api_router.include_router(websocket.router)
api_router.include_router(digital_twin.router)
api_router.include_router(dc_exit.router)
