"""
Pytest configuration and fixtures for backend API tests.

Provides mocked dependencies (Supabase, Memgraph) and FastAPI test client.
"""

import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from main import app
from app.database import get_db


# ============================================================
# Mock Supabase Client
# ============================================================

class MockSupabaseResponse:
    """Mock response from Supabase queries."""

    def __init__(self, data=None, error=None):
        self.data = data or []
        self.error = error

    def execute(self):
        if self.error:
            raise Exception(self.error)
        return self


class MockSupabaseTable:
    """Mock Supabase table with chainable methods."""

    def __init__(self, data=None):
        self._data = data or []
        self._filters = {}

    def select(self, *args, **kwargs):
        return self

    def insert(self, data, **kwargs):
        self._data = data if isinstance(data, list) else [data]
        return self

    def update(self, data, **kwargs):
        self._data = data
        return self

    def delete(self):
        return self

    def eq(self, column, value):
        self._filters[column] = value
        return self

    def neq(self, column, value):
        return self

    def in_(self, column, values):
        return self

    def limit(self, count):
        return self

    def order(self, column, **kwargs):
        return self

    def single(self):
        return self

    def execute(self):
        return MockSupabaseResponse(data=self._data)


class MockSupabaseClient:
    """Mock Supabase client for testing."""

    def __init__(self):
        self._tables = {}
        self._default_data = {}

    def set_table_data(self, table_name: str, data: list):
        """Pre-set data for a specific table."""
        self._default_data[table_name] = data

    def table(self, name: str) -> MockSupabaseTable:
        data = self._default_data.get(name, [])
        return MockSupabaseTable(data=data)


@pytest.fixture
def mock_supabase():
    """Fixture that provides a mock Supabase client."""
    return MockSupabaseClient()


@pytest.fixture
def client(mock_supabase):
    """FastAPI test client with mocked Supabase dependency."""

    def override_get_db():
        return mock_supabase

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


# ============================================================
# Mock Memgraph
# ============================================================

@pytest.fixture
def mock_memgraph_healthy():
    """Mock Memgraph health check returning healthy status."""
    with patch("app.routers.health.memgraph_health_check") as mock:
        mock.return_value = {
            "host": "localhost",
            "port": 7687,
            "encrypted": False,
            "status": "connected",
            "version": "2.0.0",
            "storage_mode": "IN_MEMORY_TRANSACTIONAL",
            "node_count": 100,
            "edge_count": 250,
        }
        yield mock


@pytest.fixture
def mock_memgraph_unhealthy():
    """Mock Memgraph health check returning unhealthy status."""
    with patch("app.routers.health.memgraph_health_check") as mock:
        mock.return_value = {
            "host": "localhost",
            "port": 7687,
            "encrypted": False,
            "status": "disconnected",
            "error": "Cannot connect to Memgraph",
        }
        yield mock


# ============================================================
# Mock Qdrant
# ============================================================

@pytest.fixture
def mock_qdrant_healthy():
    """Mock Qdrant health check returning healthy status."""
    with patch("app.routers.health.qdrant_health_check") as mock:
        mock.return_value = {
            "host": "localhost",
            "port": 6333,
            "status": "connected",
            "version": "1.7.0",
            "collections_count": 3,
        }
        yield mock


@pytest.fixture
def mock_qdrant_unhealthy():
    """Mock Qdrant health check returning unhealthy status."""
    with patch("app.routers.health.qdrant_health_check") as mock:
        mock.return_value = {
            "host": "localhost",
            "port": 6333,
            "status": "disconnected",
            "error": "Cannot connect to Qdrant",
        }
        yield mock


# ============================================================
# Sample Test Data
# ============================================================

@pytest.fixture
def sample_campaign():
    """Sample campaign data."""
    return {
        "id": "campaign-123",
        "title": "Test Campaign",
        "caption": "A test campaign for unit testing",
        "workspace_id": "workspace-456",
        "user_id": "user-789",
        "topics": [
            {
                "id": "topic-1",
                "name": "Introduction",
                "type": "statement",
                "content": "Welcome to the interview.",
            },
            {
                "id": "topic-2",
                "name": "Main Question",
                "type": "question",
                "question": "What do you think about our product?",
                "probeQuestions": "Why do you feel that way?\nCan you give an example?",
            },
        ],
    }


@pytest.fixture
def sample_interviews():
    """Sample interview data."""
    return [
        {
            "id": "interview-1",
            "name": "Alice",
            "transcript": [
                {"question": "How are you?", "answer": "I'm good!"},
                {"question": "What do you do?", "answer": "I'm a developer."},
            ],
            "reflection_memory": {
                "basic_facts": {"occupation": "Developer"},
                "pain_points_and_frustrations": {"current_problems": ["Too many meetings"]},
            },
            "personality": {"openness": 4.2, "conscientiousness": 3.8},
        },
        {
            "id": "interview-2",
            "name": "Bob",
            "transcript": [
                {"question": "How are you?", "answer": "Doing well!"},
                {"question": "What do you do?", "answer": "I'm a designer."},
            ],
            "reflection_memory": {
                "basic_facts": {"occupation": "Designer"},
                "pain_points_and_frustrations": {"current_problems": ["Tight deadlines"]},
            },
            "personality": {"openness": 3.5, "conscientiousness": 4.1},
        },
    ]


@pytest.fixture
def sample_conversations():
    """Sample conversation data from simulations."""
    return [
        {
            "id": "conv-1",
            "campaign_id": "campaign-123",
            "source_interview_id": "interview-1",
            "participant_name": "Alice",
            "status": "completed",
            "transcript": [
                {"question": "Welcome!", "answer": "Thanks!"},
                {"question": "What do you think?", "answer": "It's great!"},
            ],
        },
        {
            "id": "conv-2",
            "campaign_id": "campaign-123",
            "source_interview_id": "interview-2",
            "participant_name": "Bob",
            "status": "completed",
            "transcript": [
                {"question": "Welcome!", "answer": "Hello!"},
                {"question": "What do you think?", "answer": "I like it!"},
            ],
        },
    ]


@pytest.fixture
def sample_analysis():
    """Sample analysis data."""
    return {
        "id": "analysis-1",
        "campaign_id": "campaign-123",
        "status": "completed",
        "version": 1,
        "report_markdown": "# Analysis Report\n\n## Key Findings\n...",
        "dashboard_json": {"themes": [], "statistics": {}},
    }


@pytest.fixture
def sample_clusters():
    """Sample clustering data."""
    return {
        "id": "cluster-1",
        "campaign_id": "campaign-123",
        "status": "completed",
        "dimension": "pain_points",
        "dimension_rationale": "Users discussed pain points most frequently",
        "clusters": [
            {
                "id": "c1",
                "title": "Performance Issues",
                "summary": "Users frustrated with slow loading times",
                "quotes": ["It's too slow", "Takes forever to load"],
                "matched_users": 5,
                "prevalence": "25%",
                "confidence": 0.85,
                "members": [],
            },
        ],
    }
