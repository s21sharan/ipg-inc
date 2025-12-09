"""
Persistent Memory Store for Generative Agents.

Provides integration with Qdrant (vector storage) and Memgraph (relationship graph)
to enable persistent memory across agent sessions.

Memory Hierarchy:
- Long-term memories: Extracted from original interviews (pre-loaded)
- Session memories: Created during conversations (observations, plans, actions)
- Reflections: Higher-order insights derived from multiple memories

Reference: SyntheticCohorts Framework Section 2.1 (Memory Stream)
"""

from datetime import datetime, timezone
from typing import Any
import uuid

from qdrant_client.http import models as qdrant_models

from ..qdrant import get_qdrant, search_vectors, upsert_vectors
from ..memgraph import execute_query, execute_write
from .agent_state import MemoryObject
from .llm_client import get_llm_client


# Qdrant collection for memory embeddings
MEMORY_COLLECTION = "memory_embeddings"

# Memory type constants
MEMORY_TYPE_OBSERVATION = "observation"
MEMORY_TYPE_PLAN = "plan"
MEMORY_TYPE_ACTION = "action"
MEMORY_TYPE_REFLECTION = "reflection"


class PersistentMemoryStore:
    """
    Persistent memory storage with Qdrant + Memgraph backend.

    Handles:
    - Loading long-term memories from Qdrant
    - Saving new session memories to Qdrant
    - Creating memory relationships in Memgraph
    - Semantic retrieval with filtering
    """

    def __init__(self, agent_id: str):
        """
        Initialize persistent memory store for an agent.

        Args:
            agent_id: UUID of the agent (interview_id)
        """
        self.agent_id = agent_id
        self._llm_client = get_llm_client()
        self._qdrant = get_qdrant()

    def load_memories(
        self,
        limit: int = 100,
        memory_types: list[str] | None = None,
    ) -> list[MemoryObject]:
        """
        Load memories from Qdrant for this agent.

        Args:
            limit: Maximum number of memories to load
            memory_types: Optional filter by memory type

        Returns:
            List of MemoryObject dicts
        """
        # Build filter for agent_id
        filter_conditions = [
            qdrant_models.FieldCondition(
                key="agent_id",
                match=qdrant_models.MatchValue(value=self.agent_id),
            )
        ]

        # Add memory type filter if specified
        if memory_types:
            filter_conditions.append(
                qdrant_models.FieldCondition(
                    key="memory_type",
                    match=qdrant_models.MatchAny(any=memory_types),
                )
            )

        # Scroll through all matching points (not search, just retrieve)
        try:
            result = self._qdrant.scroll(
                collection_name=MEMORY_COLLECTION,
                scroll_filter=qdrant_models.Filter(must=filter_conditions),
                limit=limit,
                with_payload=True,
                with_vectors=True,
            )

            memories: list[MemoryObject] = []
            for point in result[0]:
                payload = point.payload or {}
                memories.append({
                    "id": str(point.id),
                    "content": payload.get("content", ""),
                    "timestamp": payload.get("timestamp", ""),
                    "importance": float(payload.get("importance", 5.0)),
                    "memory_type": payload.get("memory_type", "observation"),
                    "embedding": point.vector if isinstance(point.vector, list) else None,
                })

            return memories

        except Exception as e:
            print(f"Warning: Failed to load memories from Qdrant: {e}")
            return []

    def save_memory(
        self,
        memory: MemoryObject,
        source_memory_ids: list[str] | None = None,
    ) -> str:
        """
        Save a single memory to Qdrant and create graph relationships.

        Args:
            memory: MemoryObject to save
            source_memory_ids: IDs of memories this was derived from (for reflections)

        Returns:
            ID of the saved memory
        """
        memory_id = memory.get("id") or str(uuid.uuid4())

        # Generate embedding if not present
        embedding = memory.get("embedding")
        if embedding is None:
            embedding = self._llm_client.generate_embedding(memory["content"])

        # Prepare payload
        payload = {
            "agent_id": self.agent_id,
            "content": memory["content"],
            "timestamp": memory.get("timestamp") or datetime.now(timezone.utc).isoformat(),
            "importance": memory.get("importance", 5.0),
            "memory_type": memory.get("memory_type", "observation"),
            "session_id": memory.get("session_id", ""),  # Track which conversation
        }

        # Upsert to Qdrant
        try:
            self._qdrant.upsert(
                collection_name=MEMORY_COLLECTION,
                points=[
                    qdrant_models.PointStruct(
                        id=memory_id,
                        vector=embedding,
                        payload=payload,
                    )
                ],
                wait=True,
            )
        except Exception as e:
            print(f"Warning: Failed to save memory to Qdrant: {e}")
            return memory_id

        # Create graph relationships
        self._create_memory_node(memory_id, payload)

        # If this is a reflection, create DERIVED_FROM relationships
        if source_memory_ids and memory.get("memory_type") == MEMORY_TYPE_REFLECTION:
            for source_id in source_memory_ids:
                self._create_derived_from_relationship(memory_id, source_id)

        return memory_id

    def save_memories_batch(
        self,
        memories: list[MemoryObject],
        session_id: str | None = None,
    ) -> list[str]:
        """
        Save multiple memories efficiently in a batch.

        Args:
            memories: List of MemoryObjects to save
            session_id: Optional session identifier for tracking

        Returns:
            List of saved memory IDs
        """
        if not memories:
            return []

        saved_ids: list[str] = []
        points: list[qdrant_models.PointStruct] = []

        for memory in memories:
            memory_id = memory.get("id") or str(uuid.uuid4())
            saved_ids.append(memory_id)

            # Generate embedding if not present
            embedding = memory.get("embedding")
            if embedding is None:
                embedding = self._llm_client.generate_embedding(memory["content"])

            payload = {
                "agent_id": self.agent_id,
                "content": memory["content"],
                "timestamp": memory.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                "importance": memory.get("importance", 5.0),
                "memory_type": memory.get("memory_type", "observation"),
                "session_id": session_id or "",
            }

            points.append(
                qdrant_models.PointStruct(
                    id=memory_id,
                    vector=embedding,
                    payload=payload,
                )
            )

            # Create graph node
            self._create_memory_node(memory_id, payload)

        # Batch upsert to Qdrant
        try:
            self._qdrant.upsert(
                collection_name=MEMORY_COLLECTION,
                points=points,
                wait=True,
            )
        except Exception as e:
            print(f"Warning: Failed to batch save memories to Qdrant: {e}")

        return saved_ids

    def search_similar(
        self,
        query: str,
        limit: int = 10,
        memory_types: list[str] | None = None,
        score_threshold: float | None = None,
    ) -> list[MemoryObject]:
        """
        Search for semantically similar memories.

        Args:
            query: Search query text
            limit: Maximum results
            memory_types: Optional filter by type
            score_threshold: Minimum similarity score

        Returns:
            List of matching MemoryObjects with scores
        """
        # Generate query embedding
        query_embedding = self._llm_client.generate_embedding(query)

        # Build filter
        filter_conditions = [
            qdrant_models.FieldCondition(
                key="agent_id",
                match=qdrant_models.MatchValue(value=self.agent_id),
            )
        ]

        if memory_types:
            filter_conditions.append(
                qdrant_models.FieldCondition(
                    key="memory_type",
                    match=qdrant_models.MatchAny(any=memory_types),
                )
            )

        try:
            results = self._qdrant.search(
                collection_name=MEMORY_COLLECTION,
                query_vector=query_embedding,
                query_filter=qdrant_models.Filter(must=filter_conditions),
                limit=limit,
                score_threshold=score_threshold,
                with_payload=True,
                with_vectors=True,
            )

            memories: list[MemoryObject] = []
            for hit in results:
                payload = hit.payload or {}
                memories.append({
                    "id": str(hit.id),
                    "content": payload.get("content", ""),
                    "timestamp": payload.get("timestamp", ""),
                    "importance": float(payload.get("importance", 5.0)),
                    "memory_type": payload.get("memory_type", "observation"),
                    "embedding": hit.vector if isinstance(hit.vector, list) else None,
                    "score": hit.score,  # Add similarity score
                })

            return memories

        except Exception as e:
            print(f"Warning: Failed to search memories: {e}")
            return []

    def _create_memory_node(self, memory_id: str, payload: dict[str, Any]) -> None:
        """Create or update Memory node in Memgraph with REMEMBERS relationship."""
        try:
            # Create Memory node and link to Agent
            # Note: Memory is escaped with backticks as it's a reserved word in Memgraph
            query = """
            MATCH (a:Agent {id: $agent_id})
            MERGE (m:`Memory` {id: $memory_id})
            SET m.content = $content,
                m.timestamp = $timestamp,
                m.importance = $importance,
                m.memory_type = $memory_type,
                m.session_id = $session_id
            MERGE (a)-[r:REMEMBERS]->(m)
            SET r.created_at = COALESCE(r.created_at, $timestamp)
            RETURN m.id AS id
            """
            execute_write(query, {
                "agent_id": self.agent_id,
                "memory_id": memory_id,
                "content": payload.get("content", ""),
                "timestamp": payload.get("timestamp", ""),
                "importance": payload.get("importance", 5.0),
                "memory_type": payload.get("memory_type", "observation"),
                "session_id": payload.get("session_id", ""),
            })
        except Exception as e:
            print(f"Warning: Failed to create memory node in Memgraph: {e}")

    def _create_derived_from_relationship(
        self,
        reflection_id: str,
        source_memory_id: str,
    ) -> None:
        """Create DERIVED_FROM relationship between reflection and source memory."""
        try:
            # Note: Memory is escaped with backticks as it's a reserved word in Memgraph
            query = """
            MATCH (r:`Memory` {id: $reflection_id})
            MATCH (s:`Memory` {id: $source_id})
            MERGE (r)-[d:DERIVED_FROM]->(s)
            SET d.created_at = datetime()
            RETURN r.id AS reflection_id, s.id AS source_id
            """
            execute_write(query, {
                "reflection_id": reflection_id,
                "source_id": source_memory_id,
            })
        except Exception as e:
            print(f"Warning: Failed to create DERIVED_FROM relationship: {e}")

    def get_memory_graph(
        self,
        depth: int = 2,
    ) -> dict[str, Any]:
        """
        Get the memory graph for this agent from Memgraph.

        Args:
            depth: How many hops to traverse

        Returns:
            Dict with nodes and relationships
        """
        try:
            # Get memories and their relationships
            # Note: Memory is escaped with backticks as it's a reserved word in Memgraph
            query = """
            MATCH (a:Agent {id: $agent_id})-[:REMEMBERS]->(m:`Memory`)
            OPTIONAL MATCH (m)-[d:DERIVED_FROM]->(source:`Memory`)
            RETURN m.id AS memory_id,
                   m.content AS content,
                   m.memory_type AS memory_type,
                   m.importance AS importance,
                   m.timestamp AS timestamp,
                   collect(DISTINCT source.id) AS derived_from
            ORDER BY m.timestamp DESC
            LIMIT 100
            """
            results = execute_query(query, {"agent_id": self.agent_id})

            return {
                "agent_id": self.agent_id,
                "memories": results,
                "count": len(results),
            }
        except Exception as e:
            print(f"Warning: Failed to get memory graph: {e}")
            return {"agent_id": self.agent_id, "memories": [], "count": 0}

    def get_reflection_sources(self, reflection_id: str) -> list[str]:
        """Get the source memory IDs that a reflection was derived from."""
        try:
            # Note: Memory is escaped with backticks as it's a reserved word in Memgraph
            query = """
            MATCH (r:`Memory` {id: $reflection_id})-[:DERIVED_FROM]->(s:`Memory`)
            RETURN s.id AS source_id
            """
            results = execute_query(query, {"reflection_id": reflection_id})
            return [r["source_id"] for r in results]
        except Exception as e:
            print(f"Warning: Failed to get reflection sources: {e}")
            return []

    def count_memories(self, memory_type: str | None = None) -> int:
        """Count memories in Qdrant for this agent."""
        try:
            filter_conditions = [
                qdrant_models.FieldCondition(
                    key="agent_id",
                    match=qdrant_models.MatchValue(value=self.agent_id),
                )
            ]

            if memory_type:
                filter_conditions.append(
                    qdrant_models.FieldCondition(
                        key="memory_type",
                        match=qdrant_models.MatchValue(value=memory_type),
                    )
                )

            result = self._qdrant.count(
                collection_name=MEMORY_COLLECTION,
                count_filter=qdrant_models.Filter(must=filter_conditions),
            )
            return result.count
        except Exception as e:
            print(f"Warning: Failed to count memories: {e}")
            return 0


def get_persistent_memory_store(agent_id: str) -> PersistentMemoryStore:
    """Factory function for creating PersistentMemoryStore instances."""
    return PersistentMemoryStore(agent_id)
