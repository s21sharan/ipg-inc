"""
Tests for health check endpoints.
"""

import pytest
from unittest.mock import patch


class TestHealthEndpoints:
    """Test suite for /health endpoints."""

    def test_basic_health_check(self, client):
        """Test basic health check returns healthy status."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"

    def test_detailed_health_check_all_healthy(
        self, client, mock_supabase, mock_memgraph_healthy, mock_qdrant_healthy
    ):
        """Test detailed health check when all services are healthy."""
        # Mock Supabase to return successful query
        mock_supabase.set_table_data("workspaces", [{"id": "test-workspace"}])

        response = client.get("/health/detailed")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["supabase"] == "healthy"
        assert data["memgraph"]["status"] == "connected"
        assert data["qdrant"]["status"] == "connected"
        assert data["openai_configured"] is True

    def test_detailed_health_check_memgraph_unhealthy(
        self, client, mock_supabase, mock_memgraph_unhealthy, mock_qdrant_healthy
    ):
        """Test detailed health check when Memgraph is down."""
        mock_supabase.set_table_data("workspaces", [{"id": "test-workspace"}])

        response = client.get("/health/detailed")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["supabase"] == "healthy"
        assert data["memgraph"]["status"] == "disconnected"
        assert data["qdrant"]["status"] == "connected"

    def test_detailed_health_check_qdrant_unhealthy(
        self, client, mock_supabase, mock_memgraph_healthy, mock_qdrant_unhealthy
    ):
        """Test detailed health check when Qdrant is down."""
        mock_supabase.set_table_data("workspaces", [{"id": "test-workspace"}])

        response = client.get("/health/detailed")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "degraded"
        assert data["supabase"] == "healthy"
        assert data["memgraph"]["status"] == "connected"
        assert data["qdrant"]["status"] == "disconnected"

    def test_memgraph_health_endpoint(self, client, mock_memgraph_healthy):
        """Test Memgraph-specific health endpoint."""
        response = client.get("/health/memgraph")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "connected"
        assert data["host"] == "localhost"
        assert data["port"] == 7687
        assert "version" in data
        assert "node_count" in data
        assert "edge_count" in data

    def test_memgraph_health_endpoint_disconnected(self, client, mock_memgraph_unhealthy):
        """Test Memgraph health endpoint when disconnected."""
        response = client.get("/health/memgraph")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "disconnected"
        assert "error" in data

    def test_qdrant_health_endpoint(self, client, mock_qdrant_healthy):
        """Test Qdrant-specific health endpoint."""
        response = client.get("/health/qdrant")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "connected"
        assert data["host"] == "localhost"
        assert data["port"] == 6333
        assert "version" in data
        assert "collections_count" in data

    def test_qdrant_health_endpoint_disconnected(self, client, mock_qdrant_unhealthy):
        """Test Qdrant health endpoint when disconnected."""
        response = client.get("/health/qdrant")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "disconnected"
        assert "error" in data
