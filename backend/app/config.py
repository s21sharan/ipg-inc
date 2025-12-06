from pydantic_settings import BaseSettings
from functools import lru_cache
import os
from pathlib import Path


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App settings
    app_name: str = "IPG Backend API"
    debug: bool = False

    # Supabase
    supabase_url: str
    supabase_anon_key: str
    supabase_service_role_key: str | None = None

    # OpenAI
    openai_api_key: str

    # CORS - allowed origins for frontend
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        # Load from .env.local in project root (one level up from backend)
        env_file = str(Path(__file__).parent.parent.parent / ".env.local")
        env_file_encoding = "utf-8"

        # Map NEXT_PUBLIC_ prefixed vars to our settings
        @classmethod
        def customise_sources(cls, init_settings, env_settings, file_secret_settings):
            return (init_settings, env_settings, file_secret_settings)


# Custom environment variable parsing to handle NEXT_PUBLIC_ prefix
def get_settings() -> Settings:
    """Get settings with support for NEXT_PUBLIC_ prefixed env vars."""
    from dotenv import load_dotenv

    # Load .env.local from project root
    env_path = Path(__file__).parent.parent.parent / ".env.local"
    load_dotenv(env_path)

    return Settings(
        supabase_url=os.getenv("NEXT_PUBLIC_SUPABASE_URL", ""),
        supabase_anon_key=os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""),
        supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
        openai_api_key=os.getenv("OPENAI_API_KEY", ""),
        debug=os.getenv("DEBUG", "false").lower() == "true",
    )


@lru_cache()
def get_cached_settings() -> Settings:
    """Cached settings for dependency injection."""
    return get_settings()
