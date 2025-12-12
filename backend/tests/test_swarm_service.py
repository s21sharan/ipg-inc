"""
Tests for swarm service layer.

Tests cover:
- Creating swarms with valid agents
- Getting swarm status
- Retrieving messages with pagination
- Stopping swarms manually
- Generating and retrieving consensus summaries
- Error handling for invalid inputs
"""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from datetime import datetime, timezone
import uuid

from app.services.swarm_service import SwarmService


# ============================================================================
# Fixtures
# ============================================================================


@pytest.fixture
def mock_db():
    """Mock Supabase client."""
    db = Mock()

    # Default table mock that returns chainable methods
    def create_table_mock():
        table = Mock()
        table.select = Mock(return_value=table)
        table.insert = Mock(return_value=table)
        table.update = Mock(return_value=table)
        table.delete = Mock(return_value=table)
        table.eq = Mock(return_value=table)
        table.in_ = Mock(return_value=table)
        table.single = Mock(return_value=table)
        table.order = Mock(return_value=table)
        table.range = Mock(return_value=table)
        table.execute = Mock(return_value=Mock(data=None))
        return table

    db.table = Mock(side_effect=lambda name: create_table_mock())
    return db


@pytest.fixture
def sample_interviews():
    """Sample interview data."""
    return [
        {
            "id": "int-1",
            "name": "Alice",
            "summary": "Tech enthusiast",
            "personality": {"openness": 0.8, "conscientiousness": 0.7},
            "reflection_memory": {
                "personality_summary": "Curious and innovative",
                "goals": ["Learn new tech"],
                "pain_points": ["Complex APIs"],
            },
        },
        {
            "id": "int-2",
            "name": "Bob",
            "summary": "Designer",
            "personality": {"openness": 0.6, "conscientiousness": 0.9},
            "reflection_memory": {
                "personality_summary": "Detail-oriented",
                "goals": ["Clean designs"],
                "pain_points": ["Rushed deadlines"],
            },
        },
        {
            "id": "int-3",
            "name": "Charlie",
            "summary": "Product manager",
            "personality": {"openness": 0.7, "conscientiousness": 0.8},
            "reflection_memory": {
                "personality_summary": "Strategic thinker",
                "goals": ["User satisfaction"],
                "pain_points": ["Resource constraints"],
            },
        },
    ]


@pytest.fixture
def swarm_service(mock_db):
    """Create SwarmService with mocked dependencies."""
    return SwarmService(mock_db)


# ============================================================================
# Test: Create Swarm
# ============================================================================


