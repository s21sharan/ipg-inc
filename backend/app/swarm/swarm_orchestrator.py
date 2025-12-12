"""
Swarm Orchestrator for multi-agent dialogue management.

Coordinates the swarm conversation loop:
1. Initialize swarm with agents
2. Select next speaker
3. Generate response
4. Update state
5. Check termination
6. Repeat or complete

Reference: HACN Architecture - Tier 1 (Local Interaction Clusters)
"""

from datetime import datetime, timezone
from typing import Callable, Awaitable
import uuid
import time

from .swarm_state import (
    SwarmState,
    SwarmMessage,
    SwarmAgentContext,
    SwarmConfig,
    SwarmInput,
    SwarmOutput,
    DEFAULT_SWARM_CONFIG,
)
from .swarm_agent import SwarmAgent
from .speaker_selection import SpeakerSelector, create_speaker_selector
from .termination import TerminationChecker, TerminationReason


# Type alias for message callback
MessageCallback = Callable[[SwarmMessage], None] | Callable[[SwarmMessage], Awaitable[None]]


class SwarmOrchestrator:
    """
    Orchestrates multi-agent swarm conversations.

    Manages the conversation loop, speaker selection, response generation,
    and termination logic for a group of agents discussing a topic.
    """

    def __init__(
        self,
        speaker_selector: SpeakerSelector | None = None,
        termination_checker: TerminationChecker | None = None,
    ):
        """
        Initialize the swarm orchestrator.

        Args:
            speaker_selector: Custom speaker selector (default: dynamic)
            termination_checker: Custom termination checker
        """
        self._speaker_selector = speaker_selector
        self._termination_checker = termination_checker or TerminationChecker()
        self._agents: dict[str, SwarmAgent] = {}
        self._start_time: float | None = None

    def initialize_swarm(
        self,
        topic: str,
        interviews: list[dict],
        config: SwarmConfig | None = None,
        load_memories: bool = True,
    ) -> SwarmState:
        """
        Initialize a new swarm with agents from interview data.

        Args:
            topic: Discussion topic
            interviews: List of interview data dicts
            config: Optional config overrides
            load_memories: Whether to load memories from Qdrant

        Returns:
            Initialized SwarmState
        """
        swarm_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self._start_time = time.time()

        # Merge config with defaults
        merged_config: SwarmConfig = {**DEFAULT_SWARM_CONFIG}
        if config:
            merged_config.update(config)

        # Initialize speaker selector with configured strategy
        if self._speaker_selector is None:
            self._speaker_selector = create_speaker_selector(
                merged_config["speaker_selection"]
            )

        # Create agents from interview data
        agents: list[SwarmAgentContext] = []
        self._agents = {}

        for interview in interviews:
            agent = SwarmAgent.from_interview_data(interview)

            # Load isolated memories if enabled
            if load_memories:
                try:
                    agent.load_memories(limit=50)
                except Exception as e:
                    print(f"Warning: Failed to load memories for {agent.agent_name}: {e}")

            self._agents[agent.agent_id] = agent
            agents.append(agent.to_context())

        # Create initial state
        state: SwarmState = {
            "swarm_id": swarm_id,
            "topic": topic,
            "agents": agents,
            "messages": [],
            "current_speaker_id": "",
            "turn_count": 0,
            "config": merged_config,
            "status": "active",
            "termination_reason": None,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
        }

        return state

    def initialize_from_agents(
        self,
        topic: str,
        agents: list[SwarmAgent],
        config: SwarmConfig | None = None,
    ) -> SwarmState:
        """
        Initialize a swarm from pre-created SwarmAgent instances.

        Useful when agents are already initialized elsewhere.

        Args:
            topic: Discussion topic
            agents: List of SwarmAgent instances
            config: Optional config overrides

        Returns:
            Initialized SwarmState
        """
        swarm_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        self._start_time = time.time()

        # Merge config with defaults
        merged_config: SwarmConfig = {**DEFAULT_SWARM_CONFIG}
        if config:
            merged_config.update(config)

        # Initialize speaker selector
        if self._speaker_selector is None:
            self._speaker_selector = create_speaker_selector(
                merged_config["speaker_selection"]
            )

        # Store agents and create contexts
        agent_contexts: list[SwarmAgentContext] = []
        self._agents = {}

        for agent in agents:
            self._agents[agent.agent_id] = agent
            agent_contexts.append(agent.to_context())

        state: SwarmState = {
            "swarm_id": swarm_id,
            "topic": topic,
            "agents": agent_contexts,
            "messages": [],
            "current_speaker_id": "",
            "turn_count": 0,
            "config": merged_config,
            "status": "active",
            "termination_reason": None,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
        }

        return state

    def run_turn(self, state: SwarmState) -> tuple[SwarmState, SwarmMessage | None]:
        """
        Execute a single turn in the swarm conversation.

        1. Select next speaker
        2. Generate their response
        3. Update state

        Args:
            state: Current swarm state

        Returns:
            Tuple of (updated state, new message or None if terminated)
        """
        # Check if already terminated
        if state["status"] not in ("active", "initializing"):
            return state, None

        # Check termination conditions before turn
        should_end, reason = self._termination_checker.should_terminate(state)
        if should_end:
            return self._complete_swarm(state, reason), None

        # Select next speaker
        speaker_id = self._speaker_selector.select(state)
        agent = self._agents.get(speaker_id)

        if agent is None:
            # Agent not found - skip turn
            print(f"Warning: Agent {speaker_id} not found, skipping turn")
            return state, None

        # Generate response
        response_content = agent.generate_response(
            topic=state["topic"],
            conversation_history=state["messages"],
        )

        # Create message
        now = datetime.now(timezone.utc).isoformat()
        message: SwarmMessage = {
            "id": str(uuid.uuid4()),
            "turn_number": state["turn_count"] + 1,
            "speaker_id": speaker_id,
            "speaker_name": agent.agent_name,
            "content": response_content,
            "timestamp": now,
            "message_type": "dialogue",
        }

        # Update agent tracking
        agent.message_count += 1
        agent.last_spoke_turn = state["turn_count"] + 1

        # Update state
        updated_state = self._update_state_with_message(state, message, speaker_id)

        return updated_state, message

    def run_swarm(
        self,
        state: SwarmState,
        on_message: MessageCallback | None = None,
    ) -> SwarmState:
        """
        Run the swarm conversation to completion.

        Executes turns until a termination condition is met.

        Args:
            state: Initial swarm state
            on_message: Optional callback for each message (sync or async)

        Returns:
            Final swarm state
        """
        current_state = state

        while current_state["status"] == "active":
            updated_state, message = self.run_turn(current_state)

            if message and on_message:
                # Call the callback (handle both sync and async)
                try:
                    result = on_message(message)
                    # If it's a coroutine, we can't await it here (sync context)
                    # The caller should use run_swarm_async for async callbacks
                except Exception as e:
                    print(f"Warning: Message callback error: {e}")

            current_state = updated_state

            # Safety check
            if current_state["turn_count"] > 1000:
                current_state = self._complete_swarm(current_state, "max_turns")
                break

        return current_state

    async def run_swarm_async(
        self,
        state: SwarmState,
        on_message: Callable[[SwarmMessage], Awaitable[None]] | None = None,
    ) -> SwarmState:
        """
        Run the swarm conversation asynchronously.

        Async version of run_swarm that properly awaits the callback.

        Args:
            state: Initial swarm state
            on_message: Optional async callback for each message

        Returns:
            Final swarm state
        """
        current_state = state

        while current_state["status"] == "active":
            updated_state, message = self.run_turn(current_state)

            if message and on_message:
                try:
                    await on_message(message)
                except Exception as e:
                    print(f"Warning: Async message callback error: {e}")

            current_state = updated_state

            # Safety check
            if current_state["turn_count"] > 1000:
                current_state = self._complete_swarm(current_state, "max_turns")
                break

        return current_state

    def get_output(self, state: SwarmState) -> SwarmOutput:
        """
        Extract SwarmOutput from completed state.

        Args:
            state: Completed swarm state

        Returns:
            SwarmOutput with summary data
        """
        duration = 0.0
        if self._start_time:
            duration = time.time() - self._start_time

        participants = [
            {
                "agent_id": a["agent_id"],
                "agent_name": a["agent_name"],
                "message_count": a["message_count"],
                "demographics": a.get("demographics", {}),
            }
            for a in state["agents"]
        ]

        return {
            "swarm_id": state["swarm_id"],
            "topic": state["topic"],
            "participants": participants,
            "messages": state["messages"],
            "total_turns": state["turn_count"],
            "status": state["status"],
            "termination_reason": state["termination_reason"],
            "duration_seconds": duration,
        }

    def _update_state_with_message(
        self,
        state: SwarmState,
        message: SwarmMessage,
        speaker_id: str,
    ) -> SwarmState:
        """Update state after a message is generated."""
        now = datetime.now(timezone.utc).isoformat()

        # Update agent context in state
        updated_agents = []
        for agent_ctx in state["agents"]:
            if agent_ctx["agent_id"] == speaker_id:
                updated_ctx = {**agent_ctx}
                updated_ctx["message_count"] = agent_ctx["message_count"] + 1
                updated_ctx["last_spoke_turn"] = state["turn_count"] + 1
                updated_agents.append(updated_ctx)
            else:
                updated_agents.append(agent_ctx)

        return {
            **state,
            "agents": updated_agents,
            "messages": state["messages"] + [message],
            "current_speaker_id": speaker_id,
            "turn_count": state["turn_count"] + 1,
            "updated_at": now,
        }

    def _complete_swarm(
        self,
        state: SwarmState,
        reason: TerminationReason | None,
    ) -> SwarmState:
        """Mark swarm as completed."""
        now = datetime.now(timezone.utc).isoformat()
        return {
            **state,
            "status": "completed",
            "termination_reason": reason,
            "updated_at": now,
            "completed_at": now,
        }


