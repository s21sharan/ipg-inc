"""
Tests for the LangGraph orchestration module.

Tests the agent cognitive architecture including:
- Agent state initialization
- Memory stream with retrieval scoring
- Individual nodes (observe, plan, act, reflect)
- Graph compilation and execution
- AgentOrchestrator workflow
"""

import pytest
from unittest.mock import MagicMock, patch, PropertyMock
import numpy as np

# ============================================================
# Fixtures
# ============================================================


@pytest.fixture
def mock_llm_client():
    """Mock LLM client for testing without API calls."""
    with patch("app.orchestration.llm_client.get_settings") as mock_settings:
        mock_settings.return_value = MagicMock(openai_api_key="test-key")

        with patch("app.orchestration.llm_client.OpenAI") as MockOpenAI, \
             patch("app.orchestration.llm_client.ChatOpenAI") as MockChatOpenAI:

            # Mock OpenAI client
            mock_openai = MagicMock()

            # Mock embeddings
            mock_embedding_response = MagicMock()
            mock_embedding_data = MagicMock()
            mock_embedding_data.embedding = [0.1] * 1536
            mock_embedding_response.data = [mock_embedding_data]
            mock_openai.embeddings.create.return_value = mock_embedding_response

            # Mock chat completions
            mock_completion = MagicMock()
            mock_message = MagicMock()
            mock_message.content = "This is a test response."
            mock_completion.choices = [MagicMock(message=mock_message)]
            mock_openai.chat.completions.create.return_value = mock_completion

            MockOpenAI.return_value = mock_openai

            # Mock ChatOpenAI
            mock_chat = MagicMock()
            MockChatOpenAI.return_value = mock_chat

            yield {
                "openai": mock_openai,
                "chat": mock_chat,
            }


@pytest.fixture
def sample_personality():
    """Sample Big Five personality profile."""
    return {
        "openness": 4.2,
        "conscientiousness": 3.8,
        "extraversion": 2.5,
        "agreeableness": 3.9,
        "neuroticism": 2.1,
    }


@pytest.fixture
def sample_emotional_state():
    """Sample emotional state."""
    return {
        "primary_emotion": "curiosity",
        "intensity": 0.6,
        "valence": 0.3,
        "arousal": 0.5,
        "narrative": "Feeling curious about the topic being discussed.",
    }


@pytest.fixture
def sample_reflection_memory():
    """Sample reflection memory from interview."""
    return {
        "basic_facts": {
            "occupation": "Software Developer",
            "age": "28",
            "location": "San Francisco",
        },
        "goals_and_aspirations": {
            "career": "Become a tech lead",
            "learning": "Master AI/ML",
        },
        "pain_points_and_frustrations": {
            "current_problems": [
                "Too many meetings",
                "Legacy codebase",
                "Unclear requirements",
            ]
        },
        "product_attitudes": {
            "favorite_tools": ["VS Code", "GitHub Copilot"],
        },
        "communication_style": {
            "preference": "Direct and concise",
        },
    }


@pytest.fixture
def sample_agent_state(sample_personality, sample_emotional_state, sample_reflection_memory):
    """Sample complete agent state for testing."""
    return {
        "agent_id": "agent-test-123",
        "agent_name": "Test Agent",
        "personality": sample_personality,
        "emotional_state": sample_emotional_state,
        "reflection_memory": sample_reflection_memory,
        "memory_stream": [],
        "retrieved_memories": [],
        "current_observation": "What do you think about the product?",
        "current_plan": "",
        "current_action": "",
        "action_result": "",
        "importance_accumulator": 0.0,
        "reflection_threshold": 50.0,
        "last_reflection_time": "",
        "conversation_history": [],
        "campaign_context": {
            "title": "Test Campaign",
            "topics": [
                {"type": "statement", "content": "Welcome to the interview."},
                {"type": "question", "question": "What do you think?"},
            ],
        },
        "iteration_count": 0,
        "max_iterations": 20,
        "should_terminate": False,
    }


