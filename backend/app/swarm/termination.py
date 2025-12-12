"""
Termination conditions for multi-agent swarm dialogues.

Implements various conditions that can trigger the end of a swarm:
- max_turns: Maximum number of dialogue turns reached
- consensus_signal: Agents signal agreement/conclusion
- inactivity: No substantive new content
- manual: External termination request

Reference: HACN Architecture - Tier 1 (Termination Logic)
"""

from typing import Literal

from .swarm_state import SwarmState, SwarmMessage


TerminationReason = Literal[
    "max_turns",
    "consensus_signal",
    "inactivity",
    "manual",
    "min_participation_reached",
    "error",
]


class TerminationChecker:
    """
    Checks various termination conditions for a swarm.

    Combines multiple termination signals to determine when
    a swarm conversation should end.
    """

    def __init__(
        self,
        inactivity_threshold: int = 3,
        min_unique_content_length: int = 20,
    ):
        """
        Initialize termination checker.

        Args:
            inactivity_threshold: Number of consecutive low-content messages
            min_unique_content_length: Minimum length for substantive content
        """
        self.inactivity_threshold = inactivity_threshold
        self.min_unique_content_length = min_unique_content_length
        self._consecutive_low_content = 0

    def should_terminate(self, state: SwarmState) -> tuple[bool, TerminationReason | None]:
        """
        Check if the swarm should terminate.

        Args:
            state: Current swarm state

        Returns:
            Tuple of (should_terminate, reason)
        """
        # Check max turns
        if self._check_max_turns(state):
            return True, "max_turns"

        # Check consensus signal in recent messages
        if self._check_consensus_signal(state):
            return True, "consensus_signal"

        # Check minimum participation requirement
        if self._check_min_participation(state):
            # Only terminate if we've had enough turns
            if state["turn_count"] >= len(state["agents"]) * state["config"]["min_messages_per_agent"]:
                return True, "min_participation_reached"

        # Check for inactivity (repetitive/low-content messages)
        if self._check_inactivity(state):
            return True, "inactivity"

        # Check error state
        if state["status"] == "error":
            return True, "error"

        return False, None

    def _check_max_turns(self, state: SwarmState) -> bool:
        """Check if maximum turns reached."""
        return state["turn_count"] >= state["config"]["max_turns"]

    def _check_consensus_signal(self, state: SwarmState) -> bool:
        """
        Check if recent messages contain consensus signals.

        Looks for termination keywords or explicit agreement patterns.
        """
        if not state["config"]["allow_early_termination"]:
            return False

        if len(state["messages"]) < 3:
            return False

        keywords = state["config"]["termination_keywords"]
        recent_messages = state["messages"][-3:]

        # Count messages containing consensus keywords
        consensus_count = 0
        for msg in recent_messages:
            content_lower = msg["content"].lower()
            if any(kw.lower() in content_lower for kw in keywords):
                consensus_count += 1

        # If multiple recent messages signal consensus
        if consensus_count >= 2:
            return True

        # Check for explicit conclusion patterns
        conclusion_patterns = [
            "we all agree",
            "we've reached consensus",
            "in conclusion",
            "to summarize our discussion",
            "i think we've covered",
            "that seems to cover",
        ]

        last_msg = state["messages"][-1]["content"].lower()
        if any(pattern in last_msg for pattern in conclusion_patterns):
            return True

        return False

    def _check_min_participation(self, state: SwarmState) -> bool:
        """
        Check if all agents have met minimum participation.

        Returns True if all agents have spoken at least min_messages_per_agent times.
        """
        min_messages = state["config"]["min_messages_per_agent"]

        for agent in state["agents"]:
            if agent["message_count"] < min_messages:
                return False

        return True

    def _check_inactivity(self, state: SwarmState) -> bool:
        """
        Check for conversation inactivity.

        Detects when agents are producing repetitive or low-content messages.
        """
        if len(state["messages"]) < self.inactivity_threshold:
            return False

        recent = state["messages"][-self.inactivity_threshold:]

        # Check for very short messages
        short_count = sum(
            1 for msg in recent
            if len(msg["content"].strip()) < self.min_unique_content_length
        )
        if short_count >= self.inactivity_threshold:
            self._consecutive_low_content += 1
            if self._consecutive_low_content >= 2:
                return True
        else:
            self._consecutive_low_content = 0

        # Check for repetitive content
        contents = [msg["content"].lower().strip() for msg in recent]
        unique_contents = set(contents)
        if len(unique_contents) < len(contents) * 0.5:
            # More than half are duplicates
            return True

        return False

    def reset(self) -> None:
        """Reset internal counters."""
        self._consecutive_low_content = 0


def check_should_terminate(state: SwarmState) -> tuple[bool, TerminationReason | None]:
    """
    Convenience function to check termination conditions.

    Creates a TerminationChecker and checks the state.

    Args:
        state: Current swarm state

    Returns:
        Tuple of (should_terminate, reason)
    """
    checker = TerminationChecker()
    return checker.should_terminate(state)


def has_reached_max_turns(state: SwarmState) -> bool:
    """Check if max turns reached."""
    return state["turn_count"] >= state["config"]["max_turns"]


def has_reached_min_participation(state: SwarmState) -> bool:
    """Check if all agents have met minimum participation."""
    min_messages = state["config"]["min_messages_per_agent"]
    return all(a["message_count"] >= min_messages for a in state["agents"])


def contains_consensus_keywords(message: SwarmMessage, keywords: list[str]) -> bool:
    """Check if a message contains consensus keywords."""
    content_lower = message["content"].lower()
    return any(kw.lower() in content_lower for kw in keywords)
