"""
Judge/Critic state definitions for consensus building.

Defines the TypedDict structures used by the MetaGPT-style critic system
that evaluates completed swarms and produces structured consensus summaries.

Reference: HACN Architecture - Tier 3 (Critic/Judge Evaluation)
"""

from typing import TypedDict, Literal


class InsightQuote(TypedDict):
    """
    A quote supporting an insight from a specific agent.
    """
    agent_id: str
    agent_name: str
    quote: str  # Direct quote from agent's message
    turn_number: int


class KeyInsight(TypedDict):
    """
    A key insight extracted from the swarm discussion.

    Represents a significant point raised during the conversation
    with supporting evidence from participating agents.
    """
    insight: str  # The synthesized insight
    supporting_agents: list[str]  # Agent names who supported this
    quotes: list[InsightQuote]  # Supporting quotes
    confidence: float  # 0.0 to 1.0


class AgreementPoint(TypedDict):
    """
    An area where agents reached agreement.
    """
    point: str  # The agreed-upon statement
    agreement_level: Literal["strong", "moderate", "weak"]
    supporting_agents: list[str]  # Agent names who agreed
    dissenting_agents: list[str]  # Agent names who disagreed (if any)


class DisagreementPoint(TypedDict):
    """
    An area where agents disagreed.

    Captures different positions held by agents on a topic.
    """
    point: str  # The topic of disagreement
    positions: list[dict]  # [{position: str, agents: list[str]}]


class ParticipationMetrics(TypedDict):
    """
    Metrics about agent participation in the swarm.
    """
    total_messages: int
    per_agent: dict  # {agent_id: message_count}
    balance_score: float  # 0.0 to 1.0 (1.0 = perfectly balanced)
    dominant_speaker: str | None  # Agent ID if one dominated
    quiet_agents: list[str]  # Agent IDs with below-average participation


class QualityMetrics(TypedDict):
    """
    Quality assessment metrics from the critic.
    """
    overall_score: float  # 0.0 to 10.0
    coherence_score: float  # How well conversation flowed
    depth_score: float  # How deeply topics were explored
    relevance_score: float  # How on-topic agents stayed
    engagement_score: float  # How engaged agents appeared


class CriticEvaluation(TypedDict):
    """
    Full evaluation from the critic agent.

    The critic analyzes the completed swarm to assess quality
    and flag any issues before consensus building.
    """
    swarm_id: str
    quality: QualityMetrics
    participation: ParticipationMetrics
    flags: list[str]  # Issues or warnings (e.g., "low participation", "off-topic")
    recommendations: list[str]  # Suggestions for improvement
    proceed_to_consensus: bool  # Should we build consensus?


class ConsensusSummary(TypedDict):
    """
    The final structured consensus summary from a swarm discussion.

    This is the primary output of the HACN system, providing
    a synthesized view of multi-agent dialogue for downstream use.
    """
    # Identification
    swarm_id: str
    topic: str

    # Participants
    participants: list[dict]  # [{agent_id, agent_name, role}]

    # Insights
    key_insights: list[KeyInsight]

    # Agreement analysis
    areas_of_agreement: list[AgreementPoint]
    areas_of_disagreement: list[DisagreementPoint]

    # Synthesis
    synthesized_conclusion: str  # Final summary statement
    actionable_items: list[str]  # Concrete next steps or recommendations

    # Quality indicators
    confidence_score: float  # 0.0 to 1.0
    consensus_strength: Literal["strong", "moderate", "weak", "none"]

    # Metadata
    generated_at: str  # ISO timestamp
    model_used: str  # Which model generated this


class ConsensusInput(TypedDict):
    """
    Input for consensus building.

    Contains the completed swarm output and critic evaluation.
    """
    swarm_id: str
    topic: str
    messages: list[dict]  # SwarmMessage objects
    participants: list[dict]  # Agent info
    critic_evaluation: CriticEvaluation


class JudgeState(TypedDict):
    """
    State object for the judge/critic workflow.

    Tracks the evaluation and consensus building process.
    """
    swarm_id: str

    # Input data
    swarm_output: dict  # SwarmOutput
    messages: list[dict]  # All swarm messages

    # Processing stages
    evaluation_complete: bool
    critic_evaluation: CriticEvaluation | None

    consensus_complete: bool
    consensus_summary: ConsensusSummary | None

    # Error tracking
    error: str | None
    status: Literal["pending", "evaluating", "building_consensus", "complete", "failed"]