@pytest.fixture
def sample_workflow_input():
    """Sample workflow input for orchestrator tests."""
    return {
        "agent_id": "agent-test-456",
        "agent_name": "Alice",
        "interview_data": {
            "transcript": [
                {"question": "How are you?", "answer": "I'm doing well!"},
                {"question": "What do you do?", "answer": "I'm a developer."},
            ],
            "personality": {
                "openness": 4.0,
                "conscientiousness": 3.5,
                "extraversion": 3.0,
                "agreeableness": 4.0,
                "neuroticism": 2.0,
            },
            "reflection_memory": {
                "basic_facts": {"occupation": "Developer"},
                "pain_points_and_frustrations": {
                    "current_problems": ["Too many meetings"]
                },
            },
        },
        "campaign": {
            "title": "Product Feedback",
            "topics": [
                {"type": "statement", "content": "Thanks for joining!"},
                {
                    "type": "question",
                    "question": "What's your experience?",
                    "probeQuestions": "Can you elaborate?\nWhy do you feel that way?",
                },
            ],
        },
        "initial_observation": "Hello! Thanks for joining our interview today.",
    }


# ============================================================
# Agent State Tests
# ============================================================


class TestAgentState:
    """Tests for agent state definitions."""

    def test_personality_profile_structure(self, sample_personality):
        """Test that personality profile has all OCEAN dimensions."""
        assert "openness" in sample_personality
        assert "conscientiousness" in sample_personality
        assert "extraversion" in sample_personality
        assert "agreeableness" in sample_personality
        assert "neuroticism" in sample_personality

    def test_personality_scores_valid_range(self, sample_personality):
        """Test that personality scores are in valid 0-5 range."""
        for trait, score in sample_personality.items():
            assert 0.0 <= score <= 5.0, f"{trait} score out of range"

    def test_emotional_state_structure(self, sample_emotional_state):
        """Test emotional state has all required fields."""
        assert "primary_emotion" in sample_emotional_state
        assert "intensity" in sample_emotional_state
        assert "valence" in sample_emotional_state
        assert "arousal" in sample_emotional_state
        assert "narrative" in sample_emotional_state

    def test_agent_state_complete(self, sample_agent_state):
        """Test agent state has all required fields for workflow."""
        required_fields = [
            "agent_id", "agent_name", "personality", "emotional_state",
            "reflection_memory", "memory_stream", "current_observation",
            "current_plan", "current_action", "importance_accumulator",
            "reflection_threshold", "conversation_history", "campaign_context",
            "iteration_count", "max_iterations", "should_terminate",
        ]
        for field in required_fields:
            assert field in sample_agent_state, f"Missing field: {field}"


# ============================================================
# Memory Stream Tests
# ============================================================


