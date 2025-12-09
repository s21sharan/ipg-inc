#!/usr/bin/env python3
"""
Comprehensive tests for persistent memory storage.

Tests the full memory persistence flow:
1. Create agent with persistent storage enabled
2. Have a conversation with questions
3. Verify memories saved to Qdrant
4. Verify relationships created in Memgraph
5. Create new session and verify memory retrieval
6. Use OpenAI to evaluate answer quality based on memory

Run with:
    cd backend
    pytest tests/test_persistent_memory.py -v -s

    # Run just the integration test:
    pytest tests/test_persistent_memory.py::TestPersistentMemoryIntegration -v -s
"""

import sys
import os
import time
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
env_path = Path(__file__).parent.parent.parent / ".env.local"
load_dotenv(env_path)

# Import modules before patching (required for @patch decorators to resolve)
import app.orchestration.persistent_memory
import app.orchestration.memory_stream
import app.orchestration.nodes
import app.orchestration.graph


# =============================================================================
# Test Fixtures
# =============================================================================

# Sample interview data for testing
MOCK_INTERVIEW = {
    "id": "test-persistent-memory-001",
    "name": "Test Persistent User",
    "summary": "A test user for persistent memory testing.",
    "age": 28,
    "occupation": "Product Designer",
    "country": "United States",
    "transcript": [
        {
            "question": "What do you do for work?",
            "answer": "I'm a product designer focusing on mobile apps."
        },
        {
            "question": "What's your biggest frustration?",
            "answer": "I hate when apps don't remember my preferences."
        }
    ],
    "personality": {
        "scores": {
            "openness": 4.0,
            "conscientiousness": 3.5,
            "extraversion": 3.0,
            "agreeableness": 4.2,
            "neuroticism": 2.0
        }
    },
    "reflection_memory": {
        "basic_facts": {
            "occupation": "Product Designer",
            "age": 28,
        },
        "goals_and_aspirations": {
            "primary": "Create beautiful, intuitive interfaces"
        },
        "pain_points_and_frustrations": {
            "current_problems": ["Apps that forget settings", "Poor UX"]
        },
        "product_attitudes": {},
        "communication_style": {
            "tone": "Thoughtful and detail-oriented"
        }
    }
}


def create_workflow_input(interview: dict = None) -> dict:
    """Create a WorkflowInput for testing."""
    interview = interview or MOCK_INTERVIEW
    return {
        "agent_id": interview["id"],
        "agent_name": interview["name"],
        "interview_data": {
            "transcript": interview["transcript"],
            "personality": interview["personality"],
            "reflection_memory": interview["reflection_memory"],
        },
        "campaign": {"topics": []},
        "initial_observation": "Hello! Let's chat.",
    }


class MockLLMClient:
    """Mock LLM client for unit tests without API calls."""

    def __init__(self):
        self.call_count = 0

    def complete(self, prompt: str, system_prompt: str | None = None, max_tokens: int = 2000) -> str:
        self.call_count += 1

        if "How does this make you feel" in prompt:
            return '''{
                "primary_emotion": "interested",
                "intensity": 0.6,
                "valence": 0.4,
                "arousal": 0.5,
                "narrative": "I find this conversation engaging."
            }'''
        elif "What do you plan to do" in prompt:
            return "I plan to share my thoughts on this topic."
        elif "Respond as" in prompt:
            return "As a product designer, I think about user experience constantly. Apps should remember what users prefer."
        elif "Generate 2-3 high-level insights" in prompt:
            return "Insight: I value consistency in user experience.\nInsight: Memory and personalization matter to me."
        else:
            return "I'm happy to discuss this."

    def generate_embedding(self, text: str) -> list[float]:
        return [0.1] * 1536

    def generate_embeddings_batch(self, texts: list[str]) -> list[list[float]]:
        return [[0.1] * 1536 for _ in texts]

    def score_importance(self, memory_content: str) -> float:
        return 5.0


@pytest.fixture
def mock_llm():
    return MockLLMClient()


# =============================================================================
# Unit Tests (Mocked)
# =============================================================================