class TestCreateSwarm:
    """Tests for creating new swarms."""

    def test_create_swarm_with_valid_agents(self, swarm_service, mock_db, sample_interviews):
        """Creating a swarm with valid agent IDs succeeds."""
        # Setup mock to return interviews
        interviews_table = Mock()
        interviews_table.select = Mock(return_value=interviews_table)
        interviews_table.in_ = Mock(return_value=interviews_table)
        interviews_table.execute = Mock(return_value=Mock(data=sample_interviews))

        sessions_table = Mock()
        sessions_table.insert = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data=[{"id": "swarm-123"}]))

        participants_table = Mock()
        participants_table.insert = Mock(return_value=participants_table)
        participants_table.execute = Mock(return_value=Mock(data=[]))

        def table_router(name):
            if name == "interviews":
                return interviews_table
            elif name == "swarm_sessions":
                return sessions_table
            elif name == "swarm_participants":
                return participants_table
            return Mock()

        mock_db.table = Mock(side_effect=table_router)

        # Execute
        with patch.object(swarm_service, "_run_swarm_background"):
            result = swarm_service.create_swarm(
                topic="Test discussion",
                agent_ids=["int-1", "int-2", "int-3"],
                config={"max_turns": 10},
            )

        # Verify
        assert result is not None
        assert "swarm_id" in result
        sessions_table.insert.assert_called_once()

    def test_create_swarm_requires_minimum_agents(self, swarm_service, mock_db):
        """Creating a swarm requires at least 2 agents."""
        interviews_table = Mock()
        interviews_table.select = Mock(return_value=interviews_table)
        interviews_table.in_ = Mock(return_value=interviews_table)
        interviews_table.execute = Mock(return_value=Mock(data=[{"id": "int-1"}]))
        mock_db.table = Mock(return_value=interviews_table)

        with pytest.raises(ValueError, match="at least 2 agents"):
            swarm_service.create_swarm(
                topic="Test",
                agent_ids=["int-1"],
            )

    def test_create_swarm_validates_agent_ids(self, swarm_service, mock_db):
        """Creating a swarm with invalid agent IDs raises error."""
        interviews_table = Mock()
        interviews_table.select = Mock(return_value=interviews_table)
        interviews_table.in_ = Mock(return_value=interviews_table)
        # Only return 1 interview when 2 were requested
        interviews_table.execute = Mock(return_value=Mock(data=[{"id": "int-1"}]))
        mock_db.table = Mock(return_value=interviews_table)

        with pytest.raises(ValueError, match="not found"):
            swarm_service.create_swarm(
                topic="Test",
                agent_ids=["int-1", "int-invalid"],
            )

    def test_create_swarm_stores_session_in_db(self, swarm_service, mock_db, sample_interviews):
        """Creating a swarm stores session data in database."""
        interviews_table = Mock()
        interviews_table.select = Mock(return_value=interviews_table)
        interviews_table.in_ = Mock(return_value=interviews_table)
        interviews_table.execute = Mock(return_value=Mock(data=sample_interviews[:2]))

        sessions_table = Mock()
        sessions_table.insert = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data=[{"id": "new-swarm"}]))

        participants_table = Mock()
        participants_table.insert = Mock(return_value=participants_table)
        participants_table.execute = Mock(return_value=Mock(data=[]))

        def table_router(name):
            if name == "interviews":
                return interviews_table
            elif name == "swarm_sessions":
                return sessions_table
            elif name == "swarm_participants":
                return participants_table
            return Mock()

        mock_db.table = Mock(side_effect=table_router)

        with patch.object(swarm_service, "_run_swarm_background"):
            swarm_service.create_swarm(
                topic="AI Ethics Discussion",
                agent_ids=["int-1", "int-2"],
            )

        # Verify session was inserted
        insert_call = sessions_table.insert.call_args
        session_data = insert_call[0][0]
        assert session_data["topic"] == "AI Ethics Discussion"
        assert session_data["status"] == "active"


# ============================================================================
# Test: Get Swarm Status
# ============================================================================


class TestGetSwarmStatus:
    """Tests for retrieving swarm status."""

    def test_get_status_returns_swarm_data(self, swarm_service, mock_db):
        """Getting status returns swarm session data."""
        swarm_data = {
            "id": "swarm-123",
            "topic": "Test topic",
            "status": "active",
            "config": {"max_turns": 20},
            "created_at": "2024-01-01T00:00:00Z",
        }

        sessions_table = Mock()
        sessions_table.select = Mock(return_value=sessions_table)
        sessions_table.eq = Mock(return_value=sessions_table)
        sessions_table.single = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data=swarm_data))

        messages_table = Mock()
        messages_table.select = Mock(return_value=messages_table)
        messages_table.eq = Mock(return_value=messages_table)
        messages_table.execute = Mock(return_value=Mock(data=[{}, {}, {}]))  # 3 messages

        def table_router(name):
            if name == "swarm_sessions":
                return sessions_table
            elif name == "swarm_messages":
                return messages_table
            return Mock()

        mock_db.table = Mock(side_effect=table_router)

        result = swarm_service.get_swarm_status("swarm-123")

        assert result["id"] == "swarm-123"
        assert result["topic"] == "Test topic"
        assert result["status"] == "active"
        assert result["message_count"] == 3

    def test_get_status_returns_none_for_missing_swarm(self, swarm_service, mock_db):
        """Getting status for non-existent swarm returns None."""
        sessions_table = Mock()
        sessions_table.select = Mock(return_value=sessions_table)
        sessions_table.eq = Mock(return_value=sessions_table)
        sessions_table.single = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data=None))
        mock_db.table = Mock(return_value=sessions_table)

        result = swarm_service.get_swarm_status("nonexistent")

        assert result is None


