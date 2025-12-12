"""
Pydantic models for swarm API request/response validation.

These models provide runtime validation and serialization for
the swarm orchestration system's HTTP endpoints.
"""

from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime


# =============================================================================
# Request Models
# =============================================================================


class SwarmConfigRequest(BaseModel):
    """Configuration options for creating a swarm."""
    max_turns: int = Field(default=20, ge=5, le=100, description="Maximum dialogue turns")
    speaker_selection: Literal["round_robin", "dynamic", "random"] = Field(
        default="dynamic",
        description="Strategy for selecting next speaker"
    )
    min_messages_per_agent: int = Field(default=2, ge=1, le=10)
    allow_early_termination: bool = Field(default=True)


class CreateSwarmRequest(BaseModel):
    """Request body for creating a new swarm session."""
    topic: str = Field(..., min_length=10, max_length=1000, description="Discussion topic")
    agent_ids: list[str] = Field(
        ...,
        min_length=2,
        max_length=10,
        description="List of agent IDs (interview_ids) to participate"
    )
    config: SwarmConfigRequest | None = Field(default=None)


class StopSwarmRequest(BaseModel):
    """Request body for stopping a swarm."""
    reason: str = Field(default="manual_stop", max_length=500)


# =============================================================================
# Response Models
# =============================================================================


class SwarmParticipant(BaseModel):
    """Information about a swarm participant."""
    agent_id: str
    agent_name: str
    message_count: int = 0
    last_spoke_turn: int = -1


class SwarmMessageResponse(BaseModel):
    """A single message in the swarm conversation."""
    id: str
    turn_number: int
    speaker_id: str
    speaker_name: str
    content: str
    timestamp: str
    message_type: Literal["dialogue", "proposal", "agreement", "disagreement", "question"]


class SwarmStatusResponse(BaseModel):
    """Response for swarm status queries."""
    swarm_id: str
    topic: str
    status: Literal["initializing", "active", "completed", "terminated", "error"]
    participants: list[SwarmParticipant]
    turn_count: int
    max_turns: int
    created_at: str
    updated_at: str
    completed_at: str | None = None
    termination_reason: str | None = None


class SwarmMessagesResponse(BaseModel):
    """Paginated response for swarm messages."""
    swarm_id: str
    messages: list[SwarmMessageResponse]
    total_count: int
    page: int
    page_size: int
    has_more: bool


class SwarmCreateResponse(BaseModel):
    """Response from creating a new swarm."""
    swarm_id: str
    topic: str
    status: str
    participant_count: int
    message: str


# =============================================================================
# Consensus Response Models
# =============================================================================


class InsightQuoteResponse(BaseModel):
    """A quote supporting an insight."""
    agent_id: str
    agent_name: str
    quote: str
    turn_number: int


class KeyInsightResponse(BaseModel):
    """A key insight from the discussion."""
    insight: str
    supporting_agents: list[str]
    quotes: list[InsightQuoteResponse]
    confidence: float = Field(ge=0.0, le=1.0)


class AgreementPointResponse(BaseModel):
    """An area of agreement."""
    point: str
    agreement_level: Literal["strong", "moderate", "weak"]
    supporting_agents: list[str]
    dissenting_agents: list[str] = []


class DisagreementPointResponse(BaseModel):
    """An area of disagreement."""
    point: str
    positions: list[dict]  # [{position: str, agents: list[str]}]


class QualityMetricsResponse(BaseModel):
    """Quality metrics from critic evaluation."""
    overall_score: float = Field(ge=0.0, le=10.0)
    coherence_score: float = Field(ge=0.0, le=10.0)
    depth_score: float = Field(ge=0.0, le=10.0)
    relevance_score: float = Field(ge=0.0, le=10.0)
    engagement_score: float = Field(ge=0.0, le=10.0)


class ConsensusSummaryResponse(BaseModel):
    """The full consensus summary for a swarm."""
    swarm_id: str
    topic: str
    participants: list[SwarmParticipant]

    key_insights: list[KeyInsightResponse]
    areas_of_agreement: list[AgreementPointResponse]
    areas_of_disagreement: list[DisagreementPointResponse]

    synthesized_conclusion: str
    actionable_items: list[str] = []

    confidence_score: float = Field(ge=0.0, le=1.0)
    consensus_strength: Literal["strong", "moderate", "weak", "none"]

    quality_metrics: QualityMetricsResponse | None = None
    generated_at: str


# =============================================================================
# WebSocket Models
# =============================================================================


class SwarmWSMessage(BaseModel):
    """WebSocket message format for real-time updates."""
    event_type: Literal["message", "speaker_change", "status_change", "error", "complete"]
    swarm_id: str
    data: dict  # Event-specific data
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
