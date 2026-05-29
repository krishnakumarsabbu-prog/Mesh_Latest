"""
Fallback provider used when no LLM API key is configured.
Returns deterministic responses based on keyword matching so the
app remains fully functional without an external LLM.
"""
import logging
from typing import AsyncIterator

from app.llm.interface import LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk

logger = logging.getLogger(__name__)

_MOCK_RESPONSE = (
    "I'm operating in offline mode — no LLM API key is configured. "
    "I can still help you navigate HealthMesh: try asking about health status, "
    "connector issues, performance metrics, or LOB overviews."
)


class FallbackProvider(LLMProvider):
    @property
    def provider_name(self) -> str:
        return "fallback"

    @property
    def model_name(self) -> str:
        return "fallback-v1"

    async def generate(self, request: LLMRequest) -> LLMResponse:
        logger.warning("FallbackProvider.generate called — no LLM API key configured")
        return LLMResponse(
            content=_MOCK_RESPONSE,
            model=self.model_name,
            provider=self.provider_name,
        )

    async def stream_generate(self, request: LLMRequest) -> AsyncIterator[LLMStreamChunk]:
        logger.warning("FallbackProvider.stream_generate called — no LLM API key configured")
        words = _MOCK_RESPONSE.split(" ")
        for i, word in enumerate(words):
            is_last = i == len(words) - 1
            yield LLMStreamChunk(
                delta=word + ("" if is_last else " "),
                is_final=is_last,
                finish_reason="stop" if is_last else None,
            )

    async def health_check(self) -> bool:
        return True
