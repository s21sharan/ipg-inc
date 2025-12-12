"""
Unit tests for SwarmAgent.

Phase 2 Exit Criteria: All tests pass.
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
import uuid

# Import the modules we'll mock
import app.swarm.swarm_agent
import app.orchestration.llm_client
import app.orchestration.persistent_memory

from app.swarm.swarm_agent import SwarmAgent, create_swarm_agent_from_interview
from app.swarm.swarm_state import SwarmMessage, SwarmAgentContext
from app.orchestration.agent_state import (
    PersonalityProfile,
    EmotionalState,
    ReflectionMemory,
)


# Test fixtures
@pytest.fixture
def sample_personality() -> PersonalityProfile:
    return {
        "openness": 4.0,
        "conscientiousness": 3.5,
        "extraversion": 2.5,
        "agreeableness": 3.0,
        "neuroticism": 2.0,
    }


@pytest.fixture
def sample_reflection_memory() -> ReflectionMemory:
    return {
        "basic_facts": {
            "occupation": "Software Engineer",
            "age": "28",
            "location": "San Francisco",
        },
        "goals_and_aspirations": {
            "career": "Become a tech lead",
            "personal": "Learn a new language",
        },
        "pain_points_and_frustrations": {
            "current_problems": ["Not enough time", "Information overload"],
        },
        "product_attitudes": {
            "mobile_apps": "Prefers simple, clean interfaces",
        },
        "communication_style": {
            "tone": "Direct and analytical",
        },
    }


@pytest.fixture
def sample_interview(sample_personality, sample_reflection_memory):
    return {
        "id": str(uuid.uuid4()),
        "demographics": {"name": "Alice Chen"},
        "personality": {"scores": sample_personality},
        "reflection_memory": sample_reflection_memory,
        "transcript": [
            {"question": "What do you do?", "answer": "I'm a software engineer."},
        ],
    }


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client."""
    mock = MagicMock()
    mock.complete.return_value = "This is a test response from the agent."
    mock.generate_embedding.return_value = [0.1] * 1536
    mock.score_importance.return_value = 5.0
    return mock


class TestSwarmAgentInitialization:
    """Tests for SwarmAgent initialization."""

    def test_agent_initialization_basic(self, sample_personality, sample_reflection_memory):
        """Test basic agent initialization."""
        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test Agent",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        assert agent.agent_id == "agent-123"
        assert agent.agent_name == "Test Agent"
        assert agent.personality["openness"] == 4.0
        assert agent.message_count == 0
        assert agent.last_spoke_turn == -1

    def test_agent_initialization_default_emotion(
        self, sample_personality, sample_reflection_memory
    ):
        """Test that default emotional state is neutral."""
        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test Agent",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        assert agent.emotional_state["primary_emotion"] == "neutral"
        assert agent.emotional_state["intensity"] == 0.3
        assert agent.emotional_state["valence"] == 0.0

    def test_agent_initialization_custom_emotion(
        self, sample_personality, sample_reflection_memory
    ):
        """Test agent with custom initial emotional state."""
        custom_emotion: EmotionalState = {
            "primary_emotion": "curious",
            "intensity": 0.7,
            "valence": 0.5,
            "arousal": 0.6,
            "narrative": "Excited to participate.",
        }

        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test Agent",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
            initial_emotion=custom_emotion,
        )

        assert agent.emotional_state["primary_emotion"] == "curious"
        assert agent.emotional_state["intensity"] == 0.7


class TestSwarmAgentFromInterview:
    """Tests for creating SwarmAgent from interview data."""

    def test_from_interview_data_basic(self, sample_interview):
        """Test creating agent from interview data."""
        agent = SwarmAgent.from_interview_data(sample_interview)

        assert agent.agent_name == "Alice Chen"
        assert agent.personality["openness"] == 4.0
        assert agent.reflection_memory["basic_facts"]["occupation"] == "Software Engineer"

    def test_from_interview_data_nested_personality(self):
        """Test handling nested personality structure."""
        interview = {
            "id": "int-456",
            "demographics": {"name": "Bob"},
            "personality": {
                "scores": {
                    "openness": 3.0,
                    "conscientiousness": 4.0,
                    "extroversion": 2.0,  # Alternative spelling
                    "agreeableness": 3.5,
                    "neuroticism": 1.5,
                }
            },
            "reflection_memory": {},
        }

        agent = SwarmAgent.from_interview_data(interview)

        assert agent.personality["extraversion"] == 2.0  # Handles extroversion spelling

    def test_from_interview_data_missing_fields(self):
        """Test handling missing optional fields."""
        interview = {
            "id": "int-789",
        }

        agent = SwarmAgent.from_interview_data(interview)

        # Should use defaults
        assert agent.personality["openness"] == 2.5
        assert "Participant-" in agent.agent_name


