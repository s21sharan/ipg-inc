"""
Tests for swarm API router endpoints.

Tests cover:
- POST /api/swarm/create - Create new swarm
- GET /api/swarm/status/{swarm_id} - Get swarm status
- GET /api/swarm/messages/{swarm_id} - Get messages with pagination
- GET /api/swarm/consensus/{swarm_id} - Get consensus summary
- POST /api/swarm/{swarm_id}/stop - Stop swarm manually
- GET /api/swarm/participants/{swarm_id} - Get participants
"""

import pytest
from unittest.mock import Mock, patch, MagicMock
from fastapi.testclient import TestClient
from fastapi import FastAPI

from app.routers.swarm import router


# ============================================================================
# Test Setup
# ============================================================================


@pytest.fixture
def app():
    """Create test FastAPI app with swarm router."""
    app = FastAPI()
    app.include_router(router, prefix="/api/swarm")
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def mock_db():
    """Mock database dependency."""
    return Mock()


@pytest.fixture
def mock_service():
    """Mock SwarmService."""
    with patch("app.routers.swarm.SwarmService") as MockService:
        service_instance = Mock()
        MockService.return_value = service_instance
        yield service_instance


# ============================================================================
# Test: Create Swarm Endpoint
# ============================================================================


class TestCreateSwarmEndpoint:
    """Tests for POST /api/swarm/create endpoint."""

    def test_create_swarm_success(self, client, mock_service):
        """Creating a swarm with valid data succeeds."""
        mock_service.create_swarm.return_value = {
            "swarm_id": "swarm-123",
            "status": "active",
            "topic": "AI Discussion",
            "participant_count": 3,
        }

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.post(
                "/api/swarm/create",
                json={
                    "topic": "AI Discussion",
                    "agent_ids": ["a1", "a2", "a3"],
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert data["swarm_id"] == "swarm-123"
        assert data["status"] == "active"

    def test_create_swarm_with_config(self, client, mock_service):
        """Creating a swarm with custom config."""
        mock_service.create_swarm.return_value = {
            "swarm_id": "swarm-456",
            "status": "active",
            "topic": "Test",
            "participant_count": 2,
        }

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.post(
                "/api/swarm/create",
                json={
                    "topic": "Test Discussion",
                    "agent_ids": ["a1", "a2"],
                    "config": {
                        "max_turns": 30,
                        "speaker_selection": "round_robin",
                    },
                },
            )

        assert response.status_code == 200
        mock_service.create_swarm.assert_called_once()
        call_args = mock_service.create_swarm.call_args
        assert call_args[1]["config"]["max_turns"] == 30

    def test_create_swarm_validation_error(self, client, mock_service):
        """Creating a swarm with invalid data returns 422."""
        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.post(
                "/api/swarm/create",
                json={
                    "topic": "Test",
                    # Missing agent_ids
                },
            )

        assert response.status_code == 422

    def test_create_swarm_service_error(self, client, mock_service):
        """Service errors are returned as 400."""
        mock_service.create_swarm.side_effect = ValueError("at least 2 agents")

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.post(
                "/api/swarm/create",
                json={
                    "topic": "Test",
                    "agent_ids": ["a1"],
                },
            )

        assert response.status_code == 400
        assert "at least 2 agents" in response.json()["detail"]


# ============================================================================
# Test: Get Status Endpoint
# ============================================================================


class TestGetStatusEndpoint:
    """Tests for GET /api/swarm/status/{swarm_id} endpoint."""

    def test_get_status_success(self, client, mock_service):
        """Getting status for existing swarm succeeds."""
        mock_service.get_swarm_status.return_value = {
            "id": "swarm-123",
            "topic": "Test",
            "status": "active",
            "message_count": 10,
            "config": {},
            "created_at": "2024-01-01T00:00:00Z",
        }

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/status/swarm-123")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "swarm-123"
        assert data["message_count"] == 10

    def test_get_status_not_found(self, client, mock_service):
        """Getting status for non-existent swarm returns 404."""
        mock_service.get_swarm_status.return_value = None

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/status/nonexistent")

        assert response.status_code == 404


# ============================================================================
# Test: Get Messages Endpoint
# ============================================================================


class TestGetMessagesEndpoint:
    """Tests for GET /api/swarm/messages/{swarm_id} endpoint."""

    def test_get_messages_success(self, client, mock_service):
        """Getting messages returns list."""
        mock_service.get_messages.return_value = [
            {"id": "m1", "turn_number": 1, "content": "Hello"},
            {"id": "m2", "turn_number": 2, "content": "Hi"},
        ]

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/messages/swarm-123")

        assert response.status_code == 200
        data = response.json()
        assert len(data["messages"]) == 2

    def test_get_messages_with_pagination(self, client, mock_service):
        """Getting messages with offset and limit."""
        mock_service.get_messages.return_value = []

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/messages/swarm-123?offset=10&limit=5")

        assert response.status_code == 200
        mock_service.get_messages.assert_called_once_with(
            "swarm-123", offset=10, limit=5
        )


# ============================================================================
# Test: Get Consensus Endpoint
# ============================================================================


class TestGetConsensusEndpoint:
    """Tests for GET /api/swarm/consensus/{swarm_id} endpoint."""

    def test_get_consensus_success(self, client, mock_service):
        """Getting consensus for completed swarm succeeds."""
        mock_service.get_consensus.return_value = {
            "swarm_id": "swarm-123",
            "key_insights": [{"insight": "Test insight"}],
            "synthesized_conclusion": "Test conclusion",
            "confidence_score": 0.85,
            "consensus_strength": "moderate",
        }

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/consensus/swarm-123")

        assert response.status_code == 200
        data = response.json()
        assert data["confidence_score"] == 0.85

    def test_get_consensus_not_ready(self, client, mock_service):
        """Getting consensus for incomplete swarm returns 404."""
        mock_service.get_consensus.return_value = None

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/consensus/swarm-123")

        assert response.status_code == 404


# ============================================================================
# Test: Stop Swarm Endpoint
# ============================================================================


class TestStopSwarmEndpoint:
    """Tests for POST /api/swarm/{swarm_id}/stop endpoint."""

    def test_stop_swarm_success(self, client, mock_service):
        """Stopping active swarm succeeds."""
        mock_service.stop_swarm.return_value = True

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.post("/api/swarm/swarm-123/stop")

        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_stop_swarm_not_found(self, client, mock_service):
        """Stopping non-existent swarm returns 404."""
        mock_service.stop_swarm.return_value = False

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.post("/api/swarm/nonexistent/stop")

        assert response.status_code == 404


# ============================================================================
# Test: Get Participants Endpoint
# ============================================================================


class TestGetParticipantsEndpoint:
    """Tests for GET /api/swarm/participants/{swarm_id} endpoint."""

    def test_get_participants_success(self, client, mock_service):
        """Getting participants returns list."""
        mock_service.get_participants.return_value = [
            {"agent_id": "a1", "agent_name": "Alice"},
            {"agent_id": "a2", "agent_name": "Bob"},
        ]

        with patch("app.routers.swarm.get_db", return_value=Mock()):
            response = client.get("/api/swarm/participants/swarm-123")

        assert response.status_code == 200
        data = response.json()
        assert len(data["participants"]) == 2
        assert data["participants"][0]["agent_name"] == "Alice"