# ============================================================================
# Test: Get Messages
# ============================================================================


class TestGetMessages:
    """Tests for retrieving swarm messages."""

    def test_get_messages_returns_list(self, swarm_service, mock_db):
        """Getting messages returns list of messages."""
        messages = [
            {"id": "m1", "turn_number": 1, "content": "Hello"},
            {"id": "m2", "turn_number": 2, "content": "Hi there"},
        ]

        messages_table = Mock()
        messages_table.select = Mock(return_value=messages_table)
        messages_table.eq = Mock(return_value=messages_table)
        messages_table.order = Mock(return_value=messages_table)
        messages_table.range = Mock(return_value=messages_table)
        messages_table.execute = Mock(return_value=Mock(data=messages))
        mock_db.table = Mock(return_value=messages_table)

        result = swarm_service.get_messages("swarm-123")

        assert len(result) == 2
        assert result[0]["content"] == "Hello"

    def test_get_messages_with_pagination(self, swarm_service, mock_db):
        """Getting messages supports offset and limit."""
        messages_table = Mock()
        messages_table.select = Mock(return_value=messages_table)
        messages_table.eq = Mock(return_value=messages_table)
        messages_table.order = Mock(return_value=messages_table)
        messages_table.range = Mock(return_value=messages_table)
        messages_table.execute = Mock(return_value=Mock(data=[]))
        mock_db.table = Mock(return_value=messages_table)

        swarm_service.get_messages("swarm-123", offset=10, limit=5)

        # Verify range was called with correct pagination
        messages_table.range.assert_called_once_with(10, 14)  # offset to offset+limit-1

    def test_get_messages_orders_by_turn(self, swarm_service, mock_db):
        """Messages are ordered by turn number."""
        messages_table = Mock()
        messages_table.select = Mock(return_value=messages_table)
        messages_table.eq = Mock(return_value=messages_table)
        messages_table.order = Mock(return_value=messages_table)
        messages_table.range = Mock(return_value=messages_table)
        messages_table.execute = Mock(return_value=Mock(data=[]))
        mock_db.table = Mock(return_value=messages_table)

        swarm_service.get_messages("swarm-123")

        messages_table.order.assert_called_once_with("turn_number")


# ============================================================================
# Test: Stop Swarm
# ============================================================================


class TestStopSwarm:
    """Tests for manually stopping swarms."""

    def test_stop_swarm_updates_status(self, swarm_service, mock_db):
        """Stopping a swarm updates its status to terminated."""
        sessions_table = Mock()
        sessions_table.select = Mock(return_value=sessions_table)
        sessions_table.update = Mock(return_value=sessions_table)
        sessions_table.eq = Mock(return_value=sessions_table)
        sessions_table.single = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data={"id": "swarm-123", "status": "active"}))
        mock_db.table = Mock(return_value=sessions_table)

        result = swarm_service.stop_swarm("swarm-123")

        assert result is True
        sessions_table.update.assert_called_once()
        update_call = sessions_table.update.call_args[0][0]
        assert update_call["status"] == "terminated"

    def test_stop_swarm_returns_false_for_missing(self, swarm_service, mock_db):
        """Stopping non-existent swarm returns False."""
        sessions_table = Mock()
        sessions_table.select = Mock(return_value=sessions_table)
        sessions_table.eq = Mock(return_value=sessions_table)
        sessions_table.single = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data=None))
        mock_db.table = Mock(return_value=sessions_table)

        result = swarm_service.stop_swarm("nonexistent")

        assert result is False

    def test_stop_swarm_ignores_completed_swarms(self, swarm_service, mock_db):
        """Stopping an already completed swarm returns False."""
        sessions_table = Mock()
        sessions_table.select = Mock(return_value=sessions_table)
        sessions_table.eq = Mock(return_value=sessions_table)
        sessions_table.single = Mock(return_value=sessions_table)
        sessions_table.execute = Mock(return_value=Mock(data={"id": "swarm-123", "status": "completed"}))
        mock_db.table = Mock(return_value=sessions_table)

        result = swarm_service.stop_swarm("swarm-123")

        assert result is False


