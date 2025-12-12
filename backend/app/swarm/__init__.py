"""
Swarm module for multi-agent dialogue orchestration.

Implements AutoGen-style swarm conversations where multiple agents
engage in free-form dialogue on a given topic with isolated memories.

Components:
- swarm_state: TypedDict state definitions
- swarm_agent: Individual agent wrapper with isolated memory
- speaker_selection: Dynamic speaker selection strategies
- termination: Conversation termination conditions
- swarm_orchestrator: Main orchestration loop
"""

from .swarm_state import (
    SwarmMessage,
    SwarmAgentContext,
    SwarmConfig,
    SwarmState,
    SwarmInput,
    SwarmOutput,
    DEFAULT_SWARM_CONFIG,
)
from .swarm_agent import SwarmAgent, create_swarm_agent_from_interview
from .speaker_selection import (
    SpeakerSelector,
    create_speaker_selector,
    SelectionStrategy,
)
from .termination import (
    TerminationChecker,
    TerminationReason,
    check_should_terminate,
    has_reached_max_turns,
    has_reached_min_participation,
    contains_consensus_keywords,
)
from .swarm_orchestrator import (
    SwarmOrchestrator,
    create_swarm_orchestrator,
    run_swarm_from_input,
)

__all__ = [
    # State types
    "SwarmMessage",
    "SwarmAgentContext",
    "SwarmConfig",
    "SwarmState",
    "SwarmInput",
    "SwarmOutput",
    "DEFAULT_SWARM_CONFIG",
    # Agent
    "SwarmAgent",
    "create_swarm_agent_from_interview",
    # Speaker selection
    "SpeakerSelector",
    "create_speaker_selector",
    "SelectionStrategy",
    # Termination
    "TerminationChecker",
    "TerminationReason",
    "check_should_terminate",
    "has_reached_max_turns",
    "has_reached_min_participation",
    "contains_consensus_keywords",
    # Orchestrator
    "SwarmOrchestrator",
    "create_swarm_orchestrator",
    "run_swarm_from_input",
]
