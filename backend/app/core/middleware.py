from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import time
import logging
import uuid
import json

logger = logging.getLogger(__name__)

_AUDIT_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Auth endpoints already write their own fine-grained audit entries
_SKIP_AUDIT_PATHS = {
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/refresh",
    "/api/v1/auth/logout",
}


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = str(uuid.uuid4())[:8]
        start_time = time.perf_counter()

        request.state.request_id = request_id

        logger.info(
            f"[{request_id}] {request.method} {request.url.path} "
            f"from {request.client.host if request.client else 'unknown'}"
        )

        response = await call_next(request)
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Response-Time"] = f"{duration_ms}ms"

        logger.info(
            f"[{request_id}] {response.status_code} "
            f"completed in {duration_ms}ms"
        )

        return response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Intercepts all POST/PUT/PATCH/DELETE requests and writes a supplemental
    audit row capturing caller ID, resource path, action, IP, user-agent, and
    timestamp. Fine-grained service-level audit entries are still written by
    individual endpoint handlers.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method

        if method not in _AUDIT_METHODS or path in _SKIP_AUDIT_PATHS:
            return await call_next(request)

        response = await call_next(request)

        if response.status_code < 400:
            try:
                await self._write_audit(request, method, path, response.status_code)
            except Exception:
                logger.exception("AuditMiddleware: failed to write audit log")

        return response

    async def _write_audit(self, request: Request, method: str, path: str, status_code: int):
        from app.core.security import decode_token
        from app.db.base import AsyncSessionLocal
        from app.models.audit import AuditLog

        user_id = None
        tenant_id = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            payload = decode_token(auth_header[7:])
            if payload:
                user_id = payload.get("sub")
                tenant_id = payload.get("tenant")

        ip = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")

        # Derive resource_type and resource_id from URL segments
        # e.g. /api/v1/lobs/abc123 -> resource_type="lobs", resource_id="abc123"
        segments = [s for s in path.split("/") if s]
        resource_type = segments[2] if len(segments) >= 3 else path
        resource_id = segments[3] if len(segments) >= 4 else None

        entry = AuditLog(
            id=str(uuid.uuid4()),
            user_id=user_id,
            action=f"http.{method.lower()}",
            resource_type=resource_type,
            resource_id=resource_id,
            changes=json.dumps({"status_code": status_code, "path": path}),
            ip_address=ip,
            user_agent=user_agent,
            tenant_id=tenant_id or "default",
        )

        async with AsyncSessionLocal() as db:
            db.add(entry)
            await db.commit()


def register_middlewares(app: FastAPI) -> None:
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(RequestLoggingMiddleware)
    app.add_middleware(AuditMiddleware)
