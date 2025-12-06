from fastapi import APIRouter, Depends
from supabase import Client

from app.database import get_db
from app.config import get_settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy"}


@router.get("/health/detailed")
async def detailed_health_check(db: Client = Depends(get_db)):
    """Detailed health check including database connectivity."""
    settings = get_settings()

    # Test database connection
    db_status = "healthy"
    try:
        # Simple query to test connection
        db.table("workspaces").select("id").limit(1).execute()
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    return {
        "status": "healthy" if db_status == "healthy" else "degraded",
        "app_name": settings.app_name,
        "database": db_status,
        "openai_configured": bool(settings.openai_api_key),
    }