def create_swarm_orchestrator(
    selection_strategy: str = "dynamic",
) -> SwarmOrchestrator:
    """
    Factory function for creating SwarmOrchestrator.

    Args:
        selection_strategy: Speaker selection strategy

    Returns:
        Configured SwarmOrchestrator
    """
    selector = create_speaker_selector(selection_strategy)
    return SwarmOrchestrator(speaker_selector=selector)


def run_swarm_from_input(
    input_data: SwarmInput,
    interviews: list[dict],
    on_message: MessageCallback | None = None,
) -> SwarmOutput:
    """
    Convenience function to run a complete swarm from input.

    Args:
        input_data: SwarmInput with topic, agent_ids, config
        interviews: Full interview data (filtered by input_data.agent_ids)
        on_message: Optional message callback

    Returns:
        SwarmOutput with results
    """
    # Filter interviews to requested agents
    agent_ids = set(input_data["agent_ids"])
    filtered_interviews = [
        i for i in interviews
        if i.get("id") in agent_ids
    ]

    # Create orchestrator and run
    orchestrator = create_swarm_orchestrator(
        input_data.get("config", {}).get("speaker_selection", "dynamic")
    )

    state = orchestrator.initialize_swarm(
        topic=input_data["topic"],
        interviews=filtered_interviews,
        config=input_data.get("config"),
    )

    final_state = orchestrator.run_swarm(state, on_message=on_message)

    return orchestrator.get_output(final_state)
