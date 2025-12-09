"""
Tests for clustering endpoints.

Note: patch targets where the class is USED (in routers), not where it's DEFINED (in services).
"""

import pytest
from unittest.mock import patch, MagicMock


class TestClusteringEndpoints:
    """Test suite for /api/clustering endpoints."""

    def test_start_clustering_success(
        self, client, mock_supabase, sample_conversations
    ):
        """Test starting clustering successfully."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_completed_conversations.return_value = sample_conversations
            mock_service.create_clustering_record.return_value = "cluster-123"
            MockService.return_value = mock_service

            response = client.post(
                "/api/clustering/start",
                json={"campaign_id": "campaign-123", "num_clusters": 4},
            )

            assert response.status_code == 200
            data = response.json()
            assert data["message"] == "Clustering started"
            assert data["cluster_id"] == "cluster-123"
            assert data["total_conversations"] == 2

    def test_start_clustering_no_conversations(self, client, mock_supabase):
        """Test starting clustering with no completed conversations."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_completed_conversations.return_value = []
            MockService.return_value = mock_service

            response = client.post(
                "/api/clustering/start",
                json={"campaign_id": "campaign-123"},
            )

            assert response.status_code == 400
            assert "No completed conversations" in response.json()["detail"]

    def test_start_clustering_custom_num_clusters(
        self, client, mock_supabase, sample_conversations
    ):
        """Test starting clustering with custom number of clusters."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_completed_conversations.return_value = sample_conversations
            mock_service.create_clustering_record.return_value = "cluster-123"
            MockService.return_value = mock_service

            response = client.post(
                "/api/clustering/start",
                json={"campaign_id": "campaign-123", "num_clusters": 6},
            )

            assert response.status_code == 200

    def test_get_latest_clusters_completed(self, client, mock_supabase, sample_clusters):
        """Test getting latest clusters when completed."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_clusters.return_value = {
                "status": "completed",
                "dimension": "pain_points",
                "dimension_rationale": "Users discussed pain points most frequently",
                "conversations_analyzed": 50,
                "clusters": sample_clusters["clusters"],
            }
            MockService.return_value = mock_service

            response = client.get("/api/clustering/latest/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["dimension"] == "pain_points"
            assert len(data["clusters"]) == 1
            assert data["clusters"][0]["title"] == "Performance Issues"

    def test_get_latest_clusters_processing(self, client, mock_supabase):
        """Test getting latest clusters while processing."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_clusters.return_value = {
                "status": "processing",
                "dimension": None,
                "dimension_rationale": None,
                "conversations_analyzed": None,
                "clusters": None,
            }
            MockService.return_value = mock_service

            response = client.get("/api/clustering/latest/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            assert data["clusters"] is None

    def test_get_latest_clusters_none(self, client, mock_supabase):
        """Test getting latest clusters when none exist."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_clusters.return_value = {
                "status": "none",
                "dimension": None,
                "dimension_rationale": None,
                "conversations_analyzed": None,
                "clusters": None,
            }
            MockService.return_value = mock_service

            response = client.get("/api/clustering/latest/campaign-123")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "none"

    def test_get_cluster_details(self, client, mock_supabase, sample_clusters):
        """Test getting specific cluster details."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_cluster_details.return_value = sample_clusters
            MockService.return_value = mock_service

            response = client.get("/api/clustering/cluster-1")

            assert response.status_code == 200
            data = response.json()
            assert data["id"] == "cluster-1"
            assert data["status"] == "completed"

    def test_get_cluster_details_not_found(self, client, mock_supabase):
        """Test getting non-existent cluster details."""
        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_cluster_details.return_value = None
            MockService.return_value = mock_service

            response = client.get("/api/clustering/non-existent")

            assert response.status_code == 404
            assert "Clustering not found" in response.json()["detail"]

    def test_cluster_response_structure(self, client, mock_supabase):
        """Test that cluster response has correct structure."""
        cluster_data = {
            "status": "completed",
            "dimension": "goals",
            "dimension_rationale": "Users focused on goals",
            "conversations_analyzed": 100,
            "clusters": [
                {
                    "id": "c1",
                    "title": "Career Growth",
                    "summary": "Users want to advance their careers",
                    "quotes": ["I want to grow", "Need more opportunities"],
                    "matched_users": 25,
                    "prevalence": "25%",
                    "confidence": 0.92,
                    "members": [{"id": "u1", "name": "Alice"}],
                },
                {
                    "id": "c2",
                    "title": "Work-Life Balance",
                    "summary": "Users struggle with balance",
                    "quotes": ["Too much work", "Need more time off"],
                    "matched_users": 30,
                    "prevalence": "30%",
                    "confidence": 0.88,
                    "members": [{"id": "u2", "name": "Bob"}],
                },
            ],
        }

        with patch("app.routers.clustering.ClusteringService") as MockService:
            mock_service = MagicMock()
            mock_service.get_latest_clusters.return_value = cluster_data
            MockService.return_value = mock_service

            response = client.get("/api/clustering/latest/campaign-123")

            assert response.status_code == 200
            data = response.json()

            # Verify structure
            assert "status" in data
            assert "dimension" in data
            assert "clusters" in data
            assert len(data["clusters"]) == 2

            # Verify cluster structure
            cluster = data["clusters"][0]
            assert "id" in cluster
            assert "title" in cluster
            assert "summary" in cluster
            assert "quotes" in cluster
            assert "matched_users" in cluster
            assert "prevalence" in cluster
            assert "confidence" in cluster
            assert "members" in cluster
