from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from supabase import Client
from typing import Optional

from app.database import get_db
from app.services.analysis_service import AnalysisService

router = APIRouter()


class AnalyzeRequest(BaseModel):
    """Request body for starting analysis."""
    campaign_id: str
    batch_size: int = 50  # Conversations per batch


class AnalysisStatusResponse(BaseModel):
    """Response for analysis status."""
    analysis_id: str | None
    status: str  # 'none', 'processing', 'completed', 'failed'
    version: int | None
    total_batches: int | None
    completed_batches: int | None
    report_markdown: str | None


@router.post("/start")
async def start_analysis(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks,
    db: Client = Depends(get_db),
):
    """Start analysis for a campaign's conversations."""
    service = AnalysisService(db)

    # Get completed conversations
    conversations = service.get_completed_conversations(request.campaign_id)
    if not conversations:
        raise HTTPException(status_code=400, detail="No completed conversations to analyze")

    # Create analysis record
    analysis_id = service.create_analysis_record(request.campaign_id)

    # Start analysis in background
    background_tasks.add_task(
        service.run_analysis,
        analysis_id=analysis_id,
        campaign_id=request.campaign_id,
        conversations=conversations,
        batch_size=request.batch_size,
    )

    return {
        "message": "Analysis started",
        "analysis_id": analysis_id,
        "total_conversations": len(conversations),
    }


@router.get("/status/{campaign_id}")
async def get_analysis_status(
    campaign_id: str,
    db: Client = Depends(get_db),
) -> AnalysisStatusResponse:
    """Get the latest analysis status for a campaign."""
    service = AnalysisService(db)
    status = service.get_latest_analysis_status(campaign_id)

    return AnalysisStatusResponse(**status)


@router.get("/{analysis_id}")
async def get_analysis(
    analysis_id: str,
    db: Client = Depends(get_db),
):
    """Get a specific analysis by ID."""
    service = AnalysisService(db)
    analysis = service.get_analysis(analysis_id)

    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return analysis


@router.get("/history/{campaign_id}")
async def get_analysis_history(
    campaign_id: str,
    db: Client = Depends(get_db),
):
    """Get all analyses for a campaign."""
    service = AnalysisService(db)
    analyses = service.get_analysis_history(campaign_id)

    return {"analyses": analyses}
