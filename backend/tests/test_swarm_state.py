"""
Unit tests for swarm state types and Pydantic models.

Phase 1 Exit Criteria: All tests pass.
"""

import pytest
from datetime import datetime, timezone
import uuid

# Import swarm state types
from app.swarm.swarm_state import (
    SwarmMessage,
    SwarmAgentContext,
    SwarmConfig,
    SwarmState,
    SwarmInput,
    SwarmOutput,
    DEFAULT_SWARM_CONFIG,
)

# Import consensus state types
from app.consensus.judge_state import (
    InsightQuote,
    KeyInsight,
    AgreementPoint,
    DisagreementPoint,
    ParticipationMetrics,
    QualityMetrics,
    CriticEvaluation,
    ConsensusSummary,
    ConsensusInput,
    JudgeState,
)

# Import Pydantic models
from app.models.swarm_models import (
    SwarmConfigRequest,
    CreateSwarmRequest,
    StopSwarmRequest,
    SwarmParticipant,
    SwarmMessageResponse,
    SwarmStatusResponse,
    SwarmMessagesResponse,
    SwarmCreateResponse,
    KeyInsightResponse,
    ConsensusSummaryResponse,
    SwarmWSMessage,
)


class TestSwarmMessage:
    """Tests for SwarmMessage TypedDict."""

    def test_swarm_message_creation(self):
        """Test creating a valid SwarmMessage."""
        msg: SwarmMessage = {
            "id": str(uuid.uuid4()),
            "turn_number": 1,
            "speaker_id": "agent-123",
            "speaker_name": "Alice",
            "content": "I think we should focus on user experience.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message_type": "dialogue",
        }

        assert msg["turn_number"] == 1
        assert msg["speaker_name"] == "Alice"
        assert msg["message_type"] == "dialogue"

    def test_swarm_message_types(self):
        """Test all valid message types."""
        valid_types = ["dialogue", "proposal", "agreement", "disagreement", "question"]

        for msg_type in valid_types:
            msg: SwarmMessage = {
                "id": str(uuid.uuid4()),
                "turn_number": 1,
                "speaker_id": "agent-123",
                "speaker_name": "Test",
                "content": "Test content",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "message_type": msg_type,
            }
            assert msg["message_type"] == msg_type


class TestSwarmAgentContext:
    """Tests for SwarmAgentContext TypedDict."""

    def test_agent_context_creation(self):
        """Test creating a valid SwarmAgentContext."""
        ctx: SwarmAgentContext = {
            "agent_id": str(uuid.uuid4()),
            "agent_name": "Test Agent",
            "interview_id": str(uuid.uuid4()),
            "personality": {
                "openness": 3.5,
                "conscientiousness": 4.0,
                "extraversion": 2.5,
                "agreeableness": 3.0,
                "neuroticism": 2.0,
            },
            "emotional_state": {
                "primary_emotion": "curious",
                "intensity": 0.6,
                "valence": 0.3,
                "arousal": 0.5,
                "narrative": "Interested in the discussion.",
            },
            "reflection_memory": {
                "basic_facts": {"occupation": "Engineer"},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
            "memories": [],
            "message_count": 0,
            "last_spoke_turn": -1,
        }

        assert ctx["agent_name"] == "Test Agent"
        assert ctx["personality"]["openness"] == 3.5
        assert ctx["message_count"] == 0

    def test_agent_context_serialization(self):
        """Test that agent context can be serialized to dict."""
        ctx: SwarmAgentContext = {
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
                "narrative": "Starting fresh.",
            },
            "reflection_memory": {
                "basic_facts": {},
                "goals_and_aspirations": {},
                "pain_points_and_frustrations": {},
                "product_attitudes": {},
                "communication_style": {},
            },
            "memories": [],
            "message_count": 5,
            "last_spoke_turn": 4,
        }

        # TypedDicts are regular dicts, should serialize fine
        import json
        serialized = json.dumps(ctx)
        deserialized = json.loads(serialized)
        assert deserialized["agent_name"] == "Alice"
        assert deserialized["message_count"] == 5


class TestSwarmState:
    """Tests for SwarmState TypedDict."""

    def test_swarm_state_initialization(self):
        """Test initializing a SwarmState."""
        now = datetime.now(timezone.utc).isoformat()
        state: SwarmState = {
            "swarm_id": str(uuid.uuid4()),
            "topic": "What features matter most for language learning?",
            "agents": [],
            "messages": [],
            "current_speaker_id": "",
            "turn_count": 0,
            "config": DEFAULT_SWARM_CONFIG,
            "status": "initializing",
            "termination_reason": None,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
        }

        assert state["status"] == "initializing"
        assert state["turn_count"] == 0
        assert state["config"]["max_turns"] == 20

    def test_swarm_state_transitions(self):
        """Test status transitions in SwarmState."""
        now = datetime.now(timezone.utc).isoformat()
        state: SwarmState = {
            "swarm_id": "swarm-1",
            "topic": "Test topic",
            "agents": [],
            "messages": [],
            "current_speaker_id": "",
            "turn_count": 0,
            "config": DEFAULT_SWARM_CONFIG,
            "status": "initializing",
            "termination_reason": None,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
        }

        # Transition to active
        state["status"] = "active"
        assert state["status"] == "active"

        # Transition to completed
        state["status"] = "completed"
        state["termination_reason"] = "max_turns_reached"
        state["completed_at"] = datetime.now(timezone.utc).isoformat()
        assert state["status"] == "completed"
        assert state["termination_reason"] == "max_turns_reached"


