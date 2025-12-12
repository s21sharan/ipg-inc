"""
Unit tests for CriticAgent and ConsensusBuilder.

Phase 5 Exit Criteria: All tests pass.
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone
import json

from app.consensus.critic_agent import CriticAgent, create_critic_agent
from app.consensus.consensus_builder import (
    ConsensusBuilder,
    create_consensus_builder,
    build_consensus_from_swarm,
)
from app.swarm.swarm_state import SwarmOutput, SwarmMessage


# =============================================================================
# Test Fixtures
# =============================================================================


@pytest.fixture
def sample_messages() -> list[SwarmMessage]:
    """Create sample messages for testing."""
    now = datetime.now(timezone.utc).isoformat()
    return [
        {
            "id": "msg-1",
            "turn_number": 1,
            "speaker_id": "agent-1",
            "speaker_name": "Alice",
            "content": "I think gamification is really important for language learning apps.",
            "timestamp": now,
            "message_type": "dialogue",
        },
        {
            "id": "msg-2",
            "turn_number": 2,
            "speaker_id": "agent-2",
            "speaker_name": "Bob",
            "content": "I agree with Alice. Games make learning more engaging.",
            "timestamp": now,
            "message_type": "dialogue",
        },
        {
            "id": "msg-3",
            "turn_number": 3,
            "speaker_id": "agent-3",
            "speaker_name": "Carol",
            "content": "I disagree. I prefer simple, clean interfaces without distractions.",
            "timestamp": now,
            "message_type": "dialogue",
        },
        {
            "id": "msg-4",
            "turn_number": 4,
            "speaker_id": "agent-1",
            "speaker_name": "Alice",
            "content": "Good point Carol. Maybe we need options for different learning styles.",
            "timestamp": now,
            "message_type": "dialogue",
        },
        {
            "id": "msg-5",
            "turn_number": 5,
            "speaker_id": "agent-2",
            "speaker_name": "Bob",
            "content": "That's a great idea - customizable experience for everyone.",
            "timestamp": now,
            "message_type": "dialogue",
        },
    ]


@pytest.fixture
def sample_swarm_output(sample_messages) -> SwarmOutput:
    """Create sample swarm output for testing."""
    return {
        "swarm_id": "swarm-test-123",
        "topic": "What features matter most in a language learning app?",
        "participants": [
            {"agent_id": "agent-1", "agent_name": "Alice", "message_count": 2},
            {"agent_id": "agent-2", "agent_name": "Bob", "message_count": 2},
            {"agent_id": "agent-3", "agent_name": "Carol", "message_count": 1},
        ],
        "messages": sample_messages,
        "total_turns": 5,
        "status": "completed",
        "termination_reason": "max_turns",
        "duration_seconds": 45.5,
    }


@pytest.fixture
def mock_llm_client():
    """Create a mock LLM client for testing."""
    mock = MagicMock()
    return mock


# =============================================================================
# CriticAgent Tests
# =============================================================================


class TestCriticAgentParticipation:
    """Tests for participation metrics calculation."""

    def test_calculate_participation_basic(self, sample_swarm_output):
        """Test basic participation calculation."""
        critic = CriticAgent()
        metrics = critic._calculate_participation(sample_swarm_output)

        assert metrics["total_messages"] == 5
        assert metrics["per_agent"]["agent-1"] == 2
        assert metrics["per_agent"]["agent-2"] == 2
        assert metrics["per_agent"]["agent-3"] == 1

    def test_calculate_balance_score(self, sample_swarm_output):
        """Test balance score calculation."""
        critic = CriticAgent()
        metrics = critic._calculate_participation(sample_swarm_output)

        # With 2, 2, 1 distribution, balance should be reasonable but not perfect
        assert 0.5 < metrics["balance_score"] < 1.0

    def test_detect_dominant_speaker(self):
        """Test detection of dominant speaker."""
        output: SwarmOutput = {
            "swarm_id": "test",
            "topic": "Test",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "message_count": 8},
                {"agent_id": "a2", "agent_name": "Bob", "message_count": 2},
            ],
            "messages": [],
            "total_turns": 10,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 30.0,
        }

        critic = CriticAgent()
        metrics = critic._calculate_participation(output)

        assert metrics["dominant_speaker"] == "a1"

    def test_detect_quiet_agents(self):
        """Test detection of quiet agents."""
        output: SwarmOutput = {
            "swarm_id": "test",
            "topic": "Test",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "message_count": 5},
                {"agent_id": "a2", "agent_name": "Bob", "message_count": 5},
                {"agent_id": "a3", "agent_name": "Carol", "message_count": 1},
            ],
            "messages": [],
            "total_turns": 11,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 30.0,
        }

        critic = CriticAgent()
        metrics = critic._calculate_participation(output)

        assert "a3" in metrics["quiet_agents"]


class TestCriticAgentQuality:
    """Tests for quality assessment."""

    @patch("app.consensus.critic_agent.get_llm_client")
    def test_assess_quality_parses_response(self, mock_get_llm, sample_swarm_output):
        """Test that quality assessment parses LLM response."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps({
            "coherence_score": 8.0,
            "depth_score": 7.0,
            "relevance_score": 8.5,
            "engagement_score": 7.5,
            "overall_score": 7.8,
            "reasoning": "Good discussion."
        })
        mock_get_llm.return_value = mock_llm

        critic = CriticAgent(llm_client=mock_llm)
        quality = critic._assess_quality(sample_swarm_output)

        assert quality["overall_score"] == 7.8
        assert quality["coherence_score"] == 8.0

    @patch("app.consensus.critic_agent.get_llm_client")
    def test_assess_quality_handles_parse_error(self, mock_get_llm, sample_swarm_output):
        """Test quality assessment fallback on parse error."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = "Invalid JSON response"
        mock_get_llm.return_value = mock_llm

        critic = CriticAgent(llm_client=mock_llm)
        quality = critic._assess_quality(sample_swarm_output)

        # Should return default scores
        assert quality["overall_score"] == 5.0


class TestCriticAgentFlags:
    """Tests for flag generation."""

    def test_generate_flags_unbalanced(self):
        """Test flag generation for unbalanced participation."""
        output: SwarmOutput = {
            "swarm_id": "test",
            "topic": "Test",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "message_count": 9},
                {"agent_id": "a2", "agent_name": "Bob", "message_count": 1},
            ],
            "messages": [],
            "total_turns": 10,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 30.0,
        }

        critic = CriticAgent()
        participation = critic._calculate_participation(output)
        quality = {"overall_score": 7.0, "coherence_score": 7.0, "depth_score": 7.0, "relevance_score": 7.0, "engagement_score": 7.0}

        flags = critic._generate_flags(output, participation, quality)

        assert "unbalanced_participation" in flags or "dominant_speaker_detected" in flags

    def test_generate_flags_short_discussion(self):
        """Test flag generation for short discussions."""
        output: SwarmOutput = {
            "swarm_id": "test",
            "topic": "Test",
            "participants": [],
            "messages": [],
            "total_turns": 3,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 10.0,
        }

        critic = CriticAgent()
        participation = {"total_messages": 3, "per_agent": {}, "balance_score": 1.0, "dominant_speaker": None, "quiet_agents": []}
        quality = {"overall_score": 7.0, "coherence_score": 7.0, "depth_score": 7.0, "relevance_score": 7.0, "engagement_score": 7.0}

        flags = critic._generate_flags(output, participation, quality)

        assert "very_short_discussion" in flags


class TestCriticAgentEvaluation:
    """Tests for full evaluation."""

    @patch("app.consensus.critic_agent.get_llm_client")
    def test_evaluate_returns_complete_evaluation(self, mock_get_llm, sample_swarm_output):
        """Test that evaluate returns complete evaluation."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps({
            "coherence_score": 7.5,
            "depth_score": 7.0,
            "relevance_score": 8.0,
            "engagement_score": 7.5,
            "overall_score": 7.5,
        })
        mock_get_llm.return_value = mock_llm

        critic = CriticAgent(llm_client=mock_llm)
        evaluation = critic.evaluate(sample_swarm_output)

        assert evaluation["swarm_id"] == "swarm-test-123"
        assert "quality" in evaluation
        assert "participation" in evaluation
        assert "flags" in evaluation
        assert "recommendations" in evaluation
        assert "proceed_to_consensus" in evaluation


