"""Configuration settings for the market data service."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    DATABASE_URL: str
    DEFAULT_TF_MIN: int = 5
    MAX_LIMIT: int = 5000
    WS_DEFAULT_STEP_SECONDS: int = 15
    WS_MAX_STEP_SECONDS: int = 60
    WS_MIN_STEP_SECONDS: int = 1
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