class TestSwarmAgentMemoryLoading:
    """Tests for isolated memory loading."""

    @patch("app.orchestration.persistent_memory.get_persistent_memory_store")
    def test_load_memories_success(
        self, mock_get_store, sample_personality, sample_reflection_memory
    ):
        """Test loading memories from Qdrant."""
        # Setup mock
        mock_store = MagicMock()
        mock_store.load_memories.return_value = [
            {
                "id": "mem-1",
                "content": "I prefer mobile apps",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "importance": 6.0,
                "memory_type": "observation",
                "embedding": [0.1] * 1536,
            }
        ]
        mock_get_store.return_value = mock_store

        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        count = agent.load_memories(limit=50)

        assert count == 1
        assert len(agent.memories) == 1
        assert agent.memories[0]["content"] == "I prefer mobile apps"
        mock_store.load_memories.assert_called_once_with(limit=50)

    @patch("app.orchestration.persistent_memory.get_persistent_memory_store")
    def test_load_memories_empty(
        self, mock_get_store, sample_personality, sample_reflection_memory
    ):
        """Test loading when no memories exist."""
        mock_store = MagicMock()
        mock_store.load_memories.return_value = []
        mock_get_store.return_value = mock_store

        agent = SwarmAgent(
            agent_id="agent-new",
            agent_name="New Agent",
            interview_id="int-new",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        count = agent.load_memories()

        assert count == 0
        assert len(agent.memories) == 0


class TestSwarmAgentResponseGeneration:
    """Tests for response generation."""

    @patch.object(app.swarm.swarm_agent, "get_llm_client")
    def test_generate_response_basic(
        self, mock_get_llm, sample_personality, sample_reflection_memory, mock_llm_client
    ):
        """Test basic response generation."""
        mock_get_llm.return_value = mock_llm_client

        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Alice",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        response = agent.generate_response(
            topic="What features matter in a language learning app?",
            conversation_history=[],
        )

        assert response == "This is a test response from the agent."
        mock_llm_client.complete.assert_called_once()

    @patch.object(app.swarm.swarm_agent, "get_llm_client")
    def test_generate_response_with_history(
        self, mock_get_llm, sample_personality, sample_reflection_memory, mock_llm_client
    ):
        """Test response generation with conversation history."""
        mock_get_llm.return_value = mock_llm_client

        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Alice",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        history: list[SwarmMessage] = [
            {
                "id": "msg-1",
                "turn_number": 1,
                "speaker_id": "agent-456",
                "speaker_name": "Bob",
                "content": "I think gamification is important.",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message_type": "dialogue",
            }
        ]

        response = agent.generate_response(
            topic="Language learning features",
            conversation_history=history,
        )

        # Check that history was included in prompt
        call_args = mock_llm_client.complete.call_args
        assert "Bob" in call_args[0][0]  # History in user prompt
        assert "gamification" in call_args[0][0]


class TestSwarmAgentPersonalityContext:
    """Tests for personality context building."""

    def test_build_personality_context_high_openness(
        self, sample_reflection_memory
    ):
        """Test personality context for high openness."""
        personality: PersonalityProfile = {
            "openness": 4.5,
            "conscientiousness": 2.5,
            "extraversion": 2.5,
            "agreeableness": 2.5,
            "neuroticism": 2.5,
        }

        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test",
            interview_id="int-123",
            personality=personality,
            reflection_memory=sample_reflection_memory,
        )

        ctx = agent._build_personality_context()

        assert "very high" in ctx.lower()
        assert "curious" in ctx.lower()

    def test_build_personality_context_low_extraversion(
        self, sample_reflection_memory
    ):
        """Test personality context for low extraversion."""
        personality: PersonalityProfile = {
            "openness": 2.5,
            "conscientiousness": 2.5,
            "extraversion": 0.5,
            "agreeableness": 2.5,
            "neuroticism": 2.5,
        }

        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test",
            interview_id="int-123",
            personality=personality,
            reflection_memory=sample_reflection_memory,
        )

        ctx = agent._build_personality_context()

        assert "very low" in ctx.lower()
        assert "reserved" in ctx.lower()