class TestCriticAgentFactory:
    """Tests for factory function."""

    def test_create_critic_agent(self):
        """Test factory function."""
        critic = create_critic_agent()
        assert critic is not None


# =============================================================================
# ConsensusBuilder Tests
# =============================================================================


class TestConsensusBuilderInsights:
    """Tests for insight extraction."""

    @patch("app.consensus.consensus_builder.get_llm_client")
    def test_extract_key_insights(self, mock_get_llm, sample_swarm_output):
        """Test key insight extraction."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps({
            "insights": [
                {
                    "insight": "Gamification is valued by most participants",
                    "supporting_agents": ["Alice", "Bob"],
                    "quotes": [
                        {"agent_name": "Alice", "quote": "gamification is really important", "turn": 1}
                    ],
                    "confidence": 0.85
                }
            ]
        })
        mock_get_llm.return_value = mock_llm

        builder = ConsensusBuilder(llm_client=mock_llm)
        insights = builder._extract_key_insights(
            sample_swarm_output["topic"],
            sample_swarm_output["messages"],
            sample_swarm_output["participants"],
        )

        assert len(insights) >= 1
        assert "gamification" in insights[0]["insight"].lower()


class TestConsensusBuilderAgreements:
    """Tests for agreement identification."""

    @patch("app.consensus.consensus_builder.get_llm_client")
    def test_identify_agreements(self, mock_get_llm, sample_swarm_output):
        """Test agreement identification."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps({
            "agreements": [
                {
                    "point": "Customizable experience is important",
                    "strength": "strong",
                    "supporting_agents": ["Alice", "Bob"],
                    "dissenting_agents": []
                }
            ]
        })
        mock_get_llm.return_value = mock_llm

        builder = ConsensusBuilder(llm_client=mock_llm)
        agreements = builder._identify_agreements(
            sample_swarm_output["topic"],
            sample_swarm_output["messages"],
            sample_swarm_output["participants"],
        )

        assert len(agreements) >= 1
        assert agreements[0]["agreement_level"] == "strong"