class TestSwarmConfig:
    """Tests for SwarmConfig TypedDict."""

    def test_default_config_values(self):
        """Test default configuration values."""
        assert DEFAULT_SWARM_CONFIG["max_turns"] == 20
        assert DEFAULT_SWARM_CONFIG["speaker_selection"] == "dynamic"
        assert DEFAULT_SWARM_CONFIG["min_messages_per_agent"] == 2
        assert DEFAULT_SWARM_CONFIG["allow_early_termination"] is True

    def test_custom_config(self):
        """Test custom configuration."""
        config: SwarmConfig = {
            "max_turns": 50,
            "speaker_selection": "round_robin",
            "min_messages_per_agent": 5,
            "allow_early_termination": False,
            "termination_keywords": ["done", "finished"],
        }

        assert config["max_turns"] == 50
        assert config["speaker_selection"] == "round_robin"


class TestConsensusSummary:
    """Tests for ConsensusSummary TypedDict."""

    def test_consensus_summary_structure(self):
        """Test creating a ConsensusSummary."""
        summary: ConsensusSummary = {
            "swarm_id": "swarm-1",
            "topic": "Language learning features",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "role": "participant"},
                {"agent_id": "a2", "agent_name": "Bob", "role": "participant"},
            ],
            "key_insights": [
                {
                    "insight": "Users prefer gamification",
                    "supporting_agents": ["Alice", "Bob"],
                    "quotes": [],
                    "confidence": 0.85,
                }
            ],
            "areas_of_agreement": [
                {
                    "point": "Mobile experience is critical",
                    "agreement_level": "strong",
                    "supporting_agents": ["Alice", "Bob"],
                    "dissenting_agents": [],
                }
            ],
            "areas_of_disagreement": [],
            "synthesized_conclusion": "Both participants agree on mobile-first approach.",
            "actionable_items": ["Prioritize mobile development"],
            "confidence_score": 0.9,
            "consensus_strength": "strong",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "model_used": "gpt-4o-mini",
        }

        assert summary["consensus_strength"] == "strong"
        assert len(summary["key_insights"]) == 1
        assert summary["confidence_score"] == 0.9


class TestCriticEvaluation:
    """Tests for CriticEvaluation TypedDict."""

    def test_critic_evaluation_creation(self):
        """Test creating a CriticEvaluation."""
        evaluation: CriticEvaluation = {
            "swarm_id": "swarm-1",
            "quality": {
                "overall_score": 7.5,
                "coherence_score": 8.0,
                "depth_score": 7.0,
                "relevance_score": 8.0,
                "engagement_score": 7.0,
            },
            "participation": {
                "total_messages": 15,
                "per_agent": {"a1": 8, "a2": 7},
                "balance_score": 0.95,
                "dominant_speaker": None,
                "quiet_agents": [],
            },
            "flags": [],
            "recommendations": [],
            "proceed_to_consensus": True,
        }

        assert evaluation["proceed_to_consensus"] is True
        assert evaluation["quality"]["overall_score"] == 7.5
        assert evaluation["participation"]["balance_score"] == 0.95


