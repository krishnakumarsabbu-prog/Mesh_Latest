"""
Provider registry — resolves the active LLM provider from config.
"""
import logging
from functools import lru_cache

from app.llm.interface import LLMProvider

logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_llm_provider() -> LLMProvider:
    from app.core.config import settings

    if settings.TACHYON_API_KEY:
        from app.llm.tachyon import TachyonProvider
        logger.info("LLM provider: Tachyon (model=%s)", settings.TACHYON_MODEL)
        return TachyonProvider(
            api_key=settings.TACHYON_API_KEY,
            base_url=settings.TACHYON_BASE_URL,
            model=settings.TACHYON_MODEL,
        )

    from app.llm.fallback import FallbackProvider
    logger.warning("LLM provider: Fallback (no TACHYON_API_KEY configured)")
    return FallbackProvider()
