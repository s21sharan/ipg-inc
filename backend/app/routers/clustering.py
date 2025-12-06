from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from supabase import Client
from typing import Optional

from app.database import get_db
from app.services.clustering_service import ClusteringService

router = APIRouter()


class ClusterRequest(BaseModel):
    """Request body for starting clustering."""
    campaign_id: str
    num_clusters: int = 4


class ClusterResponse(BaseModel):
    """Response for a single cluster."""
    id: str
    title: str
    summary: str
    quotes: list[str]
    matched_users: int
    prevalence: str
    confidence: float
    members: list[dict]


class ClusteringStatusResponse(BaseModel):
    """Response for clustering status."""
    status: str  # 'none', 'processing', 'completed'
    dimension: str | None
    dimension_rationale: str | None
    conversations_analyzed: int | None
    clusters: list[ClusterResponse] | None


@router.post("/start")
async def start_clustering(
    request: ClusterRequest,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_db),
):
    """Start clustering for a campaign's conversations."""
    service = ClusteringService(db)

    # Get completed conversations
    conversations = service.get_completed_conversations(request.campaign_id)
    if not conversations:
        raise HTTPException(status_code=400, detail="No completed conversations to cluster")

    # Create clustering record
    cluster_id = service.create_clustering_record(request.campaign_id)

    # Start clustering in background
    background_tasks.add_task(
        service.run_clustering,
        cluster_id=cluster_id,
        campaign_id=request.campaign_id,
        conversations=conversations,
        num_clusters=request.num_clusters,
    )

    return {
        "message": "Clustering started",
        "cluster_id": cluster_id,
        "total_conversations": len(conversations),
    }


@router.get("/latest/{campaign_id}")
async def get_latest_clusters(
    campaign_id: str,
    db: Client = Depends(get_db),
) -> ClusteringStatusResponse:
    """Get the latest clustering results for a campaign."""
    service = ClusteringService(db)
    result = service.get_latest_clusters(campaign_id)

    return ClusteringStatusResponse(**result)


@router.get("/{cluster_id}")
async def get_cluster_details(
    cluster_id: str,
    db: Client = Depends(get_db),
):
    """Get details for a specific clustering run."""
    service = ClusteringService(db)
    details = service.get_cluster_details(cluster_id)

    if not details:
        raise HTTPException(status_code=404, detail="Clustering not found")

    return details
