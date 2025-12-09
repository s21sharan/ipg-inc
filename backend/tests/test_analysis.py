"""
Tests for analysis endpoints.

Note: patch targets where the class is USED (in routers), not where it's DEFINED (in services).
"""

import pytest
from unittest.mock import patch, MagicMock


class TestAnalysisEndpoints:
    """Test suite for /api/analysis endpoints."""

    def test_start_analysis_success(
        self, client, mock_supabase, sample_conversations
    ):
        """Test starting analysis successfully."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_completed_conversations.return_value = sample_conversations
            mock_service.create_analysis_record.return_value = "analysis-123"
            MockService.return_value = mock_service

            response = client.post(
                "/api/analysis/start",
                json={"campaign_id": "campaign-123", "batch_size": 50},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Analysis started"
            assert data["analysis_id"] == "analysis-123"
            assert data["total_conversations"] == 2

    def test_start_analysis_no_conversations(self, client, mock_supabase):
        """Test starting analysis with no completed conversations."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_completed_conversations.return_value = []
            MockService.return_value = mock_service

            response = client.post(
                "/api/analysis/start",
                json={"campaign_id": "campaign-123"},
            )

            assert response.status_code == 400
            assert "No completed conversations" in response.json()["detail"]

    def test_get_analysis_status_completed(self, client, mock_supabase, sample_analysis):
        """Test getting analysis status when completed."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_analysis_status.return_value = {
                "analysis_id": "analysis-1",
                "status": "completed",
                "version": 1,
                "total_batches": 4,
                "completed_batches": 4,
                "report_markdown": "# Analysis Report\n...",
            }
            MockService.return_value = mock_service

            response = client.get("/api/analysis/status/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["version"] == 1
            assert data["total_batches"] == 4
            assert data["completed_batches"] == 4
            assert data["report_markdown"] is not None

    def test_get_analysis_status_processing(self, client, mock_supabase):
        """Test getting analysis status while processing."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_analysis_status.return_value = {
                "analysis_id": "analysis-1",
                "status": "processing",
                "version": 2,
                "total_batches": 4,
                "completed_batches": 2,
                "report_markdown": None,
            }
            MockService.return_value = mock_service

            response = client.get("/api/analysis/status/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            assert data["completed_batches"] == 2
            assert data["total_batches"] == 4

    def test_get_analysis_status_none(self, client, mock_supabase):
        """Test getting analysis status when no analysis exists."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_analysis_status.return_value = {
                "analysis_id": None,
                "status": "none",
                "version": None,
                "total_batches": None,
                "completed_batches": None,
                "report_markdown": None,
            }
            MockService.return_value = mock_service

            response = client.get("/api/analysis/status/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "none"
            assert data["analysis_id"] is None

    def test_get_analysis_by_id(self, client, mock_supabase, sample_analysis):
        """Test getting a specific analysis by ID."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_analysis.return_value = sample_analysis
            MockService.return_value = mock_service

            response = client.get("/api/analysis/analysis-1")

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "analysis-1"
            assert data["status"] == "completed"
            assert "report_markdown" in data

    def test_get_analysis_not_found(self, client, mock_supabase):
        """Test getting non-existent analysis."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_analysis.return_value = None
            MockService.return_value = mock_service

            response = client.get("/api/analysis/non-existent")

            assert response.status_code == 404
            assert "Analysis not found" in response.json()["detail"]

    def test_get_analysis_history(self, client, mock_supabase, sample_analysis):
        """Test getting analysis history for a campaign."""
        analyses = [
            {**sample_analysis, "id": "analysis-1", "version": 1},
            {**sample_analysis, "id": "analysis-2", "version": 2},
        ]

        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_analysis_history.return_value = analyses
            MockService.return_value = mock_service

            response = client.get("/api/analysis/history/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert len(data["analyses"]) == 2
            assert data["analyses"][0]["version"] == 1
            assert data["analyses"][1]["version"] == 2

    def test_start_analysis_custom_batch_size(
        self, client, mock_supabase, sample_conversations
    ):
        """Test starting analysis with custom batch size."""
        with patch("app.routers.analysis.AnalysisService") as MockService:
            mock_service = MagicMock()
            mock_service.get_completed_conversations.return_value = sample_conversations
            mock_service.create_analysis_record.return_value = "analysis-123"
            MockService.return_value = mock_service

            response = client.post(
                "/api/analysis/start",
                json={"campaign_id": "campaign-123", "batch_size": 25},
            )

            assert response.status_code == 200