class TestPydanticModels:
    """Tests for Pydantic request/response models."""

    def test_create_swarm_request_validation(self):
        """Test CreateSwarmRequest validation."""
        request = CreateSwarmRequest(
            topic="What features do you want in a language app?",
            agent_ids=["agent-1", "agent-2", "agent-3"],
        )

        assert len(request.agent_ids) == 3
        assert request.config is None

    def test_create_swarm_request_min_topic_length(self):
        """Test that topic must be at least 10 characters."""
        with pytest.raises(ValueError):
            CreateSwarmRequest(
                topic="Short",  # Less than 10 chars
                agent_ids=["a1", "a2"],
            )

    def test_create_swarm_request_min_agents(self):
        """Test that at least 2 agents required."""
        with pytest.raises(ValueError):
            CreateSwarmRequest(
                topic="Valid topic with enough characters",
                agent_ids=["a1"],  # Only 1 agent
            )

    def test_create_swarm_request_max_agents(self):
        """Test that max 10 agents allowed."""
        with pytest.raises(ValueError):
            CreateSwarmRequest(
                topic="Valid topic with enough characters",
                agent_ids=[f"a{i}" for i in range(11)],  # 11 agents
            )

    def test_swarm_config_request_defaults(self):
        """Test SwarmConfigRequest default values."""
        config = SwarmConfigRequest()

        assert config.max_turns == 20
        assert config.speaker_selection == "dynamic"
        assert config.min_messages_per_agent == 2
        assert config.allow_early_termination is True

    def test_swarm_config_request_validation(self):
        """Test SwarmConfigRequest validation bounds."""
        # Valid config
        config = SwarmConfigRequest(max_turns=50)
        assert config.max_turns == 50

        # Invalid max_turns (too low)
        with pytest.raises(ValueError):
            SwarmConfigRequest(max_turns=3)

        # Invalid max_turns (too high)
        with pytest.raises(ValueError):
            SwarmConfigRequest(max_turns=150)

    def test_swarm_status_response(self):
        """Test SwarmStatusResponse model."""
        response = SwarmStatusResponse(
            swarm_id="swarm-123",
            topic="Test topic for discussion",
            status="active",
            participants=[
                SwarmParticipant(agent_id="a1", agent_name="Alice"),
                SwarmParticipant(agent_id="a2", agent_name="Bob"),
            ],
            turn_count=5,
            max_turns=20,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
        )

        assert response.status == "active"
        assert len(response.participants) == 2
        assert response.turn_count == 5

    def test_consensus_summary_response(self):
        """Test ConsensusSummaryResponse model."""
        response = ConsensusSummaryResponse(
            swarm_id="swarm-123",
            topic="Language learning features",
            participants=[
                SwarmParticipant(agent_id="a1", agent_name="Alice", message_count=5),
            ],
            key_insights=[],
            areas_of_agreement=[],
            areas_of_disagreement=[],
            synthesized_conclusion="No strong consensus reached.",
            confidence_score=0.5,
            consensus_strength="weak",
            generated_at=datetime.now(timezone.utc).isoformat(),
        )

        assert response.consensus_strength == "weak"
        assert response.confidence_score == 0.5

    def test_swarm_ws_message(self):
        """Test SwarmWSMessage model."""
        msg = SwarmWSMessage(
            event_type="message",
            swarm_id="swarm-123",
            data={"content": "Hello everyone"},
        )

        assert msg.event_type == "message"
        assert msg.data["content"] == "Hello everyone"
        assert msg.timestamp  # Auto-generated


class TestSwarmInputOutput:
    """Tests for SwarmInput and SwarmOutput types."""

    def test_swarm_input(self):
        """Test SwarmInput structure."""
        input_data: SwarmInput = {
            "topic": "Discuss the ideal language learning app features",
            "agent_ids": ["agent-1", "agent-2"],
            "config": None,
        }

        assert len(input_data["agent_ids"]) == 2
        assert input_data["config"] is None

    def test_swarm_output(self):
        """Test SwarmOutput structure."""
        output: SwarmOutput = {
            "swarm_id": "swarm-123",
            "topic": "Test topic",
            "participants": [
                {"agent_id": "a1", "agent_name": "Alice", "message_count": 5},
                {"agent_id": "a2", "agent_name": "Bob", "message_count": 4},
            ],
            "messages": [],
            "total_turns": 9,
            "status": "completed",
            "termination_reason": "max_turns_reached",
            "duration_seconds": 45.5,
        }

        assert output["status"] == "completed"
        assert output["total_turns"] == 9
        assert output["duration_seconds"] == 45.5


class TestJudgeState:
    """Tests for JudgeState TypedDict."""

    def test_judge_state_initialization(self):
        """Test initializing JudgeState."""
        state: JudgeState = {
            "swarm_id": "swarm-123",
            "swarm_output": {},
            "messages": [],
            "evaluation_complete": False,
            "critic_evaluation": None,
            "consensus_complete": False,
            "consensus_summary": None,
            "error": None,
            "status": "pending",
        }

        assert state["status"] == "pending"
        assert state["evaluation_complete"] is False
        assert state["consensus_complete"] is False

    def test_judge_state_transitions(self):
        """Test JudgeState status transitions."""
        state: JudgeState = {
            "swarm_id": "swarm-123",
            "swarm_output": {},
            "messages": [],
            "evaluation_complete": False,
            "critic_evaluation": None,
            "consensus_complete": False,
            "consensus_summary": None,
            "error": None,
            "status": "pending",
        }

        # Transition to evaluating
        state["status"] = "evaluating"
        assert state["status"] == "evaluating"

        # Complete evaluation
        state["evaluation_complete"] = True
        state["status"] = "building_consensus"
        assert state["status"] == "building_consensus"

        # Complete consensus
        state["consensus_complete"] = True
        state["status"] = "complete"
        assert state["status"] == "complete"
