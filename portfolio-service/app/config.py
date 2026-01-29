from __future__ import annotations

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str
    AUTH_SERVICE_URL: str = "http://auth-service:8080"
    # Default fallback: local HS256 verify for current repo’s auth-service implementation
    JWT_SECRET: str | None = None

    INTERNAL_API_KEY: str = Field(..., description="Required for /internal routes")
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"

    DB_CONNECT_TIMEOUT: int = 5
    DB_COMMAND_TIMEOUT: int = 30

    LOG_LEVEL: str = "INFO"

    class Config:
        env_file = ".env"
        case_sensitive = True

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()