# ============================================================================
# Test: Get Consensus
# ============================================================================


class TestGetConsensus:
    """Tests for retrieving consensus summaries."""

    def test_get_consensus_returns_summary(self, swarm_service, mock_db):
        """Getting consensus returns stored summary."""
        consensus_data = {
            "id": "cons-123",
            "swarm_id": "swarm-123",
            "key_insights": [{"insight": "Users prefer simplicity"}],
            "synthesized_conclusion": "The group agreed on...",
            "confidence_score": 0.85,
        }

        consensus_table = Mock()
        consensus_table.select = Mock(return_value=consensus_table)
        consensus_table.eq = Mock(return_value=consensus_table)
        consensus_table.single = Mock(return_value=consensus_table)
        consensus_table.execute = Mock(return_value=Mock(data=consensus_data))
        mock_db.table = Mock(return_value=consensus_table)

        result = swarm_service.get_consensus("swarm-123")

        assert result is not None
        assert result["confidence_score"] == 0.85
        assert len(result["key_insights"]) == 1

    def test_get_consensus_returns_none_if_not_ready(self, swarm_service, mock_db):
        """Getting consensus for incomplete swarm returns None."""
        consensus_table = Mock()
        consensus_table.select = Mock(return_value=consensus_table)
        consensus_table.eq = Mock(return_value=consensus_table)
        consensus_table.single = Mock(return_value=consensus_table)
        consensus_table.execute = Mock(return_value=Mock(data=None))
        mock_db.table = Mock(return_value=consensus_table)

        result = swarm_service.get_consensus("swarm-123")

        assert result is None


# ============================================================================
# Test: Error Handling
# ============================================================================


class TestErrorHandling:
    """Tests for error handling scenarios."""

    def test_handles_empty_topic(self, swarm_service, mock_db, sample_interviews):
        """Empty topic raises ValueError."""
        interviews_table = Mock()
        interviews_table.select = Mock(return_value=interviews_table)
        interviews_table.in_ = Mock(return_value=interviews_table)
        interviews_table.execute = Mock(return_value=Mock(data=sample_interviews[:2]))
        mock_db.table = Mock(return_value=interviews_table)

        with pytest.raises(ValueError, match="topic"):
            swarm_service.create_swarm(
                topic="",
                agent_ids=["int-1", "int-2"],
            )

    def test_handles_empty_agent_ids(self, swarm_service):
        """Empty agent IDs list raises ValueError."""
        with pytest.raises(ValueError, match="agent_ids"):
            swarm_service.create_swarm(
                topic="Test",
                agent_ids=[],
            )

    def test_handles_database_error_gracefully(self, swarm_service, mock_db):
        """Database errors are handled gracefully."""
        interviews_table = Mock()
        interviews_table.select = Mock(return_value=interviews_table)
        interviews_table.in_ = Mock(return_value=interviews_table)
        interviews_table.execute = Mock(side_effect=Exception("DB connection failed"))
        mock_db.table = Mock(return_value=interviews_table)

        with pytest.raises(Exception, match="DB connection failed"):
            swarm_service.create_swarm(
                topic="Test",
                agent_ids=["int-1", "int-2"],
            )


# ============================================================================
# Test: Get Participants
# ============================================================================