class TestSwarmAgentConversationFormatting:
    """Tests for conversation history formatting."""

    def test_format_empty_history(self, sample_personality, sample_reflection_memory):
        """Test formatting empty conversation history."""
        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        result = agent._format_conversation_history([])

        assert result == "(No previous conversation)"

    def test_format_conversation_history(
        self, sample_personality, sample_reflection_memory
    ):
        """Test formatting conversation with messages."""
        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Test",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )

        messages: list[SwarmMessage] = [
            {
                "id": "msg-1",
                "turn_number": 1,
                "speaker_id": "a1",
                "speaker_name": "Alice",
                "content": "Hello everyone!",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message_type": "dialogue",
            },
            {
                "id": "msg-2",
                "turn_number": 2,
                "speaker_id": "a2",
                "speaker_name": "Bob",
                "content": "Hi Alice!",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message_type": "dialogue",
            },
        ]

        result = agent._format_conversation_history(messages)

        assert "Alice: Hello everyone!" in result
        assert "Bob: Hi Alice!" in result


class TestSwarmAgentContext:
    """Tests for context conversion."""

    def test_to_context(self, sample_personality, sample_reflection_memory):
        """Test converting agent to SwarmAgentContext."""
        agent = SwarmAgent(
            agent_id="agent-123",
            agent_name="Alice",
            interview_id="int-123",
            personality=sample_personality,
            reflection_memory=sample_reflection_memory,
        )
        agent.message_count = 5
        agent.last_spoke_turn = 4

        ctx = agent.to_context()

        assert ctx["agent_id"] == "agent-123"
        assert ctx["agent_name"] == "Alice"
        assert ctx["message_count"] == 5
        assert ctx["last_spoke_turn"] == 4
        assert ctx["personality"]["openness"] == 4.0

    def test_from_context(self, sample_personality, sample_reflection_memory):
        """Test creating agent from SwarmAgentContext."""
        ctx: SwarmAgentContext = {
            "agent_id": "agent-456",
            "agent_name": "Bob",
            "interview_id": "int-456",
            "personality": sample_personality,
            "emotional_state": {
                "primary_emotion": "curious",
                "intensity": 0.6,
                "valence": 0.4,
                "arousal": 0.5,
                "narrative": "Feeling engaged.",
            },
            "reflection_memory": sample_reflection_memory,
            "memories": [],
            "message_count": 3,
            "last_spoke_turn": 2,
        }

        agent = SwarmAgent.from_context(ctx)

        assert agent.agent_id == "agent-456"
        assert agent.agent_name == "Bob"
        assert agent.message_count == 3
        assert agent.emotional_state["primary_emotion"] == "curious"


class TestCreateSwarmAgentFromInterview:
    """Tests for factory function."""

    @patch("app.orchestration.persistent_memory.get_persistent_memory_store")
    @patch("app.orchestration.llm_client.get_llm_client")
    def test_create_with_memory_loading(
        self, mock_get_llm, mock_get_store, sample_interview, mock_llm_client
    ):
        """Test factory function with memory loading."""
        mock_get_llm.return_value = mock_llm_client
        mock_store = MagicMock()
        mock_store.load_memories.return_value = [
            {
                "id": "mem-1",
                "content": "Test memory",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "importance": 5.0,
                "memory_type": "observation",
                "embedding": None,
            }
        ]
        mock_get_store.return_value = mock_store

        agent = create_swarm_agent_from_interview(
            sample_interview,
            load_memories=True,
            memory_limit=25,
        )

        assert agent.agent_name == "Alice Chen"
        assert len(agent.memories) == 1
        mock_store.load_memories.assert_called_once_with(limit=25)

    def test_create_without_memory_loading(self, sample_interview):
        """Test factory function without memory loading."""
        agent = create_swarm_agent_from_interview(
            sample_interview,
            load_memories=False,
        )

        assert agent.agent_name == "Alice Chen"
        assert len(agent.memories) == 0
