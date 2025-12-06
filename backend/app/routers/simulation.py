from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from supabase import Client
from typing import Optional

from app.database import get_db
from app.services.simulation_service import SimulationService

router = APIRouter()


class SimulateRequest(BaseModel):
    """Request body for starting a simulation."""
    campaign_id: str
    batch_size: int = 10


class SimulationStatusResponse(BaseModel):
    """Response for simulation status."""
    campaign_id: str
    total: int
    completed: int
    in_progress: int
    failed: int
    pending: int


@router.post("/start")
async def start_simulation(
    request: SimulateRequest,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_db),
):
    """Start a conversation simulation for a campaign."""
    service = SimulationService(db)

    # Validate campaign exists
    campaign = service.get_campaign(request.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")

    # Get interviews for the campaign's workspace
    interviews = service.get_workspace_interviews(campaign["workspace_id"])
    if not interviews:
        raise HTTPException(status_code=400, detail="No interviews found in workspace")

    # Start simulation in background
    background_tasks.add_task(
        service.run_simulation,
        campaign_id=request.campaign_id,
        interviews=interviews,
        campaign=campaign,
        batch_size=request.batch_size,
    )

    return {
        "message": "Simulation started",
        "campaign_id": request.campaign_id,
        "total_interviews": len(interviews),
    }


@router.get("/status/{campaign_id}")
async def get_simulation_status(
    campaign_id: str,
    db: Client = Depends(get_db),
) -> SimulationStatusResponse:
    """Get the current status of a simulation."""
    service = SimulationService(db)
    status = service.get_simulation_status(campaign_id)

    return SimulationStatusResponse(
        campaign_id=campaign_id,
        **status,
    )


@router.delete("/conversations/{campaign_id}")
async def delete_conversations(
    campaign_id: str,
    conversation_ids: Optional[list[str]] = None,
    db: Client = Depends(get_db),
):
    """Delete conversations for a campaign."""
    service = SimulationService(db)

    if conversation_ids:
        deleted = service.delete_conversations(conversation_ids)
    else:
        deleted = service.delete_all_campaign_conversations(campaign_id)

    return {"deleted": deleted}
