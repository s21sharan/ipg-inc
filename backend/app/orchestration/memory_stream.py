"""
Memory Stream implementation for generative agents.

Implements the memory retrieval function that balances:
- Recency: Decay function prioritizing recent memories
- Importance: Poignancy scores for pivotal vs mundane events
- Relevance: Semantic similarity via embeddings

Now with persistent storage via Qdrant (vectors) and Memgraph (relationships).

Reference: SyntheticCohorts Framework Section 2.1 (Memory Stream and Retrieval)
"""

import math
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import numpy as np

from .agent_state import MemoryObject
from .llm_client import get_llm_client

if TYPE_CHECKING:
    from .persistent_memory import PersistentMemoryStore


# Retrieval scoring weights (sum to 1.0)
WEIGHT_RECENCY = 0.3
WEIGHT_IMPORTANCE = 0.3
WEIGHT_RELEVANCE = 0.4

# Recency decay parameters
DECAY_RATE = 0.995  # Per-hour decay rate


class MemoryStream:
    """
    Agent memory stream with retrieval scoring.

    Maintains a temporally indexed log of observations, actions, and reflections.
    Implements the weighted retrieval function for surfacing relevant memories.

    Supports persistent storage via Qdrant (vector embeddings) and Memgraph
    (memory relationships) for cross-session memory continuity.
    """

    def __init__(
        self,
        agent_id: str,
        max_memories: int = 1000,
        recency_weight: float = WEIGHT_RECENCY,
        importance_weight: float = WEIGHT_IMPORTANCE,
        relevance_weight: float = WEIGHT_RELEVANCE,
        persistent: bool = False,
        session_id: str | None = None,
    ):
        """
        Initialize memory stream.

        Args:
            agent_id: Unique identifier for the agent
            max_memories: Maximum memories to retain (oldest are pruned)
            recency_weight: Weight for recency score (0-1)
            importance_weight: Weight for importance score (0-1)
            relevance_weight: Weight for relevance score (0-1)
            persistent: Enable persistent storage via Qdrant/Memgraph
            session_id: Unique ID for this conversation session
        """
        self.agent_id = agent_id
        self.max_memories = max_memories
        self.memories: list[MemoryObject] = []
        self.persistent = persistent
        self.session_id = session_id or str(uuid.uuid4())

        # Track new memories created this session (for persistence)
        self._new_memories: list[MemoryObject] = []
        self._reflection_sources: dict[str, list[str]] = {}  # reflection_id -> source_ids

        # Normalize weights
        total = recency_weight + importance_weight + relevance_weight
        self.recency_weight = recency_weight / total
        self.importance_weight = importance_weight / total
        self.relevance_weight = relevance_weight / total

        self._llm_client = get_llm_client()
        self._persistent_store: "PersistentMemoryStore | None" = None

        # Initialize persistent store if enabled
        if self.persistent:
            self._init_persistent_store()

    def add_memory(
        self,
        content: str,
        memory_type: str = "observation",
        importance: float | None = None,
        embedding: list[float] | None = None,
    ) -> MemoryObject:
        """
        Add a new memory to the stream.

        Args:
            content: Natural language description of the memory
            memory_type: Type of memory (observation, reflection, action, plan)
            importance: Pre-computed importance score, or None to auto-score
            embedding: Pre-computed embedding, or None to auto-generate

        Returns:
            The created MemoryObject
        """
        # Auto-score importance if not provided
        if importance is None:
            importance = self._llm_client.score_importance(content)

        # Auto-generate embedding if not provided
        if embedding is None:
            embedding = self._llm_client.generate_embedding(content)

        memory: MemoryObject = {
            "id": str(uuid.uuid4()),
            "content": content,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "importance": importance,
            "memory_type": memory_type,
            "embedding": embedding,
        }

        self.memories.append(memory)

        # Prune oldest memories if over limit
        if len(self.memories) > self.max_memories:
            self.memories = self.memories[-self.max_memories:]

        return memory

    def add_memories_batch(
        self,
        contents: list[str],
        memory_type: str = "observation",
        importances: list[float] | None = None,
    ) -> list[MemoryObject]:
        """
        Add multiple memories efficiently with batch embedding.

        Args:
            contents: List of memory descriptions
            memory_type: Type for all memories
            importances: Optional pre-computed importance scores

        Returns:
            List of created MemoryObjects
        """
        if not contents:
            return []

        # Batch generate embeddings
        embeddings = self._llm_client.generate_embeddings_batch(contents)

        # Score importance if not provided
        if importances is None:
            importances = [
                self._llm_client.score_importance(c) for c in contents
            ]

        now = datetime.now(timezone.utc).isoformat()
        memories = []

        for i, content in enumerate(contents):
            memory: MemoryObject = {
                "id": str(uuid.uuid4()),
                "content": content,
                "timestamp": now,
                "importance": importances[i],
                "memory_type": memory_type,
                "embedding": embeddings[i] if i < len(embeddings) else None,
            }
            memories.append(memory)
            self.memories.append(memory)

        # Prune if over limit
        if len(self.memories) > self.max_memories:
            self.memories = self.memories[-self.max_memories:]

        return memories

    def retrieve(
        self,
        query: str,
        k: int = 10,
        query_embedding: list[float] | None = None,
    ) -> list[MemoryObject]:
        """
        Retrieve the k most relevant memories for a query.

        Combines recency, importance, and semantic relevance scoring.

        Reference: Framework Section 2.1.1 (Retrieval Function)

        Args:
            query: Current context/observation to match against
            k: Number of memories to retrieve
            query_embedding: Optional pre-computed query embedding

        Returns:
            List of k most relevant MemoryObjects, sorted by score
        """
        if not self.memories:
            return []

        # Generate query embedding if not provided
        if query_embedding is None:
            query_embedding = self._llm_client.generate_embedding(query)

        now = datetime.now(timezone.utc)
        scored_memories: list[tuple[float, MemoryObject]] = []

        for memory in self.memories:
            # Calculate recency score (exponential decay)
            recency = self._calculate_recency(memory["timestamp"], now)

            # Normalize importance to 0-1 range
            importance = memory["importance"] / 10.0

            # Calculate relevance via cosine similarity
            relevance = self._calculate_relevance(
                query_embedding,
                memory["embedding"]
            )

            # Weighted combination
            score = (
                self.recency_weight * recency +
                self.importance_weight * importance +
                self.relevance_weight * relevance
            )

            scored_memories.append((score, memory))

        # Sort by score descending and return top k
        scored_memories.sort(key=lambda x: x[0], reverse=True)
        return [memory for _, memory in scored_memories[:k]]

    def _calculate_recency(
        self,
        timestamp_str: str,
        now: datetime,
    ) -> float:
        """
        Calculate recency score with exponential decay.

        Score = DECAY_RATE ^ hours_since_memory

        Args:
            timestamp_str: ISO timestamp of the memory
            now: Current datetime

        Returns:
            Recency score (0-1, higher = more recent)
        """
        try:
            memory_time = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
            hours_elapsed = (now - memory_time).total_seconds() / 3600
            return math.pow(DECAY_RATE, hours_elapsed)
        except (ValueError, TypeError):
            return 0.5  # Default for invalid timestamps

    def _calculate_relevance(
        self,
        query_embedding: list[float],
        memory_embedding: list[float] | None,
    ) -> float:
        """
        Calculate semantic relevance via cosine similarity.

        Args:
            query_embedding: Embedding of current query
            memory_embedding: Embedding of the memory

        Returns:
            Cosine similarity (0-1, higher = more similar)
        """
        if memory_embedding is None or not query_embedding:
            return 0.0

        query_vec = np.array(query_embedding)
        memory_vec = np.array(memory_embedding)

        # Cosine similarity
        dot_product = np.dot(query_vec, memory_vec)
        query_norm = np.linalg.norm(query_vec)
        memory_norm = np.linalg.norm(memory_vec)

        if query_norm == 0 or memory_norm == 0:
            return 0.0

        similarity = dot_product / (query_norm * memory_norm)

        # Normalize from [-1, 1] to [0, 1]
        return (similarity + 1) / 2

    def get_recent_memories(self, n: int = 10) -> list[MemoryObject]:
        """Get the n most recent memories."""
        return self.memories[-n:] if self.memories else []

    def get_important_memories(self, n: int = 10) -> list[MemoryObject]:
        """Get the n most important memories."""
        if not self.memories:
            return []
        sorted_memories = sorted(
            self.memories,
            key=lambda m: m["importance"],
            reverse=True
        )
        return sorted_memories[:n]

    def get_reflections(self) -> list[MemoryObject]:
        """Get all reflection-type memories."""
        return [m for m in self.memories if m["memory_type"] == "reflection"]

    def get_total_importance(self, since_timestamp: str | None = None) -> float:
        """
        Get sum of importance scores for recent memories.

        Used to trigger reflection when accumulator exceeds threshold.

        Args:
            since_timestamp: Only count memories after this timestamp

        Returns:
            Sum of importance scores
        """
        if since_timestamp is None:
            # Sum all memories
            return sum(m["importance"] for m in self.memories)

        # Sum memories after timestamp
        total = 0.0
        for memory in self.memories:
            if memory["timestamp"] > since_timestamp:
                total += memory["importance"]
        return total

    def clear(self) -> None:
        """Clear all memories from the stream."""
        self.memories = []

    def to_list(self) -> list[MemoryObject]:
        """Export all memories as a list."""
        return list(self.memories)

    def from_list(self, memories: list[MemoryObject]) -> None:
        """Load memories from a list."""
        self.memories = memories[:self.max_memories]

    def __len__(self) -> int:
        return len(self.memories)

    # ==========================================================================
    # Persistent Storage Methods
    # ==========================================================================

    def _init_persistent_store(self) -> None:
        """Initialize the persistent memory store."""
        from .persistent_memory import get_persistent_memory_store
        self._persistent_store = get_persistent_memory_store(self.agent_id)

    def load_from_persistent(self, limit: int = 100) -> int:
        """
        Load memories from persistent storage (Qdrant).

        Call this at session start to restore long-term memories.

        Args:
            limit: Maximum memories to load

        Returns:
            Number of memories loaded
        """
        if not self.persistent or self._persistent_store is None:
            self._init_persistent_store()

        if self._persistent_store is None:
            return 0

        loaded_memories = self._persistent_store.load_memories(limit=limit)

        # Merge with existing memories (avoid duplicates by ID)
        existing_ids = {m["id"] for m in self.memories}
        for memory in loaded_memories:
            if memory["id"] not in existing_ids:
                self.memories.append(memory)
                existing_ids.add(memory["id"])

        # Sort by timestamp
        self.memories.sort(key=lambda m: m.get("timestamp", ""))

        # Prune if over limit
        if len(self.memories) > self.max_memories:
            self.memories = self.memories[-self.max_memories:]

        return len(loaded_memories)

    def save_to_persistent(self) -> int:
        """
        Save all new memories from this session to persistent storage.

        Call this at session end or periodically during long conversations.

        Returns:
            Number of memories saved
        """
        if not self._new_memories:
            return 0

        if not self.persistent:
            self._init_persistent_store()

        if self._persistent_store is None:
            return 0

        # Save memories with session tracking
        for memory in self._new_memories:
            memory["session_id"] = self.session_id

            # Check if this is a reflection with source tracking
            source_ids = self._reflection_sources.get(memory["id"])

            self._persistent_store.save_memory(
                memory,
                source_memory_ids=source_ids,
            )

        saved_count = len(self._new_memories)
        self._new_memories = []  # Clear after saving
        self._reflection_sources = {}

        return saved_count

    def add_memory_persistent(
        self,
        content: str,
        memory_type: str = "observation",
        importance: float | None = None,
        embedding: list[float] | None = None,
        source_memory_ids: list[str] | None = None,
    ) -> MemoryObject:
        """
        Add a memory and immediately persist it to storage.

        Args:
            content: Natural language description of the memory
            memory_type: Type of memory (observation, reflection, action, plan)
            importance: Pre-computed importance score, or None to auto-score
            embedding: Pre-computed embedding, or None to auto-generate
            source_memory_ids: For reflections, IDs of memories it's derived from

        Returns:
            The created MemoryObject
        """
        # Create memory using standard method
        memory = self.add_memory(content, memory_type, importance, embedding)

        # Track for persistence
        self._new_memories.append(memory)

        # Track reflection sources
        if source_memory_ids and memory_type == "reflection":
            self._reflection_sources[memory["id"]] = source_memory_ids

        # Immediately persist if enabled
        if self.persistent and self._persistent_store:
            self._persistent_store.save_memory(memory, source_memory_ids)
            self._new_memories.remove(memory)  # Already saved
            if memory["id"] in self._reflection_sources:
                del self._reflection_sources[memory["id"]]

        return memory

    def add_reflection_with_sources(
        self,
        content: str,
        source_memory_ids: list[str],
        importance: float | None = None,
    ) -> MemoryObject:
        """
        Add a reflection memory with tracked source relationships.

        This creates DERIVED_FROM relationships in Memgraph when persisted.

        Args:
            content: The reflection insight content
            source_memory_ids: IDs of memories this reflection is derived from
            importance: Optional importance score (default 8.0 for reflections)

        Returns:
            The created reflection MemoryObject
        """
        return self.add_memory_persistent(
            content=content,
            memory_type="reflection",
            importance=importance or 8.0,
            source_memory_ids=source_memory_ids,
        )

    def get_new_memories(self) -> list[MemoryObject]:
        """Get memories created in this session that haven't been persisted yet."""
        return list(self._new_memories)

    def get_memory_stats(self) -> dict:
        """Get statistics about the memory stream."""
        stats = {
            "total_memories": len(self.memories),
            "new_memories": len(self._new_memories),
            "session_id": self.session_id,
            "persistent": self.persistent,
            "by_type": {},
        }

        for memory in self.memories:
            mtype = memory.get("memory_type", "unknown")
            stats["by_type"][mtype] = stats["by_type"].get(mtype, 0) + 1

        return stats

    def search_persistent(
        self,
        query: str,
        limit: int = 10,
        memory_types: list[str] | None = None,
    ) -> list[MemoryObject]:
        """
        Search memories using persistent storage's semantic search.

        This uses Qdrant's vector similarity directly, which may be faster
        for large memory stores.

        Args:
            query: Search query text
            limit: Maximum results
            memory_types: Optional filter by type

        Returns:
            List of matching MemoryObjects
        """
        if not self.persistent:
            self._init_persistent_store()

        if self._persistent_store is None:
            # Fall back to in-memory retrieve
            return self.retrieve(query, k=limit)

        return self._persistent_store.search_similar(
            query=query,
            limit=limit,
            memory_types=memory_types,
        )
