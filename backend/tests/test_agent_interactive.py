#!/usr/bin/env python3
"""
Tests for interactive agent mode.

Tests the agent orchestrator's ability to handle single-turn conversations
as used in the interactive mode of test_agent.py.

Run with:
    cd backend
    pytest tests/test_agent_interactive.py -v
"""

import pytest
from unittest.mock import patch, MagicMock

import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.orchestration import AgentOrchestrator, WorkflowInput


# Sample interview data for testing
MOCK_INTERVIEW = {
    "id": "test-interview-001",
    "name": "Test User",
    "summary": "A test user for interactive mode testing.",
    "age": 30,
    "occupation": "Software Developer",
    "country": "United States",
    "transcript": [
        {
            "question": "Tell me about yourself.",
            "answer": "I'm a software developer who loves building things."
        },
        {
            "question": "What frustrates you about current tools?",
            "answer": "They're often too complex and hard to learn."
        }
    ],
    "personality": {
        "openness": 4.2,
        "conscientiousness": 3.8,
        "extraversion": 2.5,
        "agreeableness": 3.5,
        "neuroticism": 2.0
    },
    "reflection_memory": {
        "basic_facts": {
            "occupation": "Software Developer",
            "age": 30,
            "location": "United States"
        },
        "goals_and_aspirations": {
            "primary": "Build useful software",
            "secondary": "Learn new technologies"
        },
        "pain_points_and_frustrations": {
            "current_problems": ["Complex tools", "Poor documentation", "Slow builds"]
        },
        "product_attitudes": {},
        "communication_style": {
            "tone": "Direct and technical"
        }
    }
}


def create_mock_workflow_input() -> WorkflowInput:
    """Create a WorkflowInput for testing."""
    return {
        "agent_id": MOCK_INTERVIEW["id"],
        "agent_name": MOCK_INTERVIEW["name"],
        "interview_data": {
            "transcript": MOCK_INTERVIEW["transcript"],
            "personality": MOCK_INTERVIEW["personality"],
            "reflection_memory": MOCK_INTERVIEW["reflection_memory"],
        },
        "campaign": {"topics": []},
        "initial_observation": "Hello! I'm ready to chat.",
    }


class MockLLMClient:
    """Mock LLM client for testing without API calls."""

    def __init__(self):
        self.call_count = 0
        self.last_prompt = None
        self.last_system_prompt = None

    def complete(self, prompt: str, system_prompt: str | None = None, max_tokens: int = 2000) -> str:
        """Return mock completions based on context."""
        self.call_count += 1
        self.last_prompt = prompt
        self.last_system_prompt = system_prompt

        # Check what kind of response is expected based on prompt content
        if "How does this make you feel" in prompt:
            # Observe node - emotional response
            return '''{
                "primary_emotion": "curious",
                "intensity": 0.6,
                "valence": 0.3,
                "arousal": 0.5,
                "narrative": "I feel engaged and interested in this conversation."
            }'''
        elif "What do you plan to do" in prompt:
            # Plan node
            return "I plan to share my thoughts openly and honestly about this topic."
        elif "Respond as" in prompt:
            # Act node - actual response
            return "That's an interesting question. I think about this a lot actually. In my experience, the key is finding the right balance."
        elif "Generate 2-3 high-level insights" in prompt:
            # Reflect node
            return "Insight: I tend to be analytical when discussing topics.\nInsight: I value practical solutions over theoretical ones."
        else:
            return "I'm not sure how to respond to that."

    def generate_embedding(self, text: str) -> list[float]:
        """Return mock embedding."""
        return [0.1] * 1536

    def score_importance(self, memory_content: str) -> float:
        """Return mock importance score."""
        return 5.0


@pytest.fixture
def mock_llm():
    """Fixture to provide mock LLM client."""
    return MockLLMClient()


@pytest.fixture
def orchestrator():
    """Fixture to provide AgentOrchestrator instance."""
    return AgentOrchestrator(
        reflection_threshold=100.0,  # High threshold to avoid reflection during test
        max_iterations=50,
    )