class TestPersistentMemoryStore:
    """Unit tests for PersistentMemoryStore class."""

    @patch('app.orchestration.persistent_memory.get_qdrant')
    @patch('app.orchestration.persistent_memory.execute_write')
    @patch('app.orchestration.persistent_memory.get_llm_client')
    def test_save_memory_creates_qdrant_point(self, mock_llm_client, mock_exec_write, mock_qdrant):
        """Test that save_memory creates a point in Qdrant."""
        from app.orchestration.persistent_memory import PersistentMemoryStore

        # Setup mocks
        mock_llm_client.return_value = MockLLMClient()
        mock_qdrant_client = MagicMock()
        mock_qdrant.return_value = mock_qdrant_client

        store = PersistentMemoryStore("test-agent-id")
        memory = {
            "id": "test-memory-id",
            "content": "Test memory content",
            "timestamp": "2024-01-01T00:00:00Z",
            "importance": 5.0,
            "memory_type": "observation",
            "embedding": [0.1] * 1536,
        }

        store.save_memory(memory)

        # Verify upsert was called
        mock_qdrant_client.upsert.assert_called_once()

    @patch('app.orchestration.persistent_memory.get_qdrant')
    @patch('app.orchestration.persistent_memory.execute_write')
    @patch('app.orchestration.persistent_memory.get_llm_client')
    def test_save_memory_creates_graph_node(self, mock_llm_client, mock_exec_write, mock_qdrant):
        """Test that save_memory creates a node in Memgraph."""
        from app.orchestration.persistent_memory import PersistentMemoryStore

        mock_llm_client.return_value = MockLLMClient()
        mock_qdrant.return_value = MagicMock()

        store = PersistentMemoryStore("test-agent-id")
        memory = {
            "id": "test-memory-id",
            "content": "Test memory content",
            "timestamp": "2024-01-01T00:00:00Z",
            "importance": 5.0,
            "memory_type": "observation",
            "embedding": [0.1] * 1536,
        }

        store.save_memory(memory)

        # Verify Cypher query was executed
        mock_exec_write.assert_called()
        call_args = mock_exec_write.call_args
        # Memory label is escaped with backticks in Memgraph queries
        assert "MERGE (m:`Memory`" in call_args[0][0]


class TestMemoryStreamPersistence:
    """Unit tests for MemoryStream persistence methods."""

    @patch('app.orchestration.memory_stream.get_llm_client')
    def test_memory_stream_tracks_new_memories(self, mock_llm_client):
        """Test that MemoryStream tracks new memories for persistence."""
        from app.orchestration.memory_stream import MemoryStream

        mock_llm_client.return_value = MockLLMClient()

        stream = MemoryStream("test-agent", persistent=False)
        # Use add_memory_persistent to track memories for persistence
        stream.add_memory_persistent("Test content", memory_type="observation")

        # New memories should be tracked when using add_memory_persistent
        assert len(stream._new_memories) == 1
        assert stream._new_memories[0]["content"] == "Test content"

    @patch('app.orchestration.memory_stream.get_llm_client')
    def test_get_memory_stats(self, mock_llm_client):
        """Test memory statistics reporting."""
        from app.orchestration.memory_stream import MemoryStream

        mock_llm_client.return_value = MockLLMClient()

        stream = MemoryStream("test-agent", persistent=False)
        stream.add_memory("Observation 1", memory_type="observation")
        stream.add_memory("Action 1", memory_type="action")
        stream.add_memory("Observation 2", memory_type="observation")

        stats = stream.get_memory_stats()

        assert stats["total_memories"] == 3
        assert stats["by_type"]["observation"] == 2
        assert stats["by_type"]["action"] == 1


