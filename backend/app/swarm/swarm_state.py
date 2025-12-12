"""
Swarm state definitions for multi-agent dialogue orchestration.

Defines the TypedDict structures used by the AutoGen-style swarm system,
including message objects, agent context, and overall swarm state.

Reference: HACN Architecture - Tier 1 (Local Interaction Clusters)
"""

from typing import TypedDict, Literal

from ..orchestration.agent_state import (
    PersonalityProfile,
    EmotionalState,
    ReflectionMemory,
    MemoryObject,
)


class SwarmMessage(TypedDict):
    """
    A single message in the swarm conversation.

    Messages are exchanged between agents during free-form dialogue.
    Each message is typed to indicate its role in the conversation.
    """
    id: str
    turn_number: int
    speaker_id: str
    speaker_name: str
    content: str
    timestamp: str  # ISO format timestamp
    message_type: Literal["dialogue", "proposal", "agreement", "disagreement", "question"]


class SwarmAgentContext(TypedDict):
    """
    Context for a single agent participating in the swarm.

    Contains all the information needed for an agent to generate
    contextually appropriate responses based on their isolated memories.
    """
    agent_id: str
    agent_name: str
    interview_id: str  # Links to original interview data

    # Demographics (age, gender, occupation, etc.)
    demographics: dict

    # Personality (from interview data)
    personality: PersonalityProfile
    emotional_state: EmotionalState
    reflection_memory: ReflectionMemory

    # Isolated memory (loaded from Qdrant, filtered by agent_id)
    memories: list[MemoryObject]

    # Participation tracking
    message_count: int  # Number of messages sent
    last_spoke_turn: int  # Turn number when agent last spoke


class SwarmConfig(TypedDict):
    """
    Configuration options for a swarm session.
    """
    max_turns: int  # Maximum dialogue turns before termination
    speaker_selection: Literal["round_robin", "dynamic", "random"]
    min_messages_per_agent: int  # Minimum participation requirement
    allow_early_termination: bool  # Can agents signal consensus?
    termination_keywords: list[str]  # Words that trigger consensus check


class SwarmState(TypedDict):
    """
    Complete state for a multi-agent swarm dialogue.

    This is the main state object passed through the swarm orchestration loop.
    Tracks all agents, messages, and progress toward termination.
    """
    # Swarm identity
    swarm_id: str
    topic: str  # The discussion topic/question

    # Participant agents
    agents: list[SwarmAgentContext]

    # Conversation history
    messages: list[SwarmMessage]

    # Turn management
    current_speaker_id: str  # Agent ID of current/next speaker
    turn_count: int  # Current turn number

    # Configuration
    config: SwarmConfig

    # Status tracking
    status: Literal["initializing", "active", "completed", "terminated", "error"]
    termination_reason: str | None  # Why the swarm ended

    # Timestamps
    created_at: str  # ISO format
    updated_at: str  # ISO format
    completed_at: str | None  # ISO format, set when done


class SwarmInput(TypedDict):
    """
    Input structure for starting a new swarm session.
    """
    topic: str  # The discussion topic/question
    agent_ids: list[str]  # List of agent IDs (interview_ids) to include
    config: SwarmConfig | None  # Optional config overrides


class SwarmOutput(TypedDict):
    """
    Output structure from a completed swarm session.

    Contains the full conversation and metadata for consensus building.
    """
    swarm_id: str
    topic: str
    participants: list[dict]  # [{agent_id, agent_name, message_count}]
    messages: list[SwarmMessage]
    total_turns: int
    status: Literal["completed", "terminated", "error"]
    termination_reason: str | None
    duration_seconds: float


# Default configuration values
DEFAULT_SWARM_CONFIG: SwarmConfig = {
    "max_turns": 20,
    "speaker_selection": "dynamic",
    "min_messages_per_agent": 2,
    "allow_early_termination": True,
    "termination_keywords": ["agree", "consensus", "conclude", "summary"],
}
