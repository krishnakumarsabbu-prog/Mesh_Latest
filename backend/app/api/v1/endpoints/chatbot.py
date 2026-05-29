import asyncio
import logging
from typing import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.base import get_db
from app.models.user import User
from app.schemas.chat import (
    ChatFeedbackRequest,
    ChatMessageResponse,
    ChatSessionCreate,
    ChatSessionResponse,
    ChatStreamRequest,
    SuggestedPromptsResponse,
)
from app.services.chat_service import chat_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    _limiter = Limiter(key_func=get_remote_address)
    _RATE_LIMIT = "20/minute"
    _SLOWAPI_AVAILABLE = True
except ImportError:
    _limiter = None
    _RATE_LIMIT = None
    _SLOWAPI_AVAILABLE = False


def _rate_limit(func):
    """Apply rate limit decorator only when slowapi is available."""
    if _SLOWAPI_AVAILABLE and _limiter:
        return _limiter.limit(_RATE_LIMIT)(func)
    return func

_SUGGESTED_PROMPTS = [
    "Why is health score low?",
    "Summarize current incidents",
    "Which connector is failing most?",
    "What changed in the last 24h?",
    "Show slowest connectors",
    "Give me an LOB overview",
    "Are there any connectors down?",
    "What is my overall system health?",
]


@router.post("/session", response_model=ChatSessionResponse)
async def create_session(
    data: ChatSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id or "default"
    session = await chat_service.create_session(
        db=db,
        user_id=current_user.id,
        tenant_id=tenant_id,
        project_id=data.project_id,
        title=data.title,
    )
    return session


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id or "default"
    return await chat_service.list_sessions(db=db, user_id=current_user.id, tenant_id=tenant_id)


@router.get("/history/{session_id}", response_model=list[ChatMessageResponse])
async def get_history(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    messages = await chat_service.get_history(db=db, session_id=session_id, user_id=current_user.id)
    return messages


@router.delete("/session/{session_id}")
async def delete_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await chat_service.delete_session(db=db, session_id=session_id, user_id=current_user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True}


@router.post("/stream")
@_rate_limit
async def stream_chat(
    data: ChatStreamRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tenant_id = current_user.tenant_id or "default"

    async def event_generator() -> AsyncIterator[str]:
        try:
            async for chunk in chat_service.stream_response(
                db=db,
                session_id=data.session_id,
                user_id=current_user.id,
                tenant_id=tenant_id,
                user_query=data.message,
                project_id=data.project_id,
            ):
                if await request.is_disconnected():
                    logger.info("Client disconnected from chat stream")
                    break
                yield chunk
        except asyncio.CancelledError:
            logger.info("Chat stream cancelled by client")
        except Exception as exc:
            logger.error("Unhandled error in chat stream: %s", exc)
            import json
            yield f"data: {json.dumps({'type': 'error', 'message': 'Stream error'})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.post("/feedback")
async def submit_feedback(
    data: ChatFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ok = await chat_service.submit_feedback(
        db=db,
        session_id=data.session_id,
        message_id=data.message_id,
        user_id=current_user.id,
        rating=data.rating,
        comment=data.comment,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="Feedback could not be submitted")
    return {"ok": True}


@router.get("/suggested-prompts", response_model=SuggestedPromptsResponse)
async def get_suggested_prompts(
    current_user: User = Depends(get_current_user),
):
    return SuggestedPromptsResponse(prompts=_SUGGESTED_PROMPTS)


@router.post("/chatbot/message")
async def legacy_message(
    data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.services.chatbot_service import chatbot_service as legacy_service
    from app.schemas.health import ChatRequest
    req = ChatRequest(message=data.get("message", ""), context=data.get("context"))
    return await legacy_service.process_message(db, req, tenant_id=current_user.tenant_id or "default")