class TestGetParticipants:
    """Tests for retrieving swarm participants."""

    def test_get_participants_returns_list(self, swarm_service, mock_db):
        """Getting participants returns agent details."""
        participants = [
            {"agent_id": "a1", "agent_name": "Alice", "interview_id": "int-1"},
            {"agent_id": "a2", "agent_name": "Bob", "interview_id": "int-2"},
        ]

        participants_table = Mock()
        participants_table.select = Mock(return_value=participants_table)
        participants_table.eq = Mock(return_value=participants_table)
        participants_table.execute = Mock(return_value=Mock(data=participants))
        mock_db.table = Mock(return_value=participants_table)

        result = swarm_service.get_participants("swarm-123")

        assert len(result) == 2
        assert result[0]["agent_name"] == "Alice"


# ============================================================================
# Test: Generate Consensus
# ============================================================================


class TestGenerateConsensus:
    """Tests for generating consensus from completed swarm."""

    @patch("app.services.swarm_service.CriticAgent")
    @patch("app.services.swarm_service.ConsensusBuilder")
    def test_generate_consensus_calls_critic_and_builder(
        self, MockBuilder, MockCritic, swarm_service, mock_db
    ):
        """Generating consensus uses critic and builder."""
        # Setup mock swarm output
        swarm_output = {
            "swarm_id": "swarm-123",
            "topic": "Test",
            "participants": [{"agent_id": "a1", "agent_name": "Alice", "message_count": 3}],
            "messages": [{"turn_number": 1, "speaker_name": "Alice", "content": "Hello"}],
            "total_turns": 1,
            "status": "completed",
            "termination_reason": "max_turns",
            "duration_seconds": 10.0,
        }

        # Mock critic evaluation
        mock_critic = MockCritic.return_value
        mock_critic.evaluate.return_value = {
            "swarm_id": "swarm-123",
            "quality": {"overall_score": 7.0},
            "participation": {"balance_score": 0.9},
            "flags": [],
            "recommendations": [],
            "proceed_to_consensus": True,
        }

        # Mock consensus summary
        mock_builder = MockBuilder.return_value
        mock_builder.build_consensus.return_value = {
            "swarm_id": "swarm-123",
            "topic": "Test",
            "participants": [],
            "key_insights": [],
            "areas_of_agreement": [],
            "areas_of_disagreement": [],
            "synthesized_conclusion": "Test conclusion",
            "actionable_items": [],
            "confidence_score": 0.8,
            "consensus_strength": "moderate",
            "generated_at": "2024-01-01T00:00:00Z",
            "model_used": "gpt-4o-mini",
        }

        # Mock database operations
        consensus_table = Mock()
        consensus_table.insert = Mock(return_value=consensus_table)
        consensus_table.execute = Mock(return_value=Mock(data=[{}]))
        mock_db.table = Mock(return_value=consensus_table)

        result = swarm_service.generate_consensus(swarm_output)

        assert result is not None
        mock_critic.evaluate.assert_called_once()
        mock_builder.build_consensus.assert_called_once()

    @patch("app.services.swarm_service.CriticAgent")
    @patch("app.services.swarm_service.ConsensusBuilder")
    def test_generate_consensus_skips_if_critic_rejects(
        self, MockBuilder, MockCritic, swarm_service, mock_db
    ):
        """Consensus generation skips if critic recommends against it."""
        swarm_output = {
            "swarm_id": "swarm-123",
            "topic": "Test",
            "participants": [],
            "messages": [],
            "total_turns": 0,
            "status": "completed",
            "termination_reason": "inactivity",
            "duration_seconds": 5.0,
        }

        mock_critic = MockCritic.return_value
        mock_critic.evaluate.return_value = {
            "swarm_id": "swarm-123",
            "quality": {"overall_score": 2.0},
            "participation": {"balance_score": 0.3},
            "flags": ["low_overall_quality"],
            "recommendations": [],
            "proceed_to_consensus": False,  # Critic rejects
        }

        result = swarm_service.generate_consensus(swarm_output)

        assert result is None
        MockBuilder.return_value.build_consensus.assert_not_called()