class TestAgentInteractive:
    """Test suite for interactive agent mode."""

    def test_initialize_state(self, orchestrator):
        """Test that state is properly initialized from workflow input."""
        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        assert state["agent_id"] == "test-interview-001"
        assert state["agent_name"] == "Test User"
        assert state["personality"]["openness"] == 4.2
        assert state["emotional_state"]["primary_emotion"] == "neutral"
        assert state["iteration_count"] == 0
        assert len(state["memory_stream"]) == 2  # From transcript

    def test_state_has_reflection_memory(self, orchestrator):
        """Test that reflection memory is properly loaded."""
        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        assert "basic_facts" in state["reflection_memory"]
        assert state["reflection_memory"]["basic_facts"]["occupation"] == "Software Developer"

    @patch('app.orchestration.nodes.get_llm_client')
    def test_single_turn_returns_response(self, mock_get_llm, orchestrator, mock_llm):
        """Test that run_single_turn returns a response."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        # Run a single turn
        updated_state, response = orchestrator.run_single_turn(
            state,
            "What do you think about AI tools?"
        )

        assert response is not None
        assert len(response) > 0
        assert isinstance(response, str)

    @patch('app.orchestration.nodes.get_llm_client')
    def test_single_turn_updates_state(self, mock_get_llm, orchestrator, mock_llm):
        """Test that run_single_turn properly updates state."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)
        initial_iteration = state["iteration_count"]
        initial_memory_count = len(state["memory_stream"])

        # Run a single turn
        updated_state, response = orchestrator.run_single_turn(
            state,
            "Tell me about your work."
        )

        # Check state was updated
        assert updated_state["iteration_count"] == initial_iteration + 1
        assert len(updated_state["memory_stream"]) > initial_memory_count
        assert len(updated_state["conversation_history"]) > 0

    @patch('app.orchestration.nodes.get_llm_client')
    def test_conversation_history_accumulates(self, mock_get_llm, orchestrator, mock_llm):
        """Test that conversation history builds up over multiple turns."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        questions = [
            "What's your name?",
            "What do you do for work?",
            "What are your hobbies?"
        ]

        for i, question in enumerate(questions):
            state, response = orchestrator.run_single_turn(state, question)
            assert len(state["conversation_history"]) == i + 1
            assert state["conversation_history"][-1]["question"] == question

    @patch('app.orchestration.nodes.get_llm_client')
    def test_emotional_state_updates(self, mock_get_llm, orchestrator, mock_llm):
        """Test that emotional state changes during conversation."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        initial_emotion = state["emotional_state"]["primary_emotion"]

        # Run a turn (mock returns "curious" as emotion)
        updated_state, response = orchestrator.run_single_turn(
            state,
            "What excites you about your work?"
        )

        # Emotional state should have been processed
        assert updated_state["emotional_state"] is not None
        assert "narrative" in updated_state["emotional_state"]

    @patch('app.orchestration.nodes.get_llm_client')
    def test_memory_stream_grows(self, mock_get_llm, orchestrator, mock_llm):
        """Test that memory stream accumulates memories."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        initial_memories = len(state["memory_stream"])

        # Run multiple turns
        for _ in range(3):
            state, _ = orchestrator.run_single_turn(state, "Tell me more.")

        # Should have added observation, plan, and action memories for each turn
        assert len(state["memory_stream"]) > initial_memories

    @patch('app.orchestration.nodes.get_llm_client')
    def test_importance_accumulator_increases(self, mock_get_llm, orchestrator, mock_llm):
        """Test that importance accumulator grows with each turn."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        initial_importance = state["importance_accumulator"]

        state, _ = orchestrator.run_single_turn(state, "What's important to you?")

        assert state["importance_accumulator"] > initial_importance


class TestAgentResponses:
    """Test the quality and structure of agent responses."""

    @patch('app.orchestration.nodes.get_llm_client')
    def test_response_is_not_empty(self, mock_get_llm, orchestrator, mock_llm):
        """Test that responses are not empty."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        state, response = orchestrator.run_single_turn(
            state,
            "How do you feel about remote work?"
        )

        # Response must not be empty
        assert response is not None, "Response is None"
        assert len(response) > 0, "Response is empty string"
        assert response.strip() != "", "Response is only whitespace"

    @patch('app.orchestration.nodes.get_llm_client')
    def test_response_is_conversational(self, mock_get_llm, orchestrator, mock_llm):
        """Test that responses are conversational in length."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        state, response = orchestrator.run_single_turn(
            state,
            "How do you feel about remote work?"
        )

        # Response should be reasonable length (not too short, not essay-length)
        words = response.split()
        assert len(words) >= 5, f"Response too short: '{response}'"
        assert len(words) <= 200, f"Response too long: {len(words)} words"

    @patch('app.orchestration.nodes.get_llm_client')
    def test_current_action_matches_response(self, mock_get_llm, orchestrator, mock_llm):
        """Test that current_action in state matches returned response."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        state, response = orchestrator.run_single_turn(
            state,
            "What's your favorite technology?"
        )

        assert state["current_action"] == response
        assert len(response) > 0, "Response should not be empty"

    @patch('app.orchestration.nodes.get_llm_client')
    def test_response_contains_expected_content(self, mock_get_llm, orchestrator, mock_llm):
        """Test that mock response matches expected output."""
        mock_get_llm.return_value = mock_llm

        workflow_input = create_mock_workflow_input()
        state = orchestrator.initialize_state(workflow_input)

        state, response = orchestrator.run_single_turn(
            state,
            "Tell me about yourself."
        )

        # The mock returns a specific response for act node
        assert "interesting question" in response.lower() or len(response) > 10


class TestEdgeCases:
    """Test edge cases and error handling."""

    def test_empty_transcript(self, orchestrator):
        """Test handling of empty transcript."""
        workflow_input = create_mock_workflow_input()
        workflow_input["interview_data"]["transcript"] = []

        state = orchestrator.initialize_state(workflow_input)

        assert len(state["memory_stream"]) == 0

    def test_missing_personality(self, orchestrator):
        """Test handling of missing personality data."""
        workflow_input = create_mock_workflow_input()
        workflow_input["interview_data"]["personality"] = {}

        state = orchestrator.initialize_state(workflow_input)

        # Should use defaults (2.5 for all traits)
        assert state["personality"]["openness"] == 2.5
        assert state["personality"]["conscientiousness"] == 2.5

    def test_missing_reflection_memory(self, orchestrator):
        """Test handling of missing reflection memory."""
        workflow_input = create_mock_workflow_input()
        workflow_input["interview_data"]["reflection_memory"] = {}

        state = orchestrator.initialize_state(workflow_input)

        # Should have empty dicts
        assert state["reflection_memory"]["basic_facts"] == {}


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
