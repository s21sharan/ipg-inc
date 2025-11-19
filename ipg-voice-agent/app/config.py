"""
Configuration module for the voice interview agent.
Reads environment variables and provides validated configuration.
"""

import os
from typing import Optional
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class OpenAIConfig(BaseModel):
    """OpenAI API configuration"""
    api_key: str = Field(..., min_length=1)
    model_name: str = Field(default="gpt-4o-mini")

    @validator('api_key')
    def validate_api_key(cls, v):
        if not v or v == "your_openai_api_key_here":
            raise ValueError("Valid OpenAI API key required")
        return v


class DeepgramConfig(BaseModel):
    """Deepgram STT configuration"""
    api_key: str = Field(..., min_length=1)
    language: str = Field(default="en-US")
    model: str = Field(default="nova-2")
    punctuate: bool = Field(default=True)
    interim_results: bool = Field(default=True)
    endpointing: int = Field(default=300)  # milliseconds

    @validator('api_key')
    def validate_api_key(cls, v):
        if not v or v == "your_deepgram_api_key_here":
            raise ValueError("Valid Deepgram API key required")
        return v


class CartesiaConfig(BaseModel):
    """Cartesia TTS configuration"""
    api_key: str = Field(..., min_length=1)
    voice_id: str = Field(default="95856005-0332-41b0-935f-352e296aa0df")
    model: str = Field(default="sonic-english")
    language: str = Field(default="en")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    emotion: Optional[str] = Field(default=None)

    @validator('api_key')
    def validate_api_key(cls, v):
        if not v or v == "your_cartesia_api_key_here":
            raise ValueError("Valid Cartesia API key required")
        return v


class DailyConfig(BaseModel):
    """Daily.co WebRTC configuration"""
    api_key: str = Field(..., min_length=1)
    domain: str = Field(..., min_length=1)
    max_duration_minutes: int = Field(default=60)
    enable_recording: bool = Field(default=False)
    enable_video: bool = Field(default=True)

    @validator('api_key')
    def validate_api_key(cls, v):
        if not v or v == "your_daily_api_key_here":
            raise ValueError("Valid Daily API key required")
        return v

    @validator('domain')
    def validate_domain(cls, v):
        if not v.startswith('https://'):
            v = f'https://{v}'
        return v.rstrip('/')


class SupabaseConfig(BaseModel):
    """Supabase database configuration"""
    url: str = Field(..., min_length=1)
    anon_key: str = Field(..., min_length=1)
    service_key: Optional[str] = Field(default=None)

    @validator('url')
    def validate_url(cls, v):
        if not v or v == "your_supabase_url_here":
            raise ValueError("Valid Supabase URL required")
        if not v.startswith('https://'):
            raise ValueError("Supabase URL must start with https://")
        return v.rstrip('/')

    @validator('anon_key')
    def validate_anon_key(cls, v):
        if not v or v == "your_supabase_anon_key_here":
            raise ValueError("Valid Supabase anon key required")
        return v


class ServerConfig(BaseModel):
    """Server configuration"""
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8001, ge=1, le=65535)
    log_level: str = Field(default="INFO")
    cors_origins: list[str] = Field(default=["http://localhost:3000", "http://localhost:3001"])
    session_max_duration_minutes: int = Field(default=60)
    session_cleanup_interval_minutes: int = Field(default=30)


class AWSConfig(BaseModel):
    """Optional AWS S3 configuration for audio storage"""
    access_key_id: Optional[str] = Field(default=None)
    secret_access_key: Optional[str] = Field(default=None)
    s3_bucket: Optional[str] = Field(default=None)
    region: str = Field(default="us-west-2")

    @property
    def is_configured(self) -> bool:
        """Check if AWS S3 is properly configured"""
        return bool(
            self.access_key_id and
            self.secret_access_key and
            self.s3_bucket and
            self.access_key_id != "your_aws_access_key_here"
        )


class Settings(BaseModel):
    """Main settings container"""
    openai: OpenAIConfig
    deepgram: DeepgramConfig
    cartesia: CartesiaConfig
    daily: DailyConfig
    supabase: SupabaseConfig
    server: ServerConfig
    aws: AWSConfig

    # Pipecat settings
    pipecat_log_level: str = Field(default="INFO")

    class Config:
        validate_assignment = True


def load_settings() -> Settings:
    """Load and validate settings from environment variables"""
    try:
        settings = Settings(
            openai=OpenAIConfig(
                api_key=os.getenv("OPENAI_API_KEY", ""),
                model_name=os.getenv("OPENAI_MODEL_NAME", "gpt-4o-mini")
            ),
            deepgram=DeepgramConfig(
                api_key=os.getenv("DEEPGRAM_API_KEY", ""),
            ),
            cartesia=CartesiaConfig(
                api_key=os.getenv("CARTESIA_API_KEY", ""),
                voice_id=os.getenv("CARTESIA_VOICE_ID", "95856005-0332-41b0-935f-352e296aa0df")
            ),
            daily=DailyConfig(
                api_key=os.getenv("DAILY_API_KEY", ""),
                domain=os.getenv("DAILY_DOMAIN", "")
            ),
            supabase=SupabaseConfig(
                url=os.getenv("SUPABASE_URL", ""),
                anon_key=os.getenv("SUPABASE_ANON_KEY", ""),
                service_key=os.getenv("SUPABASE_SERVICE_KEY")
            ),
            server=ServerConfig(
                host=os.getenv("SERVER_HOST", "0.0.0.0"),
                port=int(os.getenv("SERVER_PORT", "8001")),
                log_level=os.getenv("LOG_LEVEL", "INFO"),
                session_max_duration_minutes=int(os.getenv("SESSION_MAX_DURATION_MINUTES", "60")),
                session_cleanup_interval_minutes=int(os.getenv("SESSION_CLEANUP_INTERVAL_MINUTES", "30"))
            ),
            aws=AWSConfig(
                access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
                s3_bucket=os.getenv("AWS_S3_BUCKET"),
                region=os.getenv("AWS_REGION", "us-west-2")
            ),
            pipecat_log_level=os.getenv("PIPECAT_LOG_LEVEL", "INFO")
        )
        return settings
    except Exception as e:
        print(f"Error loading settings: {e}")
        print("Please ensure all required environment variables are set in your .env file")
        raise


# Global settings instance
settings = None

def get_settings() -> Settings:
    """Get or create the global settings instance"""
    global settings
    if settings is None:
        settings = load_settings()
    return settings