class TestMemoryStream:
    """Tests for memory stream retrieval function."""

    def test_memory_stream_initialization(self, mock_llm_client):
        """Test memory stream can be initialized."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test-agent")
        assert stream.agent_id == "test-agent"
        assert len(stream) == 0

    def test_add_memory(self, mock_llm_client):
        """Test adding a memory to the stream."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test-agent")
        memory = stream.add_memory(
            content="Had an interesting conversation",
            memory_type="observation",
            importance=5.0,
            embedding=[0.1] * 1536,
        )

        assert len(stream) == 1
        assert memory["content"] == "Had an interesting conversation"
        assert memory["memory_type"] == "observation"
        assert memory["importance"] == 5.0

    def test_memory_has_required_fields(self, mock_llm_client):
        """Test that created memories have all required fields."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test-agent")
        memory = stream.add_memory(
            content="Test memory",
            importance=5.0,
            embedding=[0.1] * 1536,
        )

        assert "id" in memory
        assert "content" in memory
        assert "timestamp" in memory
        assert "importance" in memory
        assert "memory_type" in memory
        assert "embedding" in memory

    def test_recency_calculation(self, mock_llm_client):
        """Test recency score calculation."""
        from app.orchestration.memory_stream import MemoryStream
        from datetime import datetime, timezone

        stream = MemoryStream(agent_id="test-agent")

        now = datetime.now(timezone.utc)

        # Recent timestamp should have high recency
        recent_score = stream._calculate_recency(now.isoformat(), now)
        assert recent_score > 0.9

    def test_relevance_calculation(self, mock_llm_client):
        """Test relevance (cosine similarity) calculation."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test-agent")

        # Identical vectors should have max similarity
        vec_a = [1.0, 0.0, 0.0]
        vec_b = [1.0, 0.0, 0.0]
        similarity = stream._calculate_relevance(vec_a, vec_b)
        assert similarity == pytest.approx(1.0, abs=0.01)

        # Orthogonal vectors should have 0.5 (normalized from 0)
        vec_c = [1.0, 0.0, 0.0]
        vec_d = [0.0, 1.0, 0.0]
        similarity = stream._calculate_relevance(vec_c, vec_d)
        assert similarity == pytest.approx(0.5, abs=0.01)

    def test_retrieve_returns_sorted(self, mock_llm_client):
        """Test that retrieve returns memories sorted by score."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test-agent")

        # Add memories with different importance
        stream.add_memory("Low importance", importance=2.0, embedding=[0.1] * 1536)
        stream.add_memory("High importance", importance=9.0, embedding=[0.1] * 1536)
        stream.add_memory("Medium importance", importance=5.0, embedding=[0.1] * 1536)

        # Mock the embedding generation for query
        with patch.object(stream._llm_client, 'generate_embedding', return_value=[0.1] * 1536):
            retrieved = stream.retrieve("test query", k=3)

        assert len(retrieved) == 3

    def test_memory_pruning(self, mock_llm_client):
        """Test that old memories are pruned when max is exceeded."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test-agent", max_memories=5)

        # Add more than max memories
        for i in range(10):
            stream.add_memory(
                f"Memory {i}",
                importance=5.0,
                embedding=[0.1] * 1536,
            )

        assert len(stream) == 5
        # Should keep the most recent
        assert stream.memories[-1]["content"] == "Memory 9"


# ============================================================
# LLM Client Tests
# ============================================================


class TestLLMClient:
    """Tests for LLM client wrapper."""

    def test_singleton_pattern(self, mock_llm_client):
        """Test that LLMClient uses singleton pattern."""
        from app.orchestration.llm_client import LLMClient

        # Clear any existing instance
        LLMClient._instance = None
        LLMClient._openai_client = None
        LLMClient._chat_model = None

        client1 = LLMClient()
        client2 = LLMClient()

        assert client1 is client2

    def test_get_llm_client_cached(self, mock_llm_client):
        """Test that get_llm_client returns cached instance."""
        from app.orchestration.llm_client import get_llm_client, LLMClient

        # Clear cache and instance
        get_llm_client.cache_clear()
        LLMClient._instance = None

        client1 = get_llm_client()
        client2 = get_llm_client()

        assert client1 is client2


# ============================================================
# Node Tests
# ============================================================