class TestConsensusBuilderDisagreements:
    """Tests for disagreement identification."""

    @patch("app.consensus.consensus_builder.get_llm_client")
    def test_identify_disagreements(self, mock_get_llm, sample_swarm_output):
        """Test disagreement identification."""
        mock_llm = MagicMock()
        mock_llm.complete.return_value = json.dumps({
            "disagreements": [
                {
                    "point": "Level of gamification",
                    "positions": [
                        {"position": "More gamification", "agents": ["Alice", "Bob"]},
                        {"position": "Simpler interface", "agents": ["Carol"]}
                    ]
                }
            ]
        })
        mock_get_llm.return_value = mock_llm

        builder = ConsensusBuilder(llm_client=mock_llm)
        disagreements = builder._identify_disagreements(
            sample_swarm_output["topic"],
            sample_swarm_output["messages"],
            sample_swarm_output["participants"],
        )

        assert len(disagreements) >= 1
        assert len(disagreements[0]["positions"]) == 2


class TestConsensusBuilderConfidence:
    """Tests for confidence calculation."""

    def test_calculate_confidence_with_insights(self):
        """Test confidence increases with insights."""
        builder = ConsensusBuilder()

        few_insights: list = [{"insight": "test", "supporting_agents": [], "quotes": [], "confidence": 0.7}]
        many_insights: list = [{"insight": f"test {i}", "supporting_agents": [], "quotes": [], "confidence": 0.7} for i in range(5)]

        conf_few = builder._calculate_confidence(few_insights, [], [], None)
        conf_many = builder._calculate_confidence(many_insights, [], [], None)

        assert conf_many > conf_few

    def test_calculate_confidence_with_agreements(self):
        """Test confidence increases with strong agreements."""
        builder = ConsensusBuilder()

        weak_agreements: list = [{"point": "test", "agreement_level": "weak", "supporting_agents": [], "dissenting_agents": []}]
        strong_agreements: list = [
            {"point": "test1", "agreement_level": "strong", "supporting_agents": [], "dissenting_agents": []},
            {"point": "test2", "agreement_level": "strong", "supporting_agents": [], "dissenting_agents": []},
        ]

        conf_weak = builder._calculate_confidence([], weak_agreements, [], None)
        conf_strong = builder._calculate_confidence([], strong_agreements, [], None)

        assert conf_strong > conf_weak


