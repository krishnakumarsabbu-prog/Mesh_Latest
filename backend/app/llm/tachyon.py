import asyncio
import json
import logging
from typing import AsyncIterator, Optional

import httpx

from app.llm.interface import LLMMessage, LLMProvider, LLMRequest, LLMResponse, LLMStreamChunk

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 60.0
_DEFAULT_CONNECT_TIMEOUT = 10.0
_MAX_RETRIES = 2
_RETRY_DELAY = 1.0


class TachyonProvider(LLMProvider):
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.tachyonai.com/v1",
        model: str = "tachyon-health-1",
        timeout: float = _DEFAULT_TIMEOUT,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout = timeout

    @property
    def provider_name(self) -> str:
        return "tachyon"

    @property
    def model_name(self) -> str:
        return self._model

    def _build_headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-Provider": "tachyon",
        }

    def _build_payload(self, request: LLMRequest, stream: bool = False) -> dict:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})

        return {
            "model": self._model,
            "messages": messages,
            "max_tokens": request.max_tokens,
            "temperature": request.temperature,
            "stream": stream,
        }

    async def generate(self, request: LLMRequest) -> LLMResponse:
        payload = self._build_payload(request, stream=False)
        last_exc: Optional[Exception] = None

        for attempt in range(_MAX_RETRIES + 1):
            try:
                async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout, connect=_DEFAULT_CONNECT_TIMEOUT)) as client:
                    resp = await client.post(
                        f"{self._base_url}/chat/completions",
                        headers=self._build_headers(),
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    choice = data["choices"][0]
                    usage = data.get("usage", {})
                    return LLMResponse(
                        content=choice["message"]["content"],
                        model=data.get("model", self._model),
                        provider=self.provider_name,
                        input_tokens=usage.get("prompt_tokens"),
                        output_tokens=usage.get("completion_tokens"),
                        finish_reason=choice.get("finish_reason"),
                    )
            except (httpx.TimeoutException, httpx.ConnectError) as exc:
                last_exc = exc
                logger.warning("Tachyon API attempt %d/%d failed: %s", attempt + 1, _MAX_RETRIES + 1, exc)
                if attempt < _MAX_RETRIES:
                    await asyncio.sleep(_RETRY_DELAY * (attempt + 1))
            except httpx.HTTPStatusError as exc:
                logger.error("Tachyon API HTTP error %s: %s", exc.response.status_code, exc.response.text)
                raise
            except Exception as exc:
                logger.error("Tachyon API unexpected error: %s", exc)
                raise

        raise RuntimeError(f"Tachyon API request failed after {_MAX_RETRIES + 1} attempts: {last_exc}")

    async def stream_generate(self, request: LLMRequest) -> AsyncIterator[LLMStreamChunk]:
        payload = self._build_payload(request, stream=True)

        async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout, connect=_DEFAULT_CONNECT_TIMEOUT)) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers=self._build_headers(),
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    if line == "[DONE]":
                        yield LLMStreamChunk(delta="", is_final=True, finish_reason="stop")
                        return
                    try:
                        data = json.loads(line)
                        choice = data["choices"][0]
                        delta = choice.get("delta", {})
                        content = delta.get("content", "")
                        finish_reason = choice.get("finish_reason")
                        is_final = finish_reason is not None
                        if content or is_final:
                            yield LLMStreamChunk(delta=content, is_final=is_final, finish_reason=finish_reason)
                        if is_final:
                            return
                    except (json.JSONDecodeError, KeyError) as exc:
                        logger.debug("Skipping malformed SSE chunk: %s | error: %s", line, exc)
                        continue

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                resp = await client.get(
                    f"{self._base_url}/models",
                    headers=self._build_headers(),
                )
                return resp.status_code == 200
        except Exception as exc:
            logger.warning("Tachyon health check failed: %s", exc)
            return False