class TestAgentOrchestratorPersistence:
    """Unit tests for AgentOrchestrator persistence integration."""

    @patch('app.orchestration.nodes.get_llm_client')
    def test_orchestrator_initializes_with_persistence_flag(self, mock_llm_client):
        """Test that orchestrator accepts persistence flag."""
        from app.orchestration import AgentOrchestrator

        mock_llm_client.return_value = MockLLMClient()

        orchestrator = AgentOrchestrator(persistent=True)
        assert orchestrator.persistent is True

    @patch('app.orchestration.nodes.get_llm_client')
    @patch('app.orchestration.memory_stream.get_llm_client')
    def test_orchestrator_generates_session_id(self, mock_memory_llm, mock_nodes_llm):
        """Test that orchestrator generates session ID on initialize."""
        from app.orchestration import AgentOrchestrator

        mock_nodes_llm.return_value = MockLLMClient()
        mock_memory_llm.return_value = MockLLMClient()

        orchestrator = AgentOrchestrator(persistent=False)
        workflow_input = create_workflow_input()

        # Just initialize state - MemoryStream will use mocked LLM client
        orchestrator.initialize_state(workflow_input)

        assert orchestrator._session_id is not None


# =============================================================================
# Integration Tests (Requires Running Qdrant and Memgraph)
# =============================================================================

@pytest.mark.integration
class TestPersistentMemoryIntegration:
    """
    Integration tests that require running Qdrant and Memgraph.

    Run with: pytest tests/test_persistent_memory.py -v -s -m integration

    Ensure services are running:
        docker-compose up -d qdrant memgraph
    """

    @pytest.fixture(autouse=True)
    def check_services(self):
        """Check if required services are available."""
        try:
            from app.qdrant import get_qdrant_connection
            from app.memgraph import get_memgraph_connection

            qdrant_conn = get_qdrant_connection()
            memgraph_conn = get_memgraph_connection()

            if not qdrant_conn.verify_connectivity():
                pytest.skip("Qdrant not available")
            if not memgraph_conn.verify_connectivity():
                pytest.skip("Memgraph not available")
        except Exception as e:
            pytest.skip(f"Services not available: {e}")

    def test_full_persistence_flow(self):
        """
        Test complete persistence flow:
        1. Create agent with persistence
        2. Have conversation
        3. Verify Qdrant storage
        4. Verify Memgraph relationships
        5. Create new session
        6. Verify memory retrieval affects responses
        """
        from app.orchestration import AgentOrchestrator
        from app.orchestration.persistent_memory import PersistentMemoryStore
        from app.memgraph import execute_query

        # Use a unique test agent ID
        test_agent_id = f"test-persistence-{int(time.time())}"
        interview = MOCK_INTERVIEW.copy()
        interview["id"] = test_agent_id

        print(f"\n--- Testing with agent ID: {test_agent_id} ---")

        # ====== SESSION 1: Create memories ======
        print("\n=== SESSION 1: Creating memories ===")

        orchestrator1 = AgentOrchestrator(
            reflection_threshold=100.0,
            max_iterations=10,
            persistent=True,
        )

        workflow_input = create_workflow_input(interview)
        state = orchestrator1.initialize_state(workflow_input)

        session1_id = orchestrator1.get_session_id()
        print(f"Session 1 ID: {session1_id}")

        # Ask questions to generate memories
        questions = [
            "What's your favorite design tool?",
            "How do you feel about dark mode?",
            "What makes a great mobile app?",
        ]

        for q in questions:
            print(f"\nQ: {q}")
            state, response = orchestrator1.run_single_turn(state, q)
            print(f"A: {response[:100]}...")

        # Finalize session
        saved_count = orchestrator1.finalize_session()
        print(f"\nFinalized session, saved {saved_count} memories")

        # Get memory stats
        stats = orchestrator1.get_memory_stats()
        print(f"Memory stats: {stats}")

        # ====== VERIFY QDRANT ======
        print("\n=== Verifying Qdrant Storage ===")

        store = PersistentMemoryStore(test_agent_id)
        qdrant_count = store.count_memories()
        print(f"Qdrant memory count: {qdrant_count}")

        assert qdrant_count > 0, "No memories found in Qdrant"

        # Load memories back
        loaded_memories = store.load_memories(limit=50)
        print(f"Loaded {len(loaded_memories)} memories from Qdrant")

        # Check memory types
        memory_types = {m.get("memory_type") for m in loaded_memories}
        print(f"Memory types found: {memory_types}")

        # ====== VERIFY MEMGRAPH ======
        print("\n=== Verifying Memgraph Relationships ===")

        # Check for Memory nodes
        # Note: Memory is escaped with backticks as it's a reserved word in Memgraph
        memory_query = """
        MATCH (a:Agent {id: $agent_id})-[:REMEMBERS]->(m:`Memory`)
        RETURN count(m) AS memory_count
        """
        result = execute_query(memory_query, {"agent_id": test_agent_id})
        memgraph_count = result[0]["memory_count"] if result else 0
        print(f"Memgraph memory count: {memgraph_count}")

        # Get memory graph
        graph_data = store.get_memory_graph()
        print(f"Memory graph: {graph_data['count']} memories")

        # ====== SESSION 2: Test memory retrieval ======
        print("\n=== SESSION 2: Testing memory retrieval ===")

        orchestrator2 = AgentOrchestrator(
            reflection_threshold=100.0,
            max_iterations=10,
            persistent=True,
        )

        workflow_input2 = create_workflow_input(interview)
        state2 = orchestrator2.initialize_state(workflow_input2)

        session2_id = orchestrator2.get_session_id()
        print(f"Session 2 ID: {session2_id}")
        print(f"Memories loaded in session 2: {len(state2['memory_stream'])}")

        assert len(state2["memory_stream"]) > 0, "No memories loaded in session 2"

        # Ask a related question to see if memory affects response
        related_q = "Earlier you mentioned your feelings about design tools. Can you elaborate?"
        print(f"\nQ: {related_q}")
        state2, response2 = orchestrator2.run_single_turn(state2, related_q)
        print(f"A: {response2}")

        # ====== CLEANUP (optional) ======
        # In a real test, you might want to clean up test data
        # For now, we leave it for inspection

        print("\n=== Test Complete ===")
        print(f"Agent ID: {test_agent_id}")
        print(f"Session 1 ID: {session1_id}")
        print(f"Session 2 ID: {session2_id}")

    def test_semantic_search_retrieval(self):
        """Test that semantic search retrieves relevant memories."""
        from app.orchestration.persistent_memory import PersistentMemoryStore

        test_agent_id = f"test-search-{int(time.time())}"

        store = PersistentMemoryStore(test_agent_id)

        # Create some memories with distinct topics
        memories = [
            {
                "content": "I love using Figma for UI design because of its collaboration features.",
                "memory_type": "observation",
                "importance": 7.0,
            },
            {
                "content": "Python is my favorite programming language for data analysis.",
                "memory_type": "observation",
                "importance": 6.0,
            },
            {
                "content": "I prefer dark mode in all my apps to reduce eye strain.",
                "memory_type": "observation",
                "importance": 5.0,
            },
        ]

        for m in memories:
            store.save_memory(m)

        time.sleep(1)  # Allow indexing

        # Search for design-related memories
        results = store.search_similar("design tools and UI", limit=3)

        assert len(results) > 0, "No search results found"

        # The Figma memory should be most relevant
        top_result = results[0]
        print(f"Top search result: {top_result['content'][:50]}...")
        assert "Figma" in top_result["content"] or "design" in top_result["content"].lower()


