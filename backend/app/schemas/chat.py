from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ChatSessionCreate(BaseModel):
    project_id: Optional[str] = None
    title: Optional[str] = None


class ChatSessionResponse(BaseModel):
    id: str
    user_id: str
    tenant_id: str
    project_id: Optional[str] = None
    title: Optional[str] = None
    status: str
    message_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ChatMessageResponse(BaseModel):
    id: str
    session_id: str
    role: str
    content: str
    is_streaming: bool
    is_error: bool
    finish_reason: Optional[str] = None
    response_time_ms: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ChatStreamRequest(BaseModel):
    session_id: str
    message: str
    project_id: Optional[str] = None


class ChatFeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    rating: str
    comment: Optional[str] = None


class SuggestedPromptsResponse(BaseModel):
    prompts: list[str]
