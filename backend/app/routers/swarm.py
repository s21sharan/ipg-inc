"""
Swarm API Router for multi-agent discussion endpoints.

Provides REST API endpoints for:
- Creating and managing swarm sessions
- Retrieving messages and status
- Getting consensus summaries
- WebSocket streaming (future)

Reference: HACN Architecture - API Layer
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import Client
from typing import Any

from app.database import get_db
from app.services.swarm_service import SwarmService


router = APIRouter()


# ============================================================================
# Request/Response Models
# ============================================================================


class CreateSwarmRequest(BaseModel):
    """Request body for creating a new swarm."""

    topic: str = Field(..., description="Discussion topic for the swarm")
    agent_ids: list[str] = Field(..., description="List of interview IDs to include as agents")
    config: dict[str, Any] | None = Field(
        default=None,
        description="Optional configuration overrides (max_turns, speaker_selection, etc.)",
    )


class SwarmCreateResponse(BaseModel):
    """Response for successful swarm creation."""

    swarm_id: str
    status: str
    topic: str
    participant_count: int


class SwarmStatusResponse(BaseModel):
    """Response for swarm status."""

    id: str
    topic: str
    status: str
    message_count: int
    config: dict[str, Any]
    created_at: str
    completed_at: str | None = None


class SwarmMessagesResponse(BaseModel):
    """Response containing swarm messages."""

    swarm_id: str
    messages: list[dict[str, Any]]
    total: int


class SwarmParticipantsResponse(BaseModel):
    """Response containing swarm participants."""

    swarm_id: str
    participants: list[dict[str, Any]]


class StopSwarmResponse(BaseModel):
    """Response for stopping a swarm."""

    success: bool
    swarm_id: str


# ============================================================================
# Endpoints
# ============================================================================


@router.post("/create", response_model=SwarmCreateResponse)
async def create_swarm(
    request: CreateSwarmRequest,
    db: Client = Depends(get_db),
):
    """
    Create and start a new swarm discussion.

    Starts a multi-agent conversation on the specified topic with
    the selected agents. The swarm runs in the background and
    messages can be retrieved via the messages endpoint.

    Args:
        request: Swarm creation parameters

    Returns:
        Created swarm details including ID and status
    """
    service = SwarmService(db)

    try:
        result = service.create_swarm(
            topic=request.topic,
            agent_ids=request.agent_ids,
            config=request.config,
        )
        return SwarmCreateResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/status/{swarm_id}", response_model=SwarmStatusResponse)
async def get_swarm_status(
    swarm_id: str,
    db: Client = Depends(get_db),
):
    """
    Get the current status of a swarm session.

    Returns swarm metadata including topic, status, message count,
    and timing information.

    Args:
        swarm_id: ID of the swarm to query

    Returns:
        Current swarm status
    """
    service = SwarmService(db)
    result = service.get_swarm_status(swarm_id)

    if not result:
        raise HTTPException(status_code=404, detail="Swarm not found")

    return SwarmStatusResponse(**result)


@router.get("/messages/{swarm_id}", response_model=SwarmMessagesResponse)
async def get_swarm_messages(
    swarm_id: str,
    offset: int = Query(default=0, ge=0, description="Number of messages to skip"),
    limit: int = Query(default=50, ge=1, le=200, description="Maximum messages to return"),
    db: Client = Depends(get_db),
):
    """
    Get messages from a swarm session with pagination.

    Messages are ordered by turn number (ascending).

    Args:
        swarm_id: ID of the swarm
        offset: Number of messages to skip (default: 0)
        limit: Maximum messages to return (default: 50, max: 200)

    Returns:
        List of messages with metadata
    """
    service = SwarmService(db)
    messages = service.get_messages(swarm_id, offset=offset, limit=limit)

    return SwarmMessagesResponse(
        swarm_id=swarm_id,
        messages=messages,
        total=len(messages),
    )


@router.get("/participants/{swarm_id}", response_model=SwarmParticipantsResponse)
async def get_swarm_participants(
    swarm_id: str,
    db: Client = Depends(get_db),
):
    """
    Get participants in a swarm session.

    Returns agent details for all participants in the swarm.

    Args:
        swarm_id: ID of the swarm

    Returns:
        List of participant details
    """
    service = SwarmService(db)
    participants = service.get_participants(swarm_id)

    return SwarmParticipantsResponse(
        swarm_id=swarm_id,
        participants=participants,
    )


@router.get("/consensus/{swarm_id}")
async def get_swarm_consensus(
    swarm_id: str,
    db: Client = Depends(get_db),
):
    """
    Get the consensus summary for a completed swarm.

    Only available after a swarm has completed and the consensus
    has been generated by the critic/builder pipeline.

    Args:
        swarm_id: ID of the swarm

    Returns:
        Consensus summary including insights, agreements, and conclusions
    """
    service = SwarmService(db)
    result = service.get_consensus(swarm_id)

    if not result:
        raise HTTPException(
            status_code=404,
            detail="Consensus not found. Swarm may still be in progress or consensus generation failed.",
        )

    return result


@router.post("/{swarm_id}/stop", response_model=StopSwarmResponse)
async def stop_swarm(
    swarm_id: str,
    db: Client = Depends(get_db),
):
    """
    Manually stop an active swarm session.

    Terminates the swarm and marks it as terminated. Cannot stop
    swarms that are already completed or terminated.

    Args:
        swarm_id: ID of the swarm to stop

    Returns:
        Success status
    """
    service = SwarmService(db)
    success = service.stop_swarm(swarm_id)

    if not success:
        raise HTTPException(
            status_code=404,
            detail="Swarm not found or already completed",
        )

    return StopSwarmResponse(success=True, swarm_id=swarm_id)
