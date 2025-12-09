"""
Agent state definitions for LangGraph workflows.

Defines the TypedDict structures used by the generative agent cognitive
architecture, including Memory Stream objects, Big Five personality profiles,
emotional state tracking, and the main agent state.

Reference: SyntheticCohorts Framework Section 2 (Cognitive Architecture)
"""

from typing import TypedDict, Literal, Annotated
import operator


class MemoryObject(TypedDict):
    """
    A single memory entry in the agent's memory stream.

    Memory objects are temporally indexed observations stored in natural language.
    Each memory has scores for recency, importance, and relevance used in retrieval.

    Reference: Framework Section 2.1 (Memory Stream and Retrieval Function)
    """
    id: str
    content: str  # Natural language description of the memory
    timestamp: str  # ISO format timestamp
    importance: float  # Poignancy score 1-10 (pivotal moments score higher)
    memory_type: Literal["observation", "reflection", "action", "plan"]
    embedding: list[float] | None  # Vector embedding for semantic search


class PersonalityProfile(TypedDict):
    """
    Big Five (OCEAN) personality profile for the agent.

    Each dimension is scored 0-5 based on interview/reflection analysis.
    Used for Chain-of-Feeling conditioning and behavioral consistency.

    Reference: Framework Section 2.2.1 (Chain-of-Feeling Conditioning)
    """
    openness: float  # Curiosity vs. Caution (0-5)
    conscientiousness: float  # Organized vs. Careless (0-5)
    extraversion: float  # Outgoing vs. Solitary (0-5)
    agreeableness: float  # Compassionate vs. Critical (0-5)
    neuroticism: float  # Sensitive vs. Confident (0-5)


class EmotionalState(TypedDict):
    """
    Current emotional state vector for Chain-of-Feeling tracking.

    Tracks how interactions shift emotional state (e.g., Curiosity → Frustration).
    The agent articulates HOW an event makes them feel before deciding WHAT to do.

    Reference: Framework Section 2.2.1 (Chain-of-Feeling Conditioning)
    """
    primary_emotion: str  # e.g., "curiosity", "frustration", "contentment"
    intensity: float  # 0.0 to 1.0
    valence: float  # -1.0 (negative) to 1.0 (positive)
    arousal: float  # 0.0 (calm) to 1.0 (excited)
    narrative: str  # Natural language description of emotional journey


class ReflectionMemory(TypedDict):
    """
    Structured reflection memory extracted from original interviews.

    Contains synthesized beliefs, goals, and pain points that form
    the agent's core identity and behavioral drivers.
    """
    basic_facts: dict  # Demographics, occupation, context
    goals_and_aspirations: dict  # What the agent wants
    pain_points_and_frustrations: dict  # Current problems
    product_attitudes: dict  # Opinions about products/services
    communication_style: dict  # How the agent expresses themselves


class AgentState(TypedDict):
    """
    Complete agent state for LangGraph workflow.

    This is the main state object passed between nodes in the
    Plan → Act → Observe → Reflect cycle.

    Reference: Framework Section 2 (Cognitive Architecture)
    """
    # Agent identity
    agent_id: str
    agent_name: str

    # Personality and emotional state (Chain-of-Feeling)
    personality: PersonalityProfile
    emotional_state: EmotionalState
    reflection_memory: ReflectionMemory

    # Memory stream with retrieval scores
    memory_stream: Annotated[list[MemoryObject], operator.add]  # Append-only
    retrieved_memories: list[MemoryObject]  # Most relevant for current context

    # Current cognitive cycle state
    current_observation: str  # What the agent just perceived
    current_plan: str  # What the agent intends to do
    current_action: str  # The action the agent is taking
    action_result: str  # Outcome of the action

    # Reflection tracking
    importance_accumulator: float  # Sum of recent importance scores
    reflection_threshold: float  # Trigger reflection when accumulator exceeds
    last_reflection_time: str  # ISO timestamp of last reflection

    # Conversation context
    conversation_history: list[dict]  # Q&A pairs from current conversation
    campaign_context: dict  # Current campaign topics/questions

    # Workflow control
    iteration_count: int  # Current cycle number
    max_iterations: int  # Prevent infinite loops
    should_terminate: bool  # Flag to end the workflow


class WorkflowInput(TypedDict):
    """
    Input structure for starting an agent workflow.

    Used to initialize a new agent reasoning cycle with
    interview data and campaign context.
    """
    agent_id: str
    agent_name: str
    interview_data: dict  # Original interview with transcript, personality, etc.
    campaign: dict  # Campaign with topics and questions
    initial_observation: str  # The first stimulus (e.g., interviewer greeting)


class WorkflowOutput(TypedDict):
    """
    Output structure from completed agent workflow.

    Contains the final conversation transcript and
    updated agent state for persistence.
    """
    agent_id: str
    conversation_transcript: list[dict]  # Complete Q&A pairs
    final_emotional_state: EmotionalState
    new_memories: list[MemoryObject]  # Memories created during conversation
    new_reflections: list[MemoryObject]  # High-level insights generated
