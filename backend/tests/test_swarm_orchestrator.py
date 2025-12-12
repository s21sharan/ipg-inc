"""
Unit tests for SwarmOrchestrator.

Phase 4 Exit Criteria: All tests pass.
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime, timezone
import asyncio

from app.swarm.swarm_orchestrator import (
    SwarmOrchestrator,
    create_swarm_orchestrator,
    run_swarm_from_input,
)
from app.swarm.swarm_state import (
    SwarmState,
    SwarmMessage,
    SwarmConfig,
    SwarmInput,
    DEFAULT_SWARM_CONFIG,
)
from app.swarm.swarm_agent import SwarmAgent
from app.swarm.speaker_selection import SpeakerSelector
from app.swarm.termination import TerminationChecker


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_interviews():
    """Create sample interview data for testing."""
    return [
        {
            "id": "int-1",
            "demographics": {"name": "Alice Chen"},
            "personality": {
                "scores": {
                    "openness": 4.0,
                    "conscientiousness": 3.5,
                    "extraversion": 3.0,
                    "agreeableness": 4.0,
                    "neuroticism": 2.0,
                }
            },
            "reflection_memory": {
                "basic_facts": {"occupation": "Designer"},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
        },
        {
            "id": "int-2",
            "demographics": {"name": "Bob Smith"},
            "personality": {
                "scores": {
                    "openness": 2.5,
                    "conscientiousness": 4.0,
                    "extraversion": 2.0,
                    "agreeableness": 3.0,
                    "neuroticism": 3.0,
                }
            },
            "reflection_memory": {
                "basic_facts": {"occupation": "Engineer"},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
        },
        {
            "id": "int-3",
            "demographics": {"name": "Carol Davis"},
            "personality": {
                "scores": {
                    "openness": 3.5,
                    "conscientiousness": 3.0,
                    "extraversion": 4.0,
                    "agreeableness": 3.5,
                    "neuroticism": 2.5,
                }
            },
            "reflection_memory": {
                "basic_facts": {"occupation": "Marketing"},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
        },
    ]


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    mock = MagicMock()
    mock.complete.return_value = "This is a test response."
    mock.generate_embedding.return_value = [0.1] * 1536
    mock.score_importance.return_value = 5.0
    return mock


@pytest.fixture
def mock_agents():
    """Create mock SwarmAgent instances."""
    agents = []
    for i, name in enumerate(["Alice", "Bob", "Carol"]):
        agent = MagicMock(spec=SwarmAgent)
        agent.agent_id = f"agent-{i+1}"
        agent.agent_name = name
        agent.interview_id = f"int-{i+1}"
        agent.message_count = 0
        agent.last_spoke_turn = -1
        agent.personality = {
            "openness": 3.0,
            "conscientiousness": 3.0,
            "extraversion": 3.0,
            "agreeableness": 3.0,
            "neuroticism": 3.0,
        }
        agent.emotional_state = {
            "primary_emotion": "neutral",
            "intensity": 0.5,
            "valence": 0.0,
            "arousal": 0.3,
            "narrative": "Starting discussion.",
        }
        agent.reflection_memory = {}
        agent.memories = []
        agent.generate_response.return_value = f"This is {name}'s response."
        agent.to_context.return_value = {
            "agent_id": agent.agent_id,
            "agent_name": agent.agent_name,
            "interview_id": agent.interview_id,
            "personality": agent.personality,
            "emotional_state": agent.emotional_state,
            "reflection_memory": agent.reflection_memory,
            "memories": agent.memories,
            "message_count": agent.message_count,
            "last_spoke_turn": agent.last_spoke_turn,
        }
        agents.append(agent)
    return agents


# =============================================================================
# Initialization Tests
# =============================================================================


class TestSwarmOrchestratorInitialization:
    """Tests for swarm initialization."""

    @patch("app.swarm.swarm_orchestrator.SwarmAgent.from_interview_data")
    @patch("app.orchestration.llm_client.get_llm_client")
    def test_initialize_swarm_creates_state(
        self, mock_get_llm, mock_from_interview, sample_interviews, mock_llm_client, mock_agents
    ):
        """Test that initialize_swarm creates proper state."""
        mock_get_llm.return_value = mock_llm_client

        # Setup mock agent creation
        mock_from_interview.side_effect = mock_agents

        orchestrator = SwarmOrchestrator()
        state = orchestrator.initialize_swarm(
            topic="What features matter?",
            interviews=sample_interviews,
            load_memories=False,
        )

        assert state["topic"] == "What features matter?"
        assert len(state["agents"]) == 3
        assert state["status"] == "active"
        assert state["turn_count"] == 0
        assert state["swarm_id"] is not None

    @patch("app.swarm.swarm_orchestrator.SwarmAgent.from_interview_data")
    @patch("app.orchestration.llm_client.get_llm_client")
    def test_initialize_swarm_with_custom_config(
        self, mock_get_llm, mock_from_interview, sample_interviews, mock_llm_client, mock_agents
    ):
        """Test initialization with custom config."""
        mock_get_llm.return_value = mock_llm_client
        mock_from_interview.side_effect = mock_agents

        custom_config: SwarmConfig = {
            "max_turns": 50,
            "speaker_selection": "round_robin",
            "min_messages_per_agent": 5,
            "allow_early_termination": False,
            "termination_keywords": ["done"],
        }

        orchestrator = SwarmOrchestrator()
        state = orchestrator.initialize_swarm(
            topic="Test topic",
            interviews=sample_interviews,
            config=custom_config,
            load_memories=False,
        )

        assert state["config"]["max_turns"] == 50
        assert state["config"]["speaker_selection"] == "round_robin"

    def test_initialize_from_agents(self, mock_agents):
        """Test initialization from pre-created agents."""
        orchestrator = SwarmOrchestrator()
        state = orchestrator.initialize_from_agents(
            topic="Pre-initialized topic",
            agents=mock_agents,
        )

        assert len(state["agents"]) == 3
        assert state["topic"] == "Pre-initialized topic"


# =============================================================================
# Turn Execution Tests
# =============================================================================


class TestSwarmTurnExecution:
    """Tests for single turn execution."""

    def test_run_turn_generates_message(self, mock_agents):
        """Test that run_turn generates a message."""
        # Setup mock speaker selector
        mock_selector = MagicMock(spec=SpeakerSelector)
        mock_selector.select.return_value = "agent-1"

        orchestrator = SwarmOrchestrator(speaker_selector=mock_selector)
        state = orchestrator.initialize_from_agents(
            topic="Test topic",
            agents=mock_agents,
        )

        updated_state, message = orchestrator.run_turn(state)

        assert message is not None
        assert message["speaker_id"] == "agent-1"
        assert message["speaker_name"] == "Alice"
        assert "response" in message["content"].lower()
        assert updated_state["turn_count"] == 1

    def test_run_turn_updates_agent_tracking(self, mock_agents):
        """Test that run_turn updates agent message count."""
        mock_selector = MagicMock(spec=SpeakerSelector)
        mock_selector.select.return_value = "agent-2"

        orchestrator = SwarmOrchestrator(speaker_selector=mock_selector)
        state = orchestrator.initialize_from_agents(
            topic="Test topic",
            agents=mock_agents,
        )

        updated_state, message = orchestrator.run_turn(state)

        # Find Bob in updated state
        bob = next(a for a in updated_state["agents"] if a["agent_id"] == "agent-2")
        assert bob["message_count"] == 1
        assert bob["last_spoke_turn"] == 1

    def test_run_turn_adds_message_to_history(self, mock_agents):
        """Test that messages are added to conversation history."""
        mock_selector = MagicMock(spec=SpeakerSelector)
        mock_selector.select.return_value = "agent-1"

        orchestrator = SwarmOrchestrator(speaker_selector=mock_selector)
        state = orchestrator.initialize_from_agents(
            topic="Test topic",
            agents=mock_agents,
        )

        # Run multiple turns
        state, msg1 = orchestrator.run_turn(state)
        mock_selector.select.return_value = "agent-2"
        state, msg2 = orchestrator.run_turn(state)

        assert len(state["messages"]) == 2
        assert state["messages"][0]["speaker_name"] == "Alice"
        assert state["messages"][1]["speaker_name"] == "Bob"

    def test_run_turn_returns_none_when_completed(self, mock_agents):
        """Test that run_turn returns None when swarm is completed."""
        orchestrator = SwarmOrchestrator()
        state = orchestrator.initialize_from_agents(
            topic="Test",
            agents=mock_agents,
        )

        # Mark as completed
        state["status"] = "completed"

        updated_state, message = orchestrator.run_turn(state)

        assert message is None
        assert updated_state["status"] == "completed"


# =============================================================================
# Full Swarm Execution Tests
# =============================================================================


class TestSwarmFullExecution:
    """Tests for running complete swarms."""

    def test_run_swarm_executes_until_termination(self, mock_agents):
        """Test that run_swarm runs until termination."""
        # Setup to terminate after 3 turns
        mock_selector = MagicMock(spec=SpeakerSelector)
        agent_cycle = ["agent-1", "agent-2", "agent-3"]
        call_count = [0]

        def select_side_effect(state):
            idx = call_count[0] % 3
            call_count[0] += 1
            return agent_cycle[idx]

        mock_selector.select.side_effect = select_side_effect

        mock_terminator = MagicMock(spec=TerminationChecker)

        # Return False for first 2 turns, then True
        termination_calls = [0]

        def termination_side_effect(state):
            termination_calls[0] += 1
            if termination_calls[0] >= 3:
                return True, "max_turns"
            return False, None

        mock_terminator.should_terminate.side_effect = termination_side_effect

        orchestrator = SwarmOrchestrator(
            speaker_selector=mock_selector,
            termination_checker=mock_terminator,
        )
        state = orchestrator.initialize_from_agents(
            topic="Test topic",
            agents=mock_agents,
        )

        final_state = orchestrator.run_swarm(state)

        assert final_state["status"] == "completed"
        assert len(final_state["messages"]) == 2

    def test_run_swarm_calls_message_callback(self, mock_agents):
        """Test that message callback is called for each message."""
        mock_selector = MagicMock(spec=SpeakerSelector)
        mock_selector.select.return_value = "agent-1"

        mock_terminator = MagicMock(spec=TerminationChecker)
        call_count = [0]

        def termination_side_effect(state):
            call_count[0] += 1
            if call_count[0] >= 2:
                return True, "max_turns"
            return False, None

        mock_terminator.should_terminate.side_effect = termination_side_effect

        orchestrator = SwarmOrchestrator(
            speaker_selector=mock_selector,
            termination_checker=mock_terminator,
        )
        state = orchestrator.initialize_from_agents(
            topic="Test",
            agents=mock_agents,
        )

        messages_received = []

        def on_message(msg):
            messages_received.append(msg)

        orchestrator.run_swarm(state, on_message=on_message)

        assert len(messages_received) == 1

    @pytest.mark.asyncio
    async def test_run_swarm_async(self, mock_agents):
        """Test async swarm execution."""
        mock_selector = MagicMock(spec=SpeakerSelector)
        mock_selector.select.return_value = "agent-1"

        mock_terminator = MagicMock(spec=TerminationChecker)
        call_count = [0]

        def termination_side_effect(state):
            call_count[0] += 1
            if call_count[0] >= 2:
                return True, "max_turns"
            return False, None

        mock_terminator.should_terminate.side_effect = termination_side_effect

        orchestrator = SwarmOrchestrator(
            speaker_selector=mock_selector,
            termination_checker=mock_terminator,
        )
        state = orchestrator.initialize_from_agents(
            topic="Async test",
            agents=mock_agents,
        )

        messages_received = []

        async def on_message(msg):
            messages_received.append(msg)

        final_state = await orchestrator.run_swarm_async(state, on_message=on_message)

        assert final_state["status"] == "completed"
        assert len(messages_received) == 1


# =============================================================================
# State Transition Tests
# =============================================================================


class TestSwarmStateTransitions:
    """Tests for state transitions."""

    def test_state_transitions_to_completed(self, mock_agents):
        """Test that state transitions to completed on termination."""
        mock_terminator = MagicMock(spec=TerminationChecker)
        mock_terminator.should_terminate.return_value = (True, "max_turns")

        orchestrator = SwarmOrchestrator(termination_checker=mock_terminator)
        state = orchestrator.initialize_from_agents(
            topic="Test",
            agents=mock_agents,
        )

        updated_state, _ = orchestrator.run_turn(state)

        assert updated_state["status"] == "completed"
        assert updated_state["termination_reason"] == "max_turns"
        assert updated_state["completed_at"] is not None


# =============================================================================
# Output Extraction Tests
# =============================================================================


class TestSwarmOutput:
    """Tests for output extraction."""

    def test_get_output_returns_summary(self, mock_agents):
        """Test that get_output returns proper summary."""
        mock_selector = MagicMock(spec=SpeakerSelector)
        mock_selector.select.return_value = "agent-1"

        mock_terminator = MagicMock(spec=TerminationChecker)
        mock_terminator.should_terminate.side_effect = [
            (False, None),
            (True, "max_turns"),
        ]

        orchestrator = SwarmOrchestrator(
            speaker_selector=mock_selector,
            termination_checker=mock_terminator,
        )
        state = orchestrator.initialize_from_agents(
            topic="Output test",
            agents=mock_agents,
        )

        final_state = orchestrator.run_swarm(state)
        output = orchestrator.get_output(final_state)

        assert output["swarm_id"] == final_state["swarm_id"]
        assert output["topic"] == "Output test"
        assert len(output["participants"]) == 3
        assert output["total_turns"] == 1
        assert output["status"] == "completed"
        assert output["duration_seconds"] >= 0


# =============================================================================
# Factory Function Tests
# =============================================================================


class TestOrchestratorFactory:
    """Tests for factory functions."""

    def test_create_swarm_orchestrator(self):
        """Test factory function creates orchestrator."""
        orchestrator = create_swarm_orchestrator("round_robin")

        assert orchestrator is not None
        assert orchestrator._speaker_selector is not None
        assert orchestrator._speaker_selector.strategy == "round_robin"

    def test_create_swarm_orchestrator_default_strategy(self):
        """Test factory with default strategy."""
        orchestrator = create_swarm_orchestrator()

        assert orchestrator._speaker_selector.strategy == "dynamic"


# =============================================================================
# Convenience Function Tests
# =============================================================================


class TestRunSwarmFromInput:
    """Tests for run_swarm_from_input convenience function."""

    @patch("app.swarm.swarm_orchestrator.SwarmAgent.from_interview_data")
    @patch("app.orchestration.llm_client.get_llm_client")
    def test_run_swarm_from_input(
        self, mock_get_llm, mock_from_interview, sample_interviews, mock_llm_client, mock_agents
    ):
        """Test convenience function runs complete swarm."""
        mock_get_llm.return_value = mock_llm_client
        mock_from_interview.side_effect = mock_agents

        # Patch termination to stop quickly
        with patch.object(TerminationChecker, "should_terminate") as mock_term:
            mock_term.side_effect = [
                (False, None),
                (True, "max_turns"),
            ]

            input_data: SwarmInput = {
                "topic": "Test from input",
                "agent_ids": ["int-1", "int-2", "int-3"],
                "config": {
                    "max_turns": 5,
                    "speaker_selection": "round_robin",
                    "min_messages_per_agent": 1,
                    "allow_early_termination": True,
                    "termination_keywords": ["agree"],
                },
            }

            output = run_swarm_from_input(
                input_data,
                sample_interviews,
            )

            assert output["topic"] == "Test from input"
            assert output["status"] == "completed"