class TestNodes:
    """Tests for LangGraph node implementations."""

    def test_observe_node_updates_emotion(self, mock_llm_client, sample_agent_state):
        """Test that observe node updates emotional state."""
        from app.orchestration.nodes import observe_node

        # Mock the LLM response for emotional update
        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            mock_client.complete.return_value = '''{"primary_emotion": "interested", "intensity": 0.7, "valence": 0.4, "arousal": 0.5, "narrative": "Feeling interested in this topic."}'''
            mock_client.score_importance.return_value = 5.0
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            result = observe_node(sample_agent_state)

        assert "emotional_state" in result
        assert result["emotional_state"]["primary_emotion"] == "interested"

    def test_observe_node_creates_memory(self, mock_llm_client, sample_agent_state):
        """Test that observe node creates observation memory."""
        from app.orchestration.nodes import observe_node

        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            mock_client.complete.return_value = '''{"primary_emotion": "neutral", "intensity": 0.5, "valence": 0.0, "arousal": 0.3, "narrative": "Processing the observation."}'''
            mock_client.score_importance.return_value = 4.0
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            result = observe_node(sample_agent_state)

        assert "memory_stream" in result
        assert len(result["memory_stream"]) == 1
        assert result["memory_stream"][0]["memory_type"] == "observation"

    def test_plan_node_generates_plan(self, mock_llm_client, sample_agent_state):
        """Test that plan node generates an intention."""
        from app.orchestration.nodes import plan_node

        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            mock_client.complete.return_value = "I plan to share my honest thoughts about the product."
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            result = plan_node(sample_agent_state)

        assert "current_plan" in result
        assert len(result["current_plan"]) > 0

    def test_act_node_generates_response(self, mock_llm_client, sample_agent_state):
        """Test that act node generates a response."""
        from app.orchestration.nodes import act_node

        sample_agent_state["current_plan"] = "I want to express my positive feelings."

        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            mock_client.complete.return_value = "I really like the product because it saves me time."
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            result = act_node(sample_agent_state)

        assert "current_action" in result
        assert len(result["current_action"]) > 0
        assert "conversation_history" in result
        assert result["iteration_count"] == 1

    def test_reflect_node_generates_insights(self, mock_llm_client, sample_agent_state):
        """Test that reflect node generates high-level insights."""
        from app.orchestration.nodes import reflect_node

        # Add some memories to reflect on
        sample_agent_state["memory_stream"] = [
            {"content": "Discussed product features", "importance": 6.0, "memory_type": "observation"},
            {"content": "Expressed frustration with pricing", "importance": 7.0, "memory_type": "observation"},
            {"content": "Mentioned liking the interface", "importance": 5.0, "memory_type": "observation"},
        ]

        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            mock_client.complete.return_value = """Insight: I am becoming more price-conscious in my purchasing decisions.
Insight: I tend to value user experience highly in products I use."""
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            result = reflect_node(sample_agent_state)

        assert "memory_stream" in result
        assert result["importance_accumulator"] == 0.0  # Reset after reflection
        # Should have created reflection memories
        reflections = [m for m in result["memory_stream"] if m["memory_type"] == "reflection"]
        assert len(reflections) >= 1

    def test_should_reflect_threshold(self, sample_agent_state):
        """Test reflection triggering based on importance threshold."""
        from app.orchestration.nodes import should_reflect

        # Below threshold
        sample_agent_state["importance_accumulator"] = 30.0
        sample_agent_state["reflection_threshold"] = 50.0
        assert should_reflect(sample_agent_state) == "continue"

        # Above threshold
        sample_agent_state["importance_accumulator"] = 60.0
        assert should_reflect(sample_agent_state) == "reflect"


# ============================================================
# Graph Tests
# ============================================================


class TestAgentGraph:
    """Tests for LangGraph workflow."""

    def test_graph_creation(self, mock_llm_client):
        """Test that the agent graph can be created."""
        from app.orchestration.graph import create_agent_graph

        graph = create_agent_graph()
        assert graph is not None

    def test_orchestrator_initialization(self, mock_llm_client):
        """Test AgentOrchestrator can be initialized."""
        from app.orchestration.graph import AgentOrchestrator

        orchestrator = AgentOrchestrator(
            reflection_threshold=50.0,
            max_iterations=10,
        )

        assert orchestrator.reflection_threshold == 50.0
        assert orchestrator.max_iterations == 10
        assert orchestrator.graph is not None

    def test_orchestrator_state_initialization(self, mock_llm_client, sample_workflow_input):
        """Test that orchestrator properly initializes agent state."""
        from app.orchestration.graph import AgentOrchestrator

        orchestrator = AgentOrchestrator()
        state = orchestrator.initialize_state(sample_workflow_input)

        assert state["agent_id"] == "agent-test-456"
        assert state["agent_name"] == "Alice"
        assert "personality" in state
        assert state["personality"]["openness"] == 4.0
        assert "emotional_state" in state
        assert "reflection_memory" in state
        assert len(state["memory_stream"]) > 0  # Should have initial memories

    def test_orchestrator_initial_memories_from_transcript(self, mock_llm_client, sample_workflow_input):
        """Test that initial memories are created from interview transcript."""
        from app.orchestration.graph import AgentOrchestrator

        orchestrator = AgentOrchestrator()
        state = orchestrator.initialize_state(sample_workflow_input)

        # Should have memories from the 2 transcript entries
        assert len(state["memory_stream"]) == 2

        # Memories should reference past interview content
        memory_contents = [m["content"] for m in state["memory_stream"]]
        assert any("How are you" in c for c in memory_contents)


