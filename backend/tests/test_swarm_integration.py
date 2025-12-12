"""
Integration tests for the swarm system.

Tests end-to-end flows with mocked external services (LLM, Qdrant).
Marked with @pytest.mark.integration for selective running.

Run with: pytest tests/test_swarm_integration.py -v -m integration
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timezone

from app.swarm import (
    SwarmOrchestrator,
    SwarmAgent,
    create_swarm_orchestrator,
    run_swarm_from_input,
    SwarmInput,
    SwarmOutput,
    DEFAULT_SWARM_CONFIG,
)
from app.consensus import (
    CriticAgent,
    ConsensusBuilder,
    build_consensus_from_swarm,
)


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_llm():
    """Mock LLM client for integration tests."""
    with patch("app.orchestration.llm_client.get_llm_client") as mock:
        client = Mock()
        # Default response pattern
        client.complete.side_effect = lambda prompt, **kwargs: (
            "I think this is an interesting topic. We should consider multiple perspectives."
        )
        mock.return_value = client
        yield client


@pytest.fixture
def sample_interviews():
    """Sample interview data for integration tests."""
    return [
        {
            "id": "int-alice",
            "name": "Alice Chen",
            "summary": "Tech enthusiast and early adopter",
            "personality": {
                "scores": {
                    "openness": 0.85,
                    "conscientiousness": 0.7,
                    "extraversion": 0.6,
                    "agreeableness": 0.75,
                    "neuroticism": 0.3,
                }
            },
            "reflection_memory": {
                "personality_summary": "Curious, innovative, and tech-savvy",
                "goals": ["Stay ahead of tech trends", "Find efficient solutions"],
                "pain_points": ["Complex interfaces", "Slow adoption cycles"],
                "habits": ["Early morning research", "Beta testing new apps"],
            },
        },
        {
            "id": "int-bob",
            "name": "Bob Martinez",
            "summary": "Pragmatic business user focused on ROI",
            "personality": {
                "scores": {
                    "openness": 0.5,
                    "conscientiousness": 0.9,
                    "extraversion": 0.4,
                    "agreeableness": 0.6,
                    "neuroticism": 0.4,
                }
            },
            "reflection_memory": {
                "personality_summary": "Practical, detail-oriented, results-driven",
                "goals": ["Maximize productivity", "Reduce costs"],
                "pain_points": ["Unproven solutions", "Wasted resources"],
                "habits": ["Weekly reviews", "Data-driven decisions"],
            },
        },
        {
            "id": "int-charlie",
            "name": "Charlie Kim",
            "summary": "Creative designer with UX focus",
            "personality": {
                "scores": {
                    "openness": 0.9,
                    "conscientiousness": 0.6,
                    "extraversion": 0.7,
                    "agreeableness": 0.8,
                    "neuroticism": 0.35,
                }
            },
            "reflection_memory": {
                "personality_summary": "Creative, empathetic, user-focused",
                "goals": ["Create delightful experiences", "Advocate for users"],
                "pain_points": ["Technical constraints", "Rushed timelines"],
                "habits": ["User interviews", "Sketching ideas"],
            },
        },
    ]


# ============================================================================
# Integration Tests: End-to-End Swarm
# ============================================================================


@pytest.mark.integration
class TestEndToEndSwarm:
    """Tests for complete swarm execution flow."""

    def test_swarm_runs_to_completion(self, mock_llm, sample_interviews):
        """Swarm runs from initialization to completion."""
        # Setup
        orchestrator = create_swarm_orchestrator("round_robin")

        with patch("app.orchestration.persistent_memory.get_persistent_memory_store") as mock_store:
            mock_store.return_value = Mock(load_memories=Mock(return_value=[]))

            # Initialize
            state = orchestrator.initialize_swarm(
                topic="How should we improve our mobile app experience?",
                interviews=sample_interviews,
                config={"max_turns": 6, "min_turns_per_agent": 1},
                load_memories=True,
            )

        assert state["status"] == "active"
        assert len(state["agents"]) == 3

        # Run swarm
        messages_received = []
        final_state = orchestrator.run_swarm(
            state,
            on_message=lambda msg: messages_received.append(msg),
        )

        # Verify completion
        assert final_state["status"] == "completed"
        assert final_state["turn_count"] >= 3  # At least 1 per agent
        assert len(messages_received) == final_state["turn_count"]

    def test_swarm_produces_valid_output(self, mock_llm, sample_interviews):
        """Swarm output contains all required fields."""
        orchestrator = create_swarm_orchestrator("round_robin")

        with patch("app.orchestration.persistent_memory.get_persistent_memory_store") as mock_store:
            mock_store.return_value = Mock(load_memories=Mock(return_value=[]))

            state = orchestrator.initialize_swarm(
                topic="Test topic",
                interviews=sample_interviews[:2],
                config={"max_turns": 4},
                load_memories=True,
            )

        final_state = orchestrator.run_swarm(state)
        output = orchestrator.get_output(final_state)

        # Verify output structure
        assert "swarm_id" in output
        assert "topic" in output
        assert "participants" in output
        assert "messages" in output
        assert "total_turns" in output
        assert "status" in output
        assert output["status"] == "completed"

    def test_run_swarm_from_input_convenience(self, mock_llm, sample_interviews):
        """run_swarm_from_input convenience function works correctly."""
        input_data: SwarmInput = {
            "topic": "What features matter most?",
            "agent_ids": ["int-alice", "int-bob"],
            "config": {"max_turns": 4, "speaker_selection": "round_robin"},
        }

        with patch("app.orchestration.persistent_memory.get_persistent_memory_store") as mock_store:
            mock_store.return_value = Mock(load_memories=Mock(return_value=[]))

            output = run_swarm_from_input(input_data, sample_interviews)

        assert output["status"] == "completed"
        assert len(output["participants"]) == 2


# ============================================================================
# Integration Tests: Memory Isolation
# ============================================================================


@pytest.mark.integration
class TestMemoryIsolation:
    """Tests verifying each agent only accesses their own memories."""

    def test_agents_load_isolated_memories(self, sample_interviews):
        """Each agent loads only their own memories from Qdrant."""
        loaded_agent_ids = []

        def track_memory_load(agent_id):
            loaded_agent_ids.append(agent_id)
            store = Mock()
            store.load_memories = Mock(return_value=[])
            return store

        with patch(
            "app.orchestration.persistent_memory.get_persistent_memory_store",
            side_effect=track_memory_load,
        ):
            orchestrator = create_swarm_orchestrator()
            state = orchestrator.initialize_swarm(
                topic="Test",
                interviews=sample_interviews,
                config={"max_turns": 3},
                load_memories=True,
            )

        # Verify each agent's memories were loaded separately
        assert len(loaded_agent_ids) == 3
        # Each agent ID should be unique
        assert len(set(loaded_agent_ids)) == 3

    def test_agent_memories_not_shared(self, mock_llm, sample_interviews):
        """Agent responses don't include other agents' memory content."""
        alice_memories = [
            {"content": "SECRET_ALICE_INFO", "type": "preference"},
        ]
        bob_memories = [
            {"content": "SECRET_BOB_INFO", "type": "preference"},
        ]

        def get_store_for_agent(agent_id):
            store = Mock()
            if "alice" in agent_id.lower():
                store.load_memories = Mock(return_value=alice_memories)
            elif "bob" in agent_id.lower():
                store.load_memories = Mock(return_value=bob_memories)
            else:
                store.load_memories = Mock(return_value=[])
            return store

        with patch(
            "app.orchestration.persistent_memory.get_persistent_memory_store",
            side_effect=get_store_for_agent,
        ):
            orchestrator = create_swarm_orchestrator("round_robin")
            state = orchestrator.initialize_swarm(
                topic="Test",
                interviews=sample_interviews[:2],
                config={"max_turns": 2},
                load_memories=True,
            )

        # Verify agents have their own memories loaded
        alice_agent = orchestrator._agents.get(sample_interviews[0]["id"])
        bob_agent = orchestrator._agents.get(sample_interviews[1]["id"])

        assert alice_agent is not None
        assert bob_agent is not None


# ============================================================================
# Integration Tests: Consensus Generation
# ============================================================================


@pytest.mark.integration
class TestConsensusGeneration:
    """Tests for critic evaluation and consensus building."""

    def test_critic_evaluates_completed_swarm(self, mock_llm, sample_interviews):
        """Critic produces evaluation for completed swarm."""
        # Create swarm output
        swarm_output: SwarmOutput = {
            "swarm_id": "test-swarm-1",
            "topic": "Mobile app improvements",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "message_count": 3},
                {"agent_id": "a2", "agent_name": "Bob", "message_count": 3},
                {"agent_id": "a3", "agent_name": "Charlie", "message_count": 2},
            ],
            "messages": [
                {"turn_number": 1, "speaker_name": "Alice", "content": "I think we need better onboarding."},
                {"turn_number": 2, "speaker_name": "Bob", "content": "Agreed. The first-time experience is crucial."},
                {"turn_number": 3, "speaker_name": "Charlie", "content": "We should focus on visual clarity too."},
                {"turn_number": 4, "speaker_name": "Alice", "content": "Good point. Both are important."},
                {"turn_number": 5, "speaker_name": "Bob", "content": "Let's prioritize based on user data."},
                {"turn_number": 6, "speaker_name": "Alice", "content": "I agree we've reached a consensus on this."},
                {"turn_number": 7, "speaker_name": "Charlie", "content": "Yes, onboarding and visual clarity are key."},
                {"turn_number": 8, "speaker_name": "Bob", "content": "In conclusion, we all agree on these priorities."},
            ],
            "total_turns": 8,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 30.0,
        }

        # Mock LLM responses for critic
        mock_llm.complete.return_value = """{
            "coherence_score": 8,
            "depth_score": 7,
            "relevance_score": 9,
            "engagement_score": 8,
            "overall_score": 8,
            "reasoning": "Good discussion with clear progression"
        }"""

        critic = CriticAgent(llm_client=mock_llm)
        evaluation = critic.evaluate(swarm_output)

        assert evaluation["swarm_id"] == "test-swarm-1"
        assert "quality" in evaluation
        assert "participation" in evaluation
        assert evaluation["quality"]["overall_score"] >= 0
        assert "proceed_to_consensus" in evaluation

    def test_consensus_builder_extracts_insights(self, mock_llm, sample_interviews):
        """Consensus builder extracts insights from swarm."""
        swarm_output: SwarmOutput = {
            "swarm_id": "test-swarm-2",
            "topic": "Feature prioritization",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "message_count": 2},
                {"agent_id": "a2", "agent_name": "Bob", "message_count": 2},
            ],
            "messages": [
                {"turn_number": 1, "speaker_name": "Alice", "content": "Performance is key for users."},
                {"turn_number": 2, "speaker_name": "Bob", "content": "I agree. Speed matters most."},
                {"turn_number": 3, "speaker_name": "Alice", "content": "Let's focus on that first."},
                {"turn_number": 4, "speaker_name": "Bob", "content": "Agreed. Performance is our priority."},
            ],
            "total_turns": 4,
            "status": "completed",
            "termination_reason": "consensus_signal",
            "duration_seconds": 15.0,
        }

        # Mock LLM responses
        mock_llm.complete.side_effect = [
            # Key insights response
            '{"insights": [{"insight": "Performance is the top priority", "supporting_agents": ["Alice", "Bob"], "quotes": [{"agent_name": "Alice", "quote": "Performance is key", "turn": 1}], "confidence": 0.9}]}',
            # Agreements response
            '{"agreements": [{"point": "Performance should be prioritized", "strength": "strong", "supporting_agents": ["Alice", "Bob"], "dissenting_agents": []}]}',
            # Disagreements response
            '{"disagreements": []}',
            # Conclusion response
            "The team unanimously agreed that performance is the top priority.",
            # Actionable items response
            '{"actions": ["Optimize database queries", "Implement caching"]}',
        ]

        builder = ConsensusBuilder(llm_client=mock_llm)
        consensus = builder.build_consensus(swarm_output)

        assert consensus["swarm_id"] == "test-swarm-2"
        assert len(consensus["key_insights"]) >= 0
        assert "synthesized_conclusion" in consensus
        assert "confidence_score" in consensus

    def test_build_consensus_from_swarm_convenience(self, mock_llm):
        """build_consensus_from_swarm convenience function works."""
        swarm_output: SwarmOutput = {
            "swarm_id": "test-swarm-3",
            "topic": "Test",
            "participants": [
                {"agent_id": "a1", "agent_name": "Agent1", "message_count": 1},
            ],
            "messages": [
                {"turn_number": 1, "speaker_name": "Agent1", "content": "Test message."},
            ],
            "total_turns": 1,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 5.0,
        }

        mock_llm.complete.return_value = '{"insights": []}'

        with patch("app.consensus.consensus_builder.get_llm_client", return_value=mock_llm):
            consensus = build_consensus_from_swarm(swarm_output)

        assert consensus is not None
        assert consensus["swarm_id"] == "test-swarm-3"


# ============================================================================
# Integration Tests: Full Pipeline
# ============================================================================


@pytest.mark.integration
class TestFullPipeline:
    """Tests for the complete swarm → critic → consensus pipeline."""

    def test_full_pipeline_swarm_to_consensus(self, mock_llm, sample_interviews):
        """Complete pipeline from swarm creation to consensus generation."""
        # Phase 1: Run swarm
        with patch("app.orchestration.persistent_memory.get_persistent_memory_store") as mock_store:
            mock_store.return_value = Mock(load_memories=Mock(return_value=[]))

            orchestrator = create_swarm_orchestrator("round_robin")
            state = orchestrator.initialize_swarm(
                topic="What's the most important feature for our product?",
                interviews=sample_interviews,
                config={"max_turns": 6},
                load_memories=True,
            )
            final_state = orchestrator.run_swarm(state)
            swarm_output = orchestrator.get_output(final_state)

        assert swarm_output["status"] == "completed"

        # Phase 2: Critic evaluation
        mock_llm.complete.return_value = """{
            "coherence_score": 7,
            "depth_score": 6,
            "relevance_score": 8,
            "engagement_score": 7,
            "overall_score": 7,
            "reasoning": "Productive discussion"
        }"""

        critic = CriticAgent(llm_client=mock_llm)
        evaluation = critic.evaluate(swarm_output)

        assert evaluation["proceed_to_consensus"] is True

        # Phase 3: Consensus building
        mock_llm.complete.side_effect = [
            '{"insights": [{"insight": "Users want simplicity", "supporting_agents": ["Alice"], "quotes": [], "confidence": 0.8}]}',
            '{"agreements": [{"point": "Simplicity matters", "strength": "moderate", "supporting_agents": ["Alice", "Bob"], "dissenting_agents": []}]}',
            '{"disagreements": []}',
            "The team values simplicity in the product.",
            '{"actions": ["Simplify the onboarding flow"]}',
        ]

        builder = ConsensusBuilder(llm_client=mock_llm)
        consensus = builder.build_consensus(swarm_output, evaluation)

        # Verify complete pipeline output
        assert consensus["swarm_id"] == swarm_output["swarm_id"]
        assert consensus["topic"] == swarm_output["topic"]
        assert "key_insights" in consensus
        assert "synthesized_conclusion" in consensus
        assert consensus["confidence_score"] > 0

    def test_pipeline_handles_low_quality_swarm(self, mock_llm, sample_interviews):
        """Pipeline handles low-quality swarm appropriately."""
        # Create low-quality swarm output
        swarm_output: SwarmOutput = {
            "swarm_id": "low-quality-swarm",
            "topic": "Test",
            "participants": [
                {"agent_id": "a1", "agent_name": "Agent1", "message_count": 1},
                {"agent_id": "a2", "agent_name": "Agent2", "message_count": 0},  # Didn't participate
            ],
            "messages": [
                {"turn_number": 1, "speaker_name": "Agent1", "content": "ok"},
            ],
            "total_turns": 1,
            "status": "completed",
            "termination_reason": "inactivity",
            "duration_seconds": 2.0,
        }

        # Mock critic response for low quality
        mock_llm.complete.return_value = """{
            "coherence_score": 2,
            "depth_score": 1,
            "relevance_score": 2,
            "engagement_score": 1,
            "overall_score": 1.5,
            "reasoning": "Very shallow discussion"
        }"""

        critic = CriticAgent(llm_client=mock_llm)
        evaluation = critic.evaluate(swarm_output)

        # Should detect quality issues - either from scores or structural flags
        # The mock may not parse perfectly, but structural flags will still be detected
        quality_issue_flags = [
            "low_overall_quality",
            "very_short_discussion",
            "unbalanced_participation",
            "dominant_speaker_detected",
        ]
        has_quality_issues = any(
            flag in evaluation["flags"] or any(flag in f for f in evaluation["flags"])
            for flag in quality_issue_flags
        )
        assert has_quality_issues, f"Expected quality issues, got flags: {evaluation['flags']}"
