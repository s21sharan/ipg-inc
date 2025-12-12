"""
Unit tests for speaker selection and termination logic.

Phase 3 Exit Criteria: All tests pass.
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

from app.swarm.speaker_selection import (
    SpeakerSelector,
    create_speaker_selector,
)
from app.swarm.termination import (
    TerminationChecker,
    check_should_terminate,
    has_reached_max_turns,
    has_reached_min_participation,
    contains_consensus_keywords,
)
from app.swarm.swarm_state import (
    SwarmState,
    SwarmMessage,
    SwarmAgentContext,
    SwarmConfig,
    DEFAULT_SWARM_CONFIG,
)


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_agents() -> list[SwarmAgentContext]:
    """Create sample agent contexts for testing."""
    return [
        {
            "agent_id": "agent-1",
            "agent_name": "Alice",
            "interview_id": "int-1",
            "personality": {
                "openness": 3.0,
                "conscientiousness": 3.0,
                "extraversion": 3.0,
                "agreeableness": 3.0,
                "neuroticism": 3.0,
            },
            "emotional_state": {
                "primary_emotion": "neutral",
                "intensity": 0.5,
                "valence": 0.0,
                "arousal": 0.3,
                "narrative": "Starting discussion.",
            },
            "reflection_memory": {
                "basic_facts": {},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
            "memories": [],
            "message_count": 0,
            "last_spoke_turn": -1,
        },
        {
            "agent_id": "agent-2",
            "agent_name": "Bob",
            "interview_id": "int-2",
            "personality": {
                "openness": 3.0,
                "conscientiousness": 3.0,
                "extraversion": 3.0,
                "agreeableness": 3.0,
                "neuroticism": 3.0,
            },
            "emotional_state": {
                "primary_emotion": "neutral",
                "intensity": 0.5,
                "valence": 0.0,
                "arousal": 0.3,
                "narrative": "Starting discussion.",
            },
            "reflection_memory": {
                "basic_facts": {},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
            "memories": [],
            "message_count": 0,
            "last_spoke_turn": -1,
        },
        {
            "agent_id": "agent-3",
            "agent_name": "Carol",
            "interview_id": "int-3",
            "personality": {
                "openness": 3.0,
                "conscientiousness": 3.0,
                "extraversion": 3.0,
                "agreeableness": 3.0,
                "neuroticism": 3.0,
            },
            "emotional_state": {
                "primary_emotion": "neutral",
                "intensity": 0.5,
                "valence": 0.0,
                "arousal": 0.3,
                "narrative": "Starting discussion.",
            },
            "reflection_memory": {
                "basic_facts": {},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
            "memories": [],
            "message_count": 0,
            "last_spoke_turn": -1,
        },
    ]


@pytest.fixture
def sample_state(sample_agents) -> SwarmState:
    """Create a sample swarm state for testing."""
    now = datetime.now(timezone.utc).isoformat()
    return {
        "swarm_id": "swarm-test",
        "topic": "What features matter in a language app?",
        "agents": sample_agents,
        "messages": [],
        "current_speaker_id": "",
        "turn_count": 0,
        "config": DEFAULT_SWARM_CONFIG,
        "status": "active",
        "termination_reason": None,
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }


def create_message(
    turn: int,
    speaker_id: str,
    speaker_name: str,
    content: str,
) -> SwarmMessage:
    """Helper to create test messages."""
    return {
        "id": f"msg-{turn}",
        "turn_number": turn,
        "speaker_id": speaker_id,
        "speaker_name": speaker_name,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "message_type": "dialogue",
    }


# =============================================================================
# Speaker Selection Tests
# =============================================================================


class TestRoundRobinSelection:
    """Tests for round robin speaker selection."""

    def test_first_turn_selects_first_agent(self, sample_state):
        """Test that first turn selects first agent."""
        selector = SpeakerSelector(strategy="round_robin")

        selected = selector.select(sample_state)

        assert selected == "agent-1"

    def test_cycles_through_agents(self, sample_state):
        """Test that round robin cycles through all agents."""
        selector = SpeakerSelector(strategy="round_robin")

        # First turn
        selected = selector.select(sample_state)
        assert selected == "agent-1"

        # Update state
        sample_state["current_speaker_id"] = "agent-1"

        # Second turn
        selected = selector.select(sample_state)
        assert selected == "agent-2"

        # Update state
        sample_state["current_speaker_id"] = "agent-2"

        # Third turn
        selected = selector.select(sample_state)
        assert selected == "agent-3"

        # Update state
        sample_state["current_speaker_id"] = "agent-3"

        # Fourth turn - wraps around
        selected = selector.select(sample_state)
        assert selected == "agent-1"

    def test_handles_unknown_current_speaker(self, sample_state):
        """Test handling when current speaker not in list."""
        selector = SpeakerSelector(strategy="round_robin")
        sample_state["current_speaker_id"] = "unknown-agent"

        selected = selector.select(sample_state)

        # Should start over with first agent
        assert selected == "agent-1"

    def test_raises_error_for_empty_agents(self, sample_state):
        """Test error when no agents in swarm."""
        selector = SpeakerSelector(strategy="round_robin")
        sample_state["agents"] = []

        with pytest.raises(ValueError, match="No agents in swarm"):
            selector.select(sample_state)


class TestDynamicSelection:
    """Tests for dynamic (LLM-based) speaker selection."""

    @patch("app.swarm.speaker_selection.get_llm_client")
    def test_first_turn_selects_first_agent(self, mock_get_llm, sample_state):
        """Test that first turn with no messages selects first agent."""
        selector = SpeakerSelector(strategy="dynamic")

        selected = selector.select(sample_state)

        assert selected == "agent-1"

    @patch("app.swarm.speaker_selection.get_llm_client")
    def test_uses_llm_for_selection(self, mock_get_llm, sample_state):
        """Test that LLM is used for selection with messages."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = "agent-2"
        mock_get_llm.return_value = mock_llm

        # Add a message
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "I think gamification is key.")
        ]
        sample_state["agents"][0]["message_count"] = 1
        sample_state["agents"][0]["last_spoke_turn"] = 1
        sample_state["current_speaker_id"] = "agent-1"
        sample_state["turn_count"] = 1

        selector = SpeakerSelector(strategy="dynamic")
        selected = selector.select(sample_state)

        assert selected == "agent-2"
        mock_llm.complete.assert_called_once()

    @patch("app.swarm.speaker_selection.get_llm_client")
    def test_fallback_on_invalid_llm_response(self, mock_get_llm, sample_state):
        """Test fallback when LLM returns invalid agent ID."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = "some-invalid-agent"
        mock_get_llm.return_value = mock_llm

        # Add messages and set one agent as more active
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "First message.")
        ]
        sample_state["agents"][0]["message_count"] = 3
        sample_state["agents"][1]["message_count"] = 1
        sample_state["agents"][2]["message_count"] = 0
        sample_state["current_speaker_id"] = "agent-1"
        sample_state["turn_count"] = 1

        selector = SpeakerSelector(strategy="dynamic")
        selected = selector.select(sample_state)

        # Should select least active agent (agent-3 with 0 messages)
        assert selected == "agent-3"


class TestRandomSelection:
    """Tests for random speaker selection with balance bias."""

    def test_first_turn_selects_any_agent(self, sample_state):
        """Test that first turn selects some agent."""
        selector = SpeakerSelector(strategy="random")

        selected = selector.select(sample_state)

        assert selected in ["agent-1", "agent-2", "agent-3"]

    def test_avoids_current_speaker(self, sample_state):
        """Test that current speaker is not selected again."""
        selector = SpeakerSelector(strategy="random")
        sample_state["current_speaker_id"] = "agent-1"

        # Run multiple times to check it never selects agent-1
        for _ in range(20):
            selected = selector.select(sample_state)
            assert selected != "agent-1"

    def test_biased_toward_less_active(self, sample_state):
        """Test that agents with fewer messages are more likely selected."""
        selector = SpeakerSelector(strategy="random")

        # Set agent-1 as very active, others not
        sample_state["agents"][0]["message_count"] = 10
        sample_state["agents"][1]["message_count"] = 1
        sample_state["agents"][2]["message_count"] = 0
        sample_state["current_speaker_id"] = ""

        # Run many selections and count
        counts = {"agent-1": 0, "agent-2": 0, "agent-3": 0}
        for _ in range(100):
            selected = selector.select(sample_state)
            counts[selected] += 1

        # Less active agents should be selected more often
        # (This is probabilistic but should hold in most runs)
        assert counts["agent-3"] > counts["agent-1"]


class TestSpeakerSelectorFactory:
    """Tests for speaker selector factory."""

    def test_create_round_robin(self):
        """Test creating round robin selector."""
        selector = create_speaker_selector("round_robin")
        assert selector.strategy == "round_robin"

    def test_create_dynamic(self):
        """Test creating dynamic selector."""
        selector = create_speaker_selector("dynamic")
        assert selector.strategy == "dynamic"

    def test_create_random(self):
        """Test creating random selector."""
        selector = create_speaker_selector("random")
        assert selector.strategy == "random"


# =============================================================================
# Termination Tests
# =============================================================================


class TestMaxTurnsTermination:
    """Tests for max turns termination."""

    def test_terminates_at_max_turns(self, sample_state):
        """Test termination when max turns reached."""
        sample_state["turn_count"] = 20  # Default max is 20
        sample_state["config"]["max_turns"] = 20

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is True
        assert reason == "max_turns"

    def test_continues_before_max_turns(self, sample_state):
        """Test no termination before max turns."""
        sample_state["turn_count"] = 10

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is False
        assert reason is None

    def test_has_reached_max_turns_helper(self, sample_state):
        """Test helper function for max turns check."""
        sample_state["turn_count"] = 19
        assert has_reached_max_turns(sample_state) is False

        sample_state["turn_count"] = 20
        assert has_reached_max_turns(sample_state) is True


class TestConsensusSignalTermination:
    """Tests for consensus signal termination."""

    def test_terminates_on_multiple_consensus_keywords(self, sample_state):
        """Test termination when multiple messages contain consensus keywords."""
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "I think we all agree on this."),
            create_message(2, "agent-2", "Bob", "Yes, there's a consensus here."),
            create_message(3, "agent-3", "Carol", "I agree, let's conclude."),
        ]
        sample_state["turn_count"] = 3

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is True
        assert reason == "consensus_signal"

    def test_terminates_on_conclusion_pattern(self, sample_state):
        """Test termination on explicit conclusion pattern."""
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "Good points everyone."),
            create_message(2, "agent-2", "Bob", "Thanks for the discussion."),
            create_message(3, "agent-3", "Carol", "To summarize our discussion, we all value mobile experience."),
        ]
        sample_state["turn_count"] = 3

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is True
        assert reason == "consensus_signal"

    def test_continues_without_consensus(self, sample_state):
        """Test continuation when no consensus signal."""
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "I think gamification is important."),
            create_message(2, "agent-2", "Bob", "I disagree, simplicity matters more."),
            create_message(3, "agent-3", "Carol", "What about offline mode?"),
        ]
        sample_state["turn_count"] = 3

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is False

    def test_respects_early_termination_setting(self, sample_state):
        """Test that early termination can be disabled."""
        sample_state["config"]["allow_early_termination"] = False
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "We all agree on this."),
            create_message(2, "agent-2", "Bob", "Complete consensus."),
            create_message(3, "agent-3", "Carol", "Agree completely."),
        ]
        sample_state["turn_count"] = 3

        checker = TerminationChecker()
        should_end, reason = checker.should_terminate(sample_state)

        # Should not terminate on consensus since early termination disabled
        assert reason != "consensus_signal"


class TestMinParticipationTermination:
    """Tests for minimum participation termination."""

    def test_terminates_when_all_met_minimum(self, sample_state):
        """Test termination when all agents meet minimum participation."""
        # Set all agents to have met minimum (2 messages each)
        for agent in sample_state["agents"]:
            agent["message_count"] = 2

        sample_state["turn_count"] = 6  # 3 agents * 2 min messages = 6

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is True
        assert reason == "min_participation_reached"

    def test_continues_if_agent_below_minimum(self, sample_state):
        """Test continuation if any agent below minimum."""
        sample_state["agents"][0]["message_count"] = 2
        sample_state["agents"][1]["message_count"] = 2
        sample_state["agents"][2]["message_count"] = 1  # Below minimum

        sample_state["turn_count"] = 5

        should_end, reason = check_should_terminate(sample_state)

        assert should_end is False

    def test_has_reached_min_participation_helper(self, sample_state):
        """Test helper function for min participation check."""
        sample_state["agents"][0]["message_count"] = 2
        sample_state["agents"][1]["message_count"] = 2
        sample_state["agents"][2]["message_count"] = 1

        assert has_reached_min_participation(sample_state) is False

        sample_state["agents"][2]["message_count"] = 2
        assert has_reached_min_participation(sample_state) is True


class TestInactivityTermination:
    """Tests for inactivity termination."""

    def test_terminates_on_very_short_messages(self, sample_state):
        """Test termination on consecutive very short messages."""
        # Create many short messages
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "Ok"),
            create_message(2, "agent-2", "Bob", "Yes"),
            create_message(3, "agent-3", "Carol", "Sure"),
            create_message(4, "agent-1", "Alice", "K"),
            create_message(5, "agent-2", "Bob", "Yep"),
            create_message(6, "agent-3", "Carol", "Ok"),
        ]
        sample_state["turn_count"] = 6

        checker = TerminationChecker(inactivity_threshold=3)
        # First check - sets consecutive counter
        checker.should_terminate(sample_state)
        # Second check - should trigger
        should_end, reason = checker.should_terminate(sample_state)

        assert should_end is True
        assert reason == "inactivity"

    def test_terminates_on_repetitive_content(self, sample_state):
        """Test termination on repetitive messages."""
        sample_state["messages"] = [
            create_message(1, "agent-1", "Alice", "I agree with that point."),
            create_message(2, "agent-2", "Bob", "I agree with that point."),
            create_message(3, "agent-3", "Carol", "I agree with that point."),
        ]
        sample_state["turn_count"] = 3

        checker = TerminationChecker()
        should_end, reason = checker.should_terminate(sample_state)

        assert should_end is True
        assert reason == "inactivity"


class TestContainsConsensusKeywords:
    """Tests for consensus keyword helper."""

    def test_detects_consensus_keywords(self):
        """Test detection of consensus keywords in message."""
        msg: SwarmMessage = {
            "id": "msg-1",
            "turn_number": 1,
            "speaker_id": "agent-1",
            "speaker_name": "Alice",
            "content": "I think we've reached a consensus here.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message_type": "dialogue",
        }

        keywords = ["agree", "consensus", "conclude"]

        assert contains_consensus_keywords(msg, keywords) is True

    def test_returns_false_without_keywords(self):
        """Test no detection without keywords."""
        msg: SwarmMessage = {
            "id": "msg-1",
            "turn_number": 1,
            "speaker_id": "agent-1",
            "speaker_name": "Alice",
            "content": "I think mobile experience is important.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message_type": "dialogue",
        }

        keywords = ["agree", "consensus", "conclude"]

        assert contains_consensus_keywords(msg, keywords) is False


class TestTerminationCheckerReset:
    """Tests for termination checker reset."""

    def test_reset_clears_counters(self):
        """Test that reset clears internal counters."""
        checker = TerminationChecker()
        checker._consecutive_low_content = 5

        checker.reset()

        assert checker._consecutive_low_content == 0
