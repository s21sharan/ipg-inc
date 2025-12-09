"""
Tests for simulation endpoints.

Note: patch targets where the class is USED (in routers), not where it's DEFINED (in services).
"""

import pytest
from unittest.mock import patch, MagicMock


class TestSimulationEndpoints:
    """Test suite for /api/simulation endpoints."""

    def test_start_simulation_success(
        self, client, mock_supabase, sample_campaign, sample_interviews
    ):
        """Test starting a simulation successfully."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.get_campaign.return_value = sample_campaign
            mock_service.get_workspace_interviews.return_value = sample_interviews
            MockService.return_value = mock_service

            response = client.post(
                "/api/simulation/start",
                json={"campaign_id": "campaign-123", "batch_size": 10},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Simulation started"
            assert data["campaign_id"] == "campaign-123"
            assert data["total_interviews"] == 2

    def test_start_simulation_campaign_not_found(self, client, mock_supabase):
        """Test starting simulation with non-existent campaign."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.get_campaign.return_value = None
            MockService.return_value = mock_service

            response = client.post(
                "/api/simulation/start",
                json={"campaign_id": "non-existent", "batch_size": 10},
            )

            assert response.status_code == 404
            assert "Campaign not found" in response.json()["detail"]

    def test_start_simulation_no_interviews(
        self, client, mock_supabase, sample_campaign
    ):
        """Test starting simulation with no interviews in workspace."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.get_campaign.return_value = sample_campaign
            mock_service.get_workspace_interviews.return_value = []
            MockService.return_value = mock_service

            response = client.post(
                "/api/simulation/start",
                json={"campaign_id": "campaign-123"},
            )

            assert response.status_code == 400
            assert "No interviews found" in response.json()["detail"]

    def test_get_simulation_status(self, client, mock_supabase):
        """Test getting simulation status."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.get_simulation_status.return_value = {
                "total": 10,
                "completed": 5,
                "in_progress": 2,
                "failed": 1,
                "pending": 2,
            }
            MockService.return_value = mock_service

            response = client.get("/api/simulation/status/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["campaign_id"] == "campaign-123"
            assert data["total"] == 10
            assert data["completed"] == 5
            assert data["in_progress"] == 2
            assert data["failed"] == 1
            assert data["pending"] == 2

    def test_delete_specific_conversations(self, client, mock_supabase):
        """Test deleting specific conversations."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.delete_conversations.return_value = 3
            MockService.return_value = mock_service

            # FastAPI list query params need multiple key-value pairs
            response = client.delete(
                "/api/simulation/conversations/campaign-123"
                "?conversation_ids=conv-1&conversation_ids=conv-2&conversation_ids=conv-3",
            )

            assert response.status_code == 200
            assert response.json()["deleted"] == 3

    def test_delete_all_campaign_conversations(self, client, mock_supabase):
        """Test deleting all conversations for a campaign."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.delete_all_campaign_conversations.return_value = 10
            MockService.return_value = mock_service

            response = client.delete("/api/simulation/conversations/campaign-123")

            assert response.status_code == 200
            assert response.json()["deleted"] == 10

    def test_start_simulation_custom_batch_size(
        self, client, mock_supabase, sample_campaign, sample_interviews
    ):
        """Test starting simulation with custom batch size."""
        with patch("app.routers.simulation.SimulationService") as MockService:
            mock_service = MagicMock()
            mock_service.get_campaign.return_value = sample_campaign
            mock_service.get_workspace_interviews.return_value = sample_interviews
            MockService.return_value = mock_service

            response = client.post(
                "/api/simulation/start",
                json={"campaign_id": "campaign-123", "batch_size": 5},
            )

            assert response.status_code == 200

    def test_start_simulation_invalid_request(self, client):
        """Test starting simulation with invalid request body."""
        response = client.post(
            "/api/simulation/start",
            json={},  # Missing required campaign_id
        )

        assert response.status_code == 422  # Validation error
