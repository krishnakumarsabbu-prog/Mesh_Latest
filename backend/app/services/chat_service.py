"""
Chat service — orchestrates context retrieval, prompt building,
LLM streaming, and persistence.
"""
import json
import logging
import time
import uuid
from typing import AsyncIterator, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.llm.interface import LLMStreamChunk
from app.llm.registry import get_llm_provider
from app.llm.agents.orchestrator import run_agents_with_trace
from app.models.chat import (
    ChatFeedback,
    ChatFeedbackRating,
    ChatMessage,
    ChatMessageRole,
    ChatPromptAudit,
    ChatSession,
    ChatSessionStatus,
)
from app.services.chat_context_service import build_health_context
from app.services.chat_prompt_builder import build_llm_request

logger = logging.getLogger(__name__)

_SUGGESTED_PROMPTS = [
    "Why is health score low?",
    "Summarize current incidents",
    "Which connector is failing most?",
    "What changed in the last 24h?",
    "Show slowest connectors",
    "Give me an LOB overview",
]


class ChatService:
    async def create_session(
        self,
        db: AsyncSession,
        user_id: str,
        tenant_id: str,
        project_id: Optional[str] = None,
        title: Optional[str] = None,
    ) -> ChatSession:
        session = ChatSession(
            id=str(uuid.uuid4()),
            user_id=user_id,
            tenant_id=tenant_id,
            project_id=project_id,
            title=title or "New conversation",
            status=ChatSessionStatus.ACTIVE,
        )
        db.add(session)
        await db.flush()
        return session

    async def get_session(self, db: AsyncSession, session_id: str, user_id: str) -> Optional[ChatSession]:
        result = await db.execute(
            select(ChatSession).where(
                ChatSession.id == session_id,
                ChatSession.user_id == user_id,
                ChatSession.status != ChatSessionStatus.DELETED,
            )
        )
        return result.scalar_one_or_none()

    async def list_sessions(
        self,
        db: AsyncSession,
        user_id: str,
        tenant_id: str,
        limit: int = 20,
    ) -> list[ChatSession]:
        result = await db.execute(
            select(ChatSession)
            .where(
                ChatSession.user_id == user_id,
                ChatSession.tenant_id == tenant_id,
                ChatSession.status != ChatSessionStatus.DELETED,
            )
            .order_by(ChatSession.updated_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def delete_session(self, db: AsyncSession, session_id: str, user_id: str) -> bool:
        session = await self.get_session(db, session_id, user_id)
        if not session:
            return False
        session.status = ChatSessionStatus.DELETED
        await db.flush()
        return True

    async def get_history(self, db: AsyncSession, session_id: str, user_id: str) -> list[ChatMessage]:
        session = await self.get_session(db, session_id, user_id)
        if not session:
            return []
        result = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
        return list(result.scalars().all())

    async def stream_response(
        self,
        db: AsyncSession,
        session_id: str,
        user_id: str,
        tenant_id: str,
        user_query: str,
        project_id: Optional[str] = None,
    ) -> AsyncIterator[str]:
        session = await self.get_session(db, session_id, user_id)
        if not session:
            yield self._sse_event("error", {"message": "Session not found"})
            return

        user_msg = ChatMessage(
            id=str(uuid.uuid4()),
            session_id=session_id,
            role=ChatMessageRole.USER,
            content=user_query,
        )
        db.add(user_msg)
        await db.flush()

        if session.message_count == 0 and session.title == "New conversation":
            session.title = user_query[:60] + ("..." if len(user_query) > 60 else "")

        session.message_count += 1
        await db.flush()

        history_msgs = await self.get_history(db, session_id, user_id)
        conversation_history = [
            {"role": msg.role.value, "content": msg.content}
            for msg in history_msgs[:-1]
        ]

        try:
            health_ctx = await build_health_context(
                db=db,
                tenant_id=tenant_id,
                project_id=project_id or session.project_id,
            )
        except Exception as exc:
            logger.error("Failed to build health context: %s", exc)
            yield self._sse_event("error", {"message": "Failed to retrieve health context"})
            return

        # --- Multi-agent tool execution phase ---
        agent_context_supplement = ""
        agents_used: list[str] = []
        tools_executed: int = 0
        try:
            async for sse_chunk in run_agents_with_trace(user_query, db):
                # Parse to track metadata; re-yield agent trace events to client
                json_str = sse_chunk.strip()
                if json_str.startswith("data: "):
                    json_str = json_str[6:]
                try:
                    evt = json.loads(json_str)
                    if evt.get("type") == "agents":
                        agents_used = evt.get("active", [])
                        yield sse_chunk
                    elif evt.get("type") == "tool_start":
                        tools_executed += 1
                        yield sse_chunk
                    elif evt.get("type") == "tool_result":
                        yield sse_chunk
                    elif evt.get("type") == "agent_context":
                        # Internal event — enrich LLM context, don't forward to client
                        agent_context_supplement = evt.get("context", "")
                    else:
                        yield sse_chunk
                except (json.JSONDecodeError, KeyError):
                    yield sse_chunk
        except Exception as exc:
            logger.warning("Agent orchestration error (non-fatal): %s", exc)

        llm_request, context_summary = build_llm_request(
            user_query=user_query,
            health_context=health_ctx,
            conversation_history=conversation_history,
            agent_context=agent_context_supplement,
        )

        provider = get_llm_provider()

        assistant_msg_id = str(uuid.uuid4())
        assistant_msg = ChatMessage(
            id=assistant_msg_id,
            session_id=session_id,
            role=ChatMessageRole.ASSISTANT,
            content="",
            is_streaming=True,
        )
        db.add(assistant_msg)
        await db.flush()

        yield self._sse_event("session", {"session_id": session_id, "message_id": assistant_msg_id})

        full_content = ""
        start_time = time.monotonic()
        finish_reason: Optional[str] = None

        try:
            async for chunk in provider.stream_generate(llm_request):
                if chunk.delta:
                    full_content += chunk.delta
                    yield self._sse_event("delta", {"text": chunk.delta})

                if chunk.is_final:
                    finish_reason = chunk.finish_reason
                    break

            elapsed_ms = round((time.monotonic() - start_time) * 1000, 1)

            assistant_msg.content = full_content
            assistant_msg.is_streaming = False
            assistant_msg.finish_reason = finish_reason
            assistant_msg.response_time_ms = elapsed_ms
            session.message_count += 1
            await db.flush()

            audit = ChatPromptAudit(
                id=str(uuid.uuid4()),
                session_id=session_id,
                message_id=assistant_msg_id,
                user_query=user_query,
                system_prompt=llm_request.system_prompt[:500] if llm_request.system_prompt else None,
                context_summary=context_summary[:1000],
                health_snapshot=json.dumps({
                    "overall_health_pct": health_ctx.overall_health_pct,
                    "total_connectors": health_ctx.total_connectors,
                    "down": health_ctx.down_connectors,
                    "incidents": len(health_ctx.incident_connectors),
                }),
                llm_provider=provider.provider_name,
                llm_model=provider.model_name,
                response_time_ms=elapsed_ms,
            )
            db.add(audit)
            await db.flush()

            yield self._sse_event("done", {
                "message_id": assistant_msg_id,
                "response_time_ms": elapsed_ms,
                "suggestions": _SUGGESTED_PROMPTS[:4],
                "agents_used": agents_used,
                "tools_executed": tools_executed,
            })

        except Exception as exc:
            logger.error("LLM streaming error: %s", exc)
            error_text = "I encountered an error while generating a response. Please try again."
            full_content = error_text
            assistant_msg.content = error_text
            assistant_msg.is_streaming = False
            assistant_msg.is_error = True
            await db.flush()

            audit = ChatPromptAudit(
                id=str(uuid.uuid4()),
                session_id=session_id,
                message_id=assistant_msg_id,
                user_query=user_query,
                llm_provider=provider.provider_name,
                llm_model=provider.model_name,
                error_message=str(exc)[:500],
            )
            db.add(audit)
            await db.flush()

            yield self._sse_event("error", {"message": error_text})

    async def submit_feedback(
        self,
        db: AsyncSession,
        session_id: str,
        message_id: str,
        user_id: str,
        rating: str,
        comment: Optional[str] = None,
    ) -> bool:
        session = await self.get_session(db, session_id, user_id)
        if not session:
            return False

        existing = await db.execute(
            select(ChatFeedback).where(
                ChatFeedback.session_id == session_id,
                ChatFeedback.message_id == message_id,
            )
        )
        if existing.scalar_one_or_none():
            return False

        feedback = ChatFeedback(
            id=str(uuid.uuid4()),
            session_id=session_id,
            message_id=message_id,
            rating=ChatFeedbackRating(rating),
            comment=comment,
        )
        db.add(feedback)
        await db.flush()
        return True

    @staticmethod
    def _sse_event(event_type: str, data: dict) -> str:
        payload = json.dumps({"type": event_type, **data})
        return f"data: {payload}\n\n"


chat_service = ChatService()