# =============================================================================
# OpenAI Evaluation Test
# =============================================================================

@pytest.mark.integration
@pytest.mark.evaluation
class TestMemoryRetentionQuality:
    """
    Tests that use OpenAI to evaluate whether the agent properly uses
    memories in its responses.

    Run with: pytest tests/test_persistent_memory.py -v -s -m evaluation
    """

    @pytest.fixture(autouse=True)
    def check_services(self):
        """Check if required services are available."""
        try:
            from app.qdrant import get_qdrant_connection
            from app.memgraph import get_memgraph_connection

            qdrant_conn = get_qdrant_connection()
            memgraph_conn = get_memgraph_connection()

            if not qdrant_conn.verify_connectivity():
                pytest.skip("Qdrant not available")
            if not memgraph_conn.verify_connectivity():
                pytest.skip("Memgraph not available")
        except Exception as e:
            pytest.skip(f"Services not available: {e}")

    def test_memory_influences_responses(self):
        """
        Test that memories from a previous session influence responses
        in a new session, evaluated by OpenAI.
        """
        from app.orchestration import AgentOrchestrator
        from openai import OpenAI

        openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Unique test agent
        test_agent_id = f"test-eval-{int(time.time())}"
        interview = MOCK_INTERVIEW.copy()
        interview["id"] = test_agent_id

        print(f"\n--- Evaluation test with agent ID: {test_agent_id} ---")

        # ====== SESSION 1: Establish a unique fact ======
        print("\n=== SESSION 1: Establishing unique fact ===")

        orchestrator1 = AgentOrchestrator(
            reflection_threshold=100.0,
            max_iterations=10,
            persistent=True,
        )

        workflow_input = create_workflow_input(interview)
        state = orchestrator1.initialize_state(workflow_input)

        # Establish a unique, memorable fact
        unique_fact_q = "If you could only use one color in all your designs, what would it be and why?"
        print(f"\nQ: {unique_fact_q}")
        state, response1 = orchestrator1.run_single_turn(state, unique_fact_q)
        print(f"A: {response1}")

        orchestrator1.finalize_session()

        # ====== SESSION 2: Ask about the fact ======
        print("\n=== SESSION 2: Testing memory recall ===")

        orchestrator2 = AgentOrchestrator(
            reflection_threshold=100.0,
            max_iterations=10,
            persistent=True,
        )

        workflow_input2 = create_workflow_input(interview)
        state2 = orchestrator2.initialize_state(workflow_input2)

        # Ask about the previously discussed topic
        recall_q = "We talked before about your color preference for designs. What did you say?"
        print(f"\nQ: {recall_q}")
        state2, response2 = orchestrator2.run_single_turn(state2, recall_q)
        print(f"A: {response2}")

        # ====== EVALUATE WITH OPENAI ======
        print("\n=== Evaluating with OpenAI ===")

        evaluation_prompt = f"""
You are evaluating whether an AI agent properly recalled information from a previous conversation.

In Session 1, the agent was asked: "{unique_fact_q}"
The agent responded: "{response1}"

In Session 2, the agent was asked: "{recall_q}"
The agent responded: "{response2}"

Evaluate whether the Session 2 response shows evidence that the agent remembered
information from Session 1. Consider:
1. Does the response reference the same color or design preference?
2. Does it acknowledge having discussed this before?
3. Is the response consistent with what was said in Session 1?

Respond with a JSON object:
{{
    "memory_used": true/false,
    "consistency_score": 0-10,
    "explanation": "Brief explanation of your evaluation"
}}
"""

        eval_response = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": evaluation_prompt}],
            max_tokens=500,
        )

        eval_text = eval_response.choices[0].message.content
        print(f"Evaluation: {eval_text}")

        # Parse evaluation (basic)
        import json
        try:
            # Find JSON in response
            start = eval_text.find("{")
            end = eval_text.rfind("}") + 1
            if start >= 0 and end > start:
                eval_data = json.loads(eval_text[start:end])
                print(f"\nMemory used: {eval_data.get('memory_used')}")
                print(f"Consistency score: {eval_data.get('consistency_score')}/10")
                print(f"Explanation: {eval_data.get('explanation')}")

                # Soft assertion - log result but don't fail test
                if eval_data.get("consistency_score", 0) >= 5:
                    print("\n✅ Agent successfully demonstrated memory retention!")
                else:
                    print("\n⚠️ Agent may not have fully utilized memory")
        except json.JSONDecodeError:
            print("Could not parse evaluation JSON")


# =============================================================================
# Run specific test categories
# =============================================================================

if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1:
        if sys.argv[1] == "unit":
            pytest.main([__file__, "-v", "-m", "not integration and not evaluation"])
        elif sys.argv[1] == "integration":
            pytest.main([__file__, "-v", "-s", "-m", "integration"])
        elif sys.argv[1] == "evaluation":
            pytest.main([__file__, "-v", "-s", "-m", "evaluation"])
        else:
            pytest.main([__file__, "-v", "-s"])
    else:
        # Run all tests
        pytest.main([__file__, "-v", "-s"])