class TestConsensusBuilderStrength:
    """Tests for consensus strength determination."""

    def test_determine_consensus_strength_strong(self):
        """Test strong consensus detection."""
        builder = ConsensusBuilder()

        strong_agreements = [
            {"point": "test1", "agreement_level": "strong", "supporting_agents": [], "dissenting_agents": []},
            {"point": "test2", "agreement_level": "strong", "supporting_agents": [], "dissenting_agents": []},
        ]

        strength = builder._determine_consensus_strength(strong_agreements, [])

        assert strength == "strong"

    def test_determine_consensus_strength_weak(self):
        """Test weak consensus detection."""
        builder = ConsensusBuilder()

        weak_agreements = [{"point": "test", "agreement_level": "weak", "supporting_agents": [], "dissenting_agents": []}]
        disagreements = [{"point": "d1", "positions": []}, {"point": "d2", "positions": []}]

        strength = builder._determine_consensus_strength(weak_agreements, disagreements)

        assert strength == "weak"

    def test_determine_consensus_strength_none(self):
        """Test no consensus detection."""
        builder = ConsensusBuilder()

        strength = builder._determine_consensus_strength([], [])

        assert strength == "none"


class TestConsensusBuilderFull:
    """Tests for full consensus building."""

    @patch("app.consensus.consensus_builder.get_llm_client")
    def test_build_consensus_returns_complete_summary(self, mock_get_llm, sample_swarm_output):
        """Test that build_consensus returns complete summary."""
        mock_llm = MagicMock()

        # Setup responses for different calls
        mock_llm.complete.side_effect = [
            # Insights
            json.dumps({"insights": [{"insight": "Test insight", "supporting_agents": ["Alice"], "quotes": [], "confidence": 0.8}]}),
            # Agreements
            json.dumps({"agreements": [{"point": "Test agreement", "strength": "moderate", "supporting_agents": ["Alice"], "dissenting_agents": []}]}),
            # Disagreements
            json.dumps({"disagreements": []}),
            # Conclusion
            "This discussion showed consensus on the importance of customization.",
            # Actions
            json.dumps({"actions": ["Implement customization options"]}),
        ]
        mock_get_llm.return_value = mock_llm

        builder = ConsensusBuilder(llm_client=mock_llm)
        summary = builder.build_consensus(sample_swarm_output)

        assert summary["swarm_id"] == "swarm-test-123"
        assert summary["topic"] == sample_swarm_output["topic"]
        assert len(summary["participants"]) == 3
        assert "key_insights" in summary
        assert "areas_of_agreement" in summary
        assert "areas_of_disagreement" in summary
        assert "synthesized_conclusion" in summary
        assert "confidence_score" in summary
        assert summary["consensus_strength"] in ["strong", "moderate", "weak", "none"]


class TestConsensusBuilderFactory:
    """Tests for factory functions."""

    def test_create_consensus_builder(self):
        """Test factory function."""
        builder = create_consensus_builder()
        assert builder is not None

    @patch("app.consensus.consensus_builder.get_llm_client")
    def test_build_consensus_from_swarm_convenience(self, mock_get_llm, sample_swarm_output):
        """Test convenience function."""
        mock_llm = MagicMock()
        mock_llm.complete.side_effect = [
            json.dumps({"insights": []}),
            json.dumps({"agreements": []}),
            json.dumps({"disagreements": []}),
            "No clear consensus.",
            json.dumps({"actions": []}),
        ]
        mock_get_llm.return_value = mock_llm

        summary = build_consensus_from_swarm(sample_swarm_output)

        assert summary["swarm_id"] == sample_swarm_output["swarm_id"]
