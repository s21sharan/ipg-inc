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

    # Memgraph - Graph Database
    # Local: bolt://localhost:7687, AWS: bolt://<your-instance>:7687
    memgraph_host: str = "localhost"
    memgraph_port: int = 7687
    memgraph_username: str = ""
    memgraph_password: str = ""
    memgraph_encrypted: bool = False  # Set True for AWS with SSL

    # Qdrant - Vector Database
    # Local: localhost:6333, Cloud: https://<cluster>.cloud.qdrant.io
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_grpc_port: int = 6334
    qdrant_api_key: str | None = None  # Required for Qdrant Cloud
    qdrant_https: bool = False  # Set True for Qdrant Cloud

    # CORS - allowed origins for frontend
    cors_origins: list[str] = ["http://localhost:3000"]

    class Config:
        # Load from .env.local in project root (one level up from backend)
        env_file = str(Path(__file__).parent.parent.parent / ".env.local")
        env_file_encoding = "utf-8"
        extra = "ignore"  # Ignore extra env vars not defined in Settings

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
        # Memgraph settings
        memgraph_host=os.getenv("MEMGRAPH_HOST", "localhost"),
        memgraph_port=int(os.getenv("MEMGRAPH_PORT", "7687")),
        memgraph_username=os.getenv("MEMGRAPH_USERNAME", ""),
        memgraph_password=os.getenv("MEMGRAPH_PASSWORD", ""),
        memgraph_encrypted=os.getenv("MEMGRAPH_ENCRYPTED", "false").lower() == "true",
        # Qdrant settings
        qdrant_host=os.getenv("QDRANT_HOST", "localhost"),
        qdrant_port=int(os.getenv("QDRANT_PORT", "6333")),
        qdrant_grpc_port=int(os.getenv("QDRANT_GRPC_PORT", "6334")),
        qdrant_api_key=os.getenv("QDRANT_API_KEY"),
        qdrant_https=os.getenv("QDRANT_HTTPS", "false").lower() == "true",
    )


@lru_cache()
def get_cached_settings() -> Settings:
    """Cached settings for dependency injection."""
    return get_settings()
