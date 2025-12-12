"""
Speaker selection strategies for multi-agent swarm dialogues.

Implements different strategies for selecting the next speaker in a swarm:
- round_robin: Simple turn-taking through all agents
- dynamic: LLM-based selection based on conversation flow
- random: Random selection with balance bias

Reference: HACN Architecture - Tier 1 (Speaker Selection)
"""

from typing import Literal
import random

from .swarm_state import SwarmState, SwarmAgentContext, SwarmMessage
from ..orchestration.llm_client import get_llm_client, LLMClient


SelectionStrategy = Literal["round_robin", "dynamic", "random"]


class SpeakerSelector:
    """
    Selects the next speaker in a swarm conversation.

    Supports multiple selection strategies to balance participation
    and maintain natural conversation flow.
    """

    def __init__(
        self,
        strategy: SelectionStrategy = "dynamic",
        llm_client: LLMClient | None = None,
    ):
        """
        Initialize speaker selector.

        Args:
            strategy: Selection strategy to use
            llm_client: Optional LLM client for dynamic selection
        """
        self.strategy = strategy
        self._llm = llm_client

    def select(self, state: SwarmState) -> str:
        """
        Select the next speaker based on the configured strategy.

        Args:
            state: Current swarm state

        Returns:
            agent_id of the selected next speaker
        """
        if self.strategy == "round_robin":
            return self._select_round_robin(state)
        elif self.strategy == "dynamic":
            return self._select_dynamic(state)
        elif self.strategy == "random":
            return self._select_random(state)
        else:
            # Default to round robin
            return self._select_round_robin(state)

    def _select_round_robin(self, state: SwarmState) -> str:
        """
        Simple turn-taking through all agents.

        Cycles through agents in order, ensuring equal participation.
        """
        agents = state["agents"]
        if not agents:
            raise ValueError("No agents in swarm")

        # Find current speaker index
        current_id = state["current_speaker_id"]

        if not current_id:
            # First turn - start with first agent
            return agents[0]["agent_id"]

        # Find current speaker and get next
        for i, agent in enumerate(agents):
            if agent["agent_id"] == current_id:
                next_index = (i + 1) % len(agents)
                return agents[next_index]["agent_id"]

        # Current speaker not found - start over
        return agents[0]["agent_id"]

    def _select_dynamic(self, state: SwarmState) -> str:
        """
        LLM-based selection considering conversation context.

        Selects based on who would most naturally speak next,
        while considering participation balance.
        """
        agents = state["agents"]
        if not agents:
            raise ValueError("No agents in swarm")

        # If no messages yet, start with first agent
        if not state["messages"]:
            return agents[0]["agent_id"]

        # Get LLM client if not set
        if self._llm is None:
            self._llm = get_llm_client()

        # Build agent descriptions
        agent_descriptions = []
        for agent in agents:
            msg_count = agent["message_count"]
            last_spoke = agent["last_spoke_turn"]
            turns_since = state["turn_count"] - last_spoke if last_spoke >= 0 else state["turn_count"]

            agent_descriptions.append(
                f"- {agent['agent_name']} (ID: {agent['agent_id']}): "
                f"spoken {msg_count} times, last spoke {turns_since} turns ago"
            )

        # Format recent messages
        recent_messages = state["messages"][-5:]
        messages_text = "\n".join([
            f"{msg['speaker_name']}: {msg['content'][:100]}..."
            if len(msg["content"]) > 100 else f"{msg['speaker_name']}: {msg['content']}"
            for msg in recent_messages
        ])

        # Get speaker's last message
        last_speaker = recent_messages[-1]["speaker_name"] if recent_messages else "No one"

        system_prompt = """You are a conversation moderator selecting who should speak next in a group discussion.
Consider:
1. Who would naturally want to respond to what was just said?
2. Who hasn't spoken recently and might have something to add?
3. The overall balance of participation

Respond with ONLY the agent ID (e.g., "agent-123") of who should speak next."""

        user_prompt = f"""Topic: {state['topic']}

Participants:
{chr(10).join(agent_descriptions)}

Recent conversation:
{messages_text}

{last_speaker} just finished speaking.

Who should speak next? Respond with ONLY the agent ID."""

        try:
            response = self._llm.complete(user_prompt, system_prompt=system_prompt, max_tokens=100)

            # Extract agent ID from response
            response_clean = response.strip().lower()

            # Try to find a valid agent ID in response
            for agent in agents:
                if agent["agent_id"].lower() in response_clean:
                    return agent["agent_id"]

            # If no match, fall back to balance-based selection
            return self._select_least_active(agents, state["current_speaker_id"])

        except Exception:
            # On error, fall back to round robin
            return self._select_round_robin(state)

    def _select_random(self, state: SwarmState) -> str:
        """
        Random selection with balance bias.

        Agents who have spoken less are more likely to be selected.
        """
        agents = state["agents"]
        if not agents:
            raise ValueError("No agents in swarm")

        # Calculate weights inversely proportional to message count
        # Agents with fewer messages get higher weight
        max_messages = max(a["message_count"] for a in agents) + 1
        weights = [max_messages - a["message_count"] + 1 for a in agents]

        # Don't select the same speaker twice in a row
        current_id = state["current_speaker_id"]
        if current_id:
            for i, agent in enumerate(agents):
                if agent["agent_id"] == current_id:
                    weights[i] = 0  # Zero weight for current speaker
                    break

        # Ensure at least one non-zero weight
        if sum(weights) == 0:
            weights = [1] * len(agents)

        # Weighted random selection
        selected = random.choices(agents, weights=weights, k=1)[0]
        return selected["agent_id"]

    def _select_least_active(
        self,
        agents: list[SwarmAgentContext],
        exclude_id: str | None = None,
    ) -> str:
        """Select the agent who has spoken least, excluding current speaker."""
        candidates = [a for a in agents if a["agent_id"] != exclude_id]
        if not candidates:
            candidates = agents

        # Sort by message count ascending
        candidates.sort(key=lambda a: a["message_count"])
        return candidates[0]["agent_id"]


def create_speaker_selector(
    strategy: SelectionStrategy = "dynamic",
) -> SpeakerSelector:
    """Factory function for creating speaker selectors."""
    return SpeakerSelector(strategy=strategy)
