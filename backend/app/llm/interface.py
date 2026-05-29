from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional
from dataclasses import dataclass, field


@dataclass
class LLMMessage:
    role: str
    content: str


@dataclass
class LLMRequest:
    messages: list[LLMMessage]
    system_prompt: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.7
    stream: bool = False
    metadata: dict = field(default_factory=dict)


@dataclass
class LLMResponse:
    content: str
    model: str
    provider: str
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    finish_reason: Optional[str] = None
    metadata: dict = field(default_factory=dict)


@dataclass
class LLMStreamChunk:
    delta: str
    is_final: bool = False
    finish_reason: Optional[str] = None


class LLMProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        ...

    @abstractmethod
    async def stream_generate(self, request: LLMRequest) -> AsyncIterator[LLMStreamChunk]:
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        ...
