from fastapi import APIRouter, Depends
from supabase import Client

from app.database import get_db
from app.config import get_settings
from app.memgraph import health_check as memgraph_health_check
from app.qdrant import health_check as qdrant_health_check

router = APIRouter()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    return {"status": "healthy"}


@router.get("/health/detailed")
async def detailed_health_check(db: Client = Depends(get_db)):
    """Detailed health check including database connectivity."""
    settings = get_settings()

    # Test Supabase connection
    supabase_status = "healthy"
    try:
        db.table("workspaces").select("id").limit(1).execute()
    except Exception as e:
        supabase_status = f"unhealthy: {str(e)}"

    # Test Memgraph connection
    memgraph_status = memgraph_health_check()

    # Test Qdrant connection
    qdrant_status = qdrant_health_check()

    # Determine overall status
    is_healthy = (
        supabase_status == "healthy"
        and memgraph_status.get("status") == "connected"
        and qdrant_status.get("status") == "connected"
    )

    return {
        "status": "healthy" if is_healthy else "degraded",
        "app_name": settings.app_name,
        "supabase": supabase_status,
        "memgraph": memgraph_status,
        "qdrant": qdrant_status,
        "openai_configured": bool(settings.openai_api_key),
    }


@router.get("/health/memgraph")
async def memgraph_health():
    """Memgraph-specific health check with detailed info."""
    return memgraph_health_check()


@router.get("/health/qdrant")
async def qdrant_health():
    """Qdrant-specific health check with detailed info."""
    return qdrant_health_check()
