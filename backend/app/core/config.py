from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    APP_NAME: str = "HealthMesh AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    DATABASE_URL: str = "sqlite+aiosqlite:///./healthmesh.db"
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    SEED_DB: bool = True

    TACHYON_API_KEY: Optional[str] = None
    TACHYON_BASE_URL: str = "https://api.tachyonai.com/v1"
    TACHYON_MODEL: str = "tachyon-health-1"

    CHAT_MAX_CONTEXT_TOKENS: int = 3000
    CHAT_MAX_HISTORY_MESSAGES: int = 20
    CHAT_STREAM_TIMEOUT: float = 120.0

    class Config:
        env_file = ".env"


settings = Settings()
