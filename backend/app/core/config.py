from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # AI
    ANTHROPIC_API_KEY: str = ""

    # Email
    RESEND_API_KEY: str = ""

    # Auth – shared secret with Next.js proxy
    API_SECRET_KEY: str

    # Frontend URL (for email links, CORS if ever needed)
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