# ============================================================
# Integration Tests
# ============================================================


class TestOrchestrationIntegration:
    """Integration tests for the complete orchestration flow."""

    def test_single_turn_execution(self, mock_llm_client, sample_workflow_input):
        """Test running a single turn of the cognitive loop."""
        from app.orchestration.graph import AgentOrchestrator

        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            mock_client.complete.return_value = "I think the product is interesting."
            mock_client.score_importance.return_value = 5.0
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            orchestrator = AgentOrchestrator(max_iterations=1)
            state = orchestrator.initialize_state(sample_workflow_input)

            # Mock graph invoke to avoid full execution
            with patch.object(orchestrator.graph, 'invoke') as mock_invoke:
                mock_invoke.return_value = {
                    **state,
                    "current_action": "I think the product is interesting.",
                    "conversation_history": [
                        {"question": "Hello!", "answer": "I think the product is interesting."}
                    ],
                }

                updated_state, response = orchestrator.run_single_turn(
                    state,
                    "What do you think?"
                )

            assert response == "I think the product is interesting."

    def test_memory_stream_to_list_from_list(self, mock_llm_client):
        """Test memory stream serialization and deserialization."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test")

        # Add memories
        stream.add_memory("Memory 1", importance=5.0, embedding=[0.1] * 1536)
        stream.add_memory("Memory 2", importance=6.0, embedding=[0.2] * 1536)

        # Export
        memories_list = stream.to_list()
        assert len(memories_list) == 2

        # Create new stream and import
        new_stream = MemoryStream(agent_id="test2")
        new_stream.from_list(memories_list)

        assert len(new_stream) == 2
        assert new_stream.memories[0]["content"] == "Memory 1"


# ============================================================
# Edge Cases
# ============================================================


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_empty_memory_stream_retrieve(self, mock_llm_client):
        """Test retrieval from empty memory stream."""
        from app.orchestration.memory_stream import MemoryStream

        stream = MemoryStream(agent_id="test")

        with patch.object(stream._llm_client, 'generate_embedding', return_value=[0.1] * 1536):
            retrieved = stream.retrieve("test query", k=5)

        assert retrieved == []

    def test_missing_personality_defaults(self, mock_llm_client):
        """Test that missing personality scores get defaults."""
        from app.orchestration.graph import AgentOrchestrator

        workflow_input = {
            "agent_id": "test",
            "agent_name": "Test",
            "interview_data": {
                "transcript": [],
                "personality": {},  # Empty personality
                "reflection_memory": {},
            },
            "campaign": {"topics": []},
            "initial_observation": "Hello",
        }

        orchestrator = AgentOrchestrator()
        state = orchestrator.initialize_state(workflow_input)

        # Should have default personality values (2.5)
        assert state["personality"]["openness"] == 2.5
        assert state["personality"]["conscientiousness"] == 2.5

    def test_malformed_emotional_response_fallback(self, mock_llm_client, sample_agent_state):
        """Test fallback when LLM returns malformed emotional response."""
        from app.orchestration.nodes import observe_node

        with patch("app.orchestration.nodes.get_llm_client") as mock_get_llm:
            mock_client = MagicMock()
            # Return invalid JSON
            mock_client.complete.return_value = "This is not valid JSON"
            mock_client.score_importance.return_value = 5.0
            mock_client.generate_embedding.return_value = [0.1] * 1536
            mock_get_llm.return_value = mock_client

            result = observe_node(sample_agent_state)

        # Should fall back to existing emotional state
        assert result["emotional_state"]["primary_emotion"] == sample_agent_state["emotional_state"]["primary_emotion"]
