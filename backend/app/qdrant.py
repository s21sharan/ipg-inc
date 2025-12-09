"""
Qdrant vector database connection and utilities.

This module provides connection management for Qdrant vector database.
Used for semantic search, similarity matching, and embedding storage.

Local development: docker-compose up -d qdrant
Cloud deployment: Update QDRANT_HOST, QDRANT_API_KEY, and QDRANT_HTTPS
"""

from typing import Any
from functools import lru_cache

from qdrant_client import QdrantClient
from qdrant_client.http import models
from qdrant_client.http.exceptions import UnexpectedResponse

from .config import get_settings


class QdrantConnection:
    """
    Qdrant connection manager with singleton pattern.

    Supports both local Docker deployment and Qdrant Cloud.
    """

    _instance: "QdrantConnection | None" = None
    _client: QdrantClient | None = None

    def __new__(cls) -> "QdrantConnection":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @property
    def client(self) -> QdrantClient:
        """Get Qdrant client instance (lazy initialization)."""
        if self._client is None:
            settings = get_settings()

            if settings.qdrant_https or settings.qdrant_api_key:
                # Qdrant Cloud configuration
                url = f"https://{settings.qdrant_host}:{settings.qdrant_port}"
                self._client = QdrantClient(
                    url=url,
                    api_key=settings.qdrant_api_key,
                    prefer_grpc=True,
                )
            else:
                # Local Docker configuration
                self._client = QdrantClient(
                    host=settings.qdrant_host,
                    port=settings.qdrant_port,
                    grpc_port=settings.qdrant_grpc_port,
                    prefer_grpc=True,
                )
        return self._client

    def close(self) -> None:
        """Close connection."""
        if self._client:
            self._client.close()
            self._client = None

    def verify_connectivity(self) -> bool:
        """Check if Qdrant is reachable."""
        try:
            self.client.get_collections()
            return True
        except Exception:
            return False


@lru_cache()
def get_qdrant_connection() -> QdrantConnection:
    """Get the singleton Qdrant connection instance."""
    return QdrantConnection()


def get_qdrant() -> QdrantClient:
    """FastAPI dependency to get Qdrant client."""
    return get_qdrant_connection().client


def create_collection(
    name: str,
    vector_size: int = 1536,  # OpenAI text-embedding-3-small default
    distance: str = "Cosine",
    on_disk: bool = False,
) -> bool:
    """
    Create a new collection if it doesn't exist.

    Args:
        name: Collection name
        vector_size: Dimension of vectors (1536 for OpenAI embeddings)
        distance: Distance metric (Cosine, Euclid, Dot)
        on_disk: Store vectors on disk for large collections

    Returns:
        True if created, False if already exists
    """
    client = get_qdrant()

    # Check if collection exists
    collections = client.get_collections().collections
    if any(c.name == name for c in collections):
        return False

    distance_map = {
        "Cosine": models.Distance.COSINE,
        "Euclid": models.Distance.EUCLID,
        "Dot": models.Distance.DOT,
    }

    client.create_collection(
        collection_name=name,
        vectors_config=models.VectorParams(
            size=vector_size,
            distance=distance_map.get(distance, models.Distance.COSINE),
            on_disk=on_disk,
        ),
    )
    return True


def upsert_vectors(
    collection: str,
    ids: list[str],
    vectors: list[list[float]],
    payloads: list[dict[str, Any]] | None = None,
) -> int:
    """
    Upsert vectors into a collection.

    Args:
        collection: Collection name
        ids: List of unique IDs
        vectors: List of embedding vectors
        payloads: Optional metadata for each vector

    Returns:
        Number of vectors upserted
    """
    client = get_qdrant()

    points = [
        models.PointStruct(
            id=id_,
            vector=vector,
            payload=payload if payloads else {},
        )
        for id_, vector, payload in zip(
            ids, vectors, payloads or [{}] * len(ids)
        )
    ]

    client.upsert(collection_name=collection, points=points)
    return len(points)


def search_vectors(
    collection: str,
    query_vector: list[float],
    limit: int = 10,
    score_threshold: float | None = None,
    filter_: dict[str, Any] | None = None,
) -> list[dict]:
    """
    Search for similar vectors.

    Args:
        collection: Collection name
        query_vector: Query embedding vector
        limit: Max results to return
        score_threshold: Minimum similarity score
        filter_: Optional filter conditions

    Returns:
        List of results with id, score, and payload
    """
    client = get_qdrant()

    # Build filter if provided
    qdrant_filter = None
    if filter_:
        conditions = []
        for key, value in filter_.items():
            if isinstance(value, list):
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchAny(any=value),
                    )
                )
            else:
                conditions.append(
                    models.FieldCondition(
                        key=key,
                        match=models.MatchValue(value=value),
                    )
                )
        qdrant_filter = models.Filter(must=conditions)

    results = client.search(
        collection_name=collection,
        query_vector=query_vector,
        limit=limit,
        score_threshold=score_threshold,
        query_filter=qdrant_filter,
    )

    return [
        {
            "id": str(r.id),
            "score": r.score,
            "payload": r.payload,
        }
        for r in results
    ]


def delete_vectors(collection: str, ids: list[str]) -> int:
    """
    Delete vectors by ID.

    Args:
        collection: Collection name
        ids: List of vector IDs to delete

    Returns:
        Number of vectors deleted
    """
    client = get_qdrant()
    client.delete(
        collection_name=collection,
        points_selector=models.PointIdsList(points=ids),
    )
    return len(ids)


def get_collection_info(collection: str) -> dict | None:
    """
    Get collection info including vector count.

    Args:
        collection: Collection name

    Returns:
        Collection info dict or None if not found
    """
    client = get_qdrant()
    try:
        info = client.get_collection(collection)
        return {
            "name": collection,
            "vectors_count": info.vectors_count,
            "points_count": info.points_count,
            "status": info.status.value,
            "vector_size": info.config.params.vectors.size,
            "distance": info.config.params.vectors.distance.value,
        }
    except UnexpectedResponse:
        return None


def health_check() -> dict:
    """
    Check Qdrant health and return status info.

    Returns:
        Dict with status, version, and connection info
    """
    conn = get_qdrant_connection()
    settings = get_settings()

    base_info = {
        "host": settings.qdrant_host,
        "port": settings.qdrant_port,
        "grpc_port": settings.qdrant_grpc_port,
        "https": settings.qdrant_https,
    }

    if not conn.verify_connectivity():
        return {
            **base_info,
            "status": "disconnected",
            "error": "Cannot connect to Qdrant",
        }

    try:
        client = conn.client
        collections = client.get_collections().collections

        # Get total vector count across all collections
        total_vectors = 0
        for coll in collections:
            try:
                info = client.get_collection(coll.name)
                total_vectors += info.vectors_count or 0
            except Exception:
                pass

        return {
            **base_info,
            "status": "connected",
            "collections_count": len(collections),
            "total_vectors": total_vectors,
            "collections": [c.name for c in collections],
        }
    except Exception as e:
        return {
            **base_info,
            "status": "error",
            "error": str(e),
        }
