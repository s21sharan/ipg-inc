/**
 * Qdrant Vector Database Client
 *
 * Provides vector storage and semantic search capabilities for the SyntheticCohorts framework.
 * Used alongside Memgraph for hybrid retrieval (graph + vector similarity).
 */

import { QdrantClient } from '@qdrant/js-client-rest';

// Collection names
export const COLLECTIONS = {
  AGENT_EMBEDDINGS: 'agent_embeddings',
  MEMORY_EMBEDDINGS: 'memory_embeddings',
  TOPIC_EMBEDDINGS: 'topic_embeddings',
  PRODUCT_EMBEDDINGS: 'product_embeddings',
} as const;

// Embedding dimensions for text-embedding-3-small
export const EMBEDDING_DIMENSIONS = 1536;

// Singleton client instance
let client: QdrantClient | null = null;

/**
 * Get or create the Qdrant client instance
 */
export function getQdrantClient(): QdrantClient {
  if (!client) {
    const url = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
    const apiKey = process.env.QDRANT_API_KEY;

    client = new QdrantClient({
      url,
      apiKey: apiKey || undefined,
    });
  }
  return client;
}

// ============================================================================
// Collection Management
// ============================================================================

/**
 * Create all required collections with proper configuration
 */
export async function initializeCollections(): Promise<void> {
  const qdrant = getQdrantClient();

  // Get existing collections
  const existingCollections = await qdrant.getCollections();
  const existingNames = existingCollections.collections.map((c) => c.name);

  // Create each collection if it doesn't exist
  for (const collectionName of Object.values(COLLECTIONS)) {
    if (!existingNames.includes(collectionName)) {
      await qdrant.createCollection(collectionName, {
        vectors: {
          size: EMBEDDING_DIMENSIONS,
          distance: 'Cosine',
        },
        // Optimize for filtering
        optimizers_config: {
          indexing_threshold: 20000,
        },
      });
      console.log(`Created collection: ${collectionName}`);
    }
  }
}

/**
 * Delete a collection (use with caution)
 */
export async function deleteCollection(collectionName: string): Promise<void> {
  const qdrant = getQdrantClient();
  await qdrant.deleteCollection(collectionName);
}

// ============================================================================
// Point Operations
// ============================================================================

export interface VectorPoint {
  id: string | number;  // Qdrant accepts UUID strings or unsigned integers
  vector: number[];
  payload: Record<string, unknown>;
}

/**
 * Upsert points to a collection
 */
export async function upsertPoints(
  collectionName: string,
  points: VectorPoint[]
): Promise<void> {
  const qdrant = getQdrantClient();
  await qdrant.upsert(collectionName, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: p.payload,
    })),
  });
}

/**
 * Delete points by IDs
 */
export async function deletePoints(
  collectionName: string,
  ids: (string | number)[]
): Promise<void> {
  const qdrant = getQdrantClient();
  await qdrant.delete(collectionName, {
    wait: true,
    points: ids,
  });
}

/**
 * Get points by IDs
 */
export async function getPoints(
  collectionName: string,
  ids: (string | number)[]
): Promise<VectorPoint[]> {
  const qdrant = getQdrantClient();
  const result = await qdrant.retrieve(collectionName, {
    ids,
    with_payload: true,
    with_vector: true,
  });

  return result.map((p) => ({
    id: p.id as string | number,
    vector: p.vector as number[],
    payload: p.payload as Record<string, unknown>,
  }));
}

// ============================================================================
// Search Operations
// ============================================================================

export interface SearchResult {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

export interface SearchFilter {
  must?: Array<{ key: string; match: { value: string | number | boolean } }>;
  must_not?: Array<{ key: string; match: { value: string | number | boolean } }>;
  should?: Array<{ key: string; match: { value: string | number | boolean } }>;
}

/**
 * Search for similar vectors with optional filtering
 */
export async function searchVectors(
  collectionName: string,
  queryVector: number[],
  options: {
    limit?: number;
    filter?: SearchFilter;
    scoreThreshold?: number;
  } = {}
): Promise<SearchResult[]> {
  const qdrant = getQdrantClient();
  const { limit = 10, filter, scoreThreshold } = options;

  const result = await qdrant.query(collectionName, {
    query: queryVector,
    limit,
    filter: filter as never, // Type workaround for filter structure
    with_payload: true,
    score_threshold: scoreThreshold,
  });

  return result.points.map((p) => ({
    id: p.id as string,
    score: p.score,
    payload: p.payload as Record<string, unknown>,
  }));
}

// ============================================================================
// Specialized Search Functions
// ============================================================================

/**
 * Search memories for a specific agent
 */
export async function searchAgentMemories(
  queryVector: number[],
  agentId: string,
  options: {
    limit?: number;
    memoryTypes?: string[];
    minImportance?: number;
  } = {}
): Promise<SearchResult[]> {
  const { limit = 10, memoryTypes, minImportance } = options;

  const filter: SearchFilter = {
    must: [{ key: 'agent_id', match: { value: agentId } }],
  };

  // Add memory type filter if specified
  if (memoryTypes && memoryTypes.length > 0) {
    filter.should = memoryTypes.map((type) => ({
      key: 'type',
      match: { value: type },
    }));
  }

  // Note: Range filters would need to be added via Qdrant's range filter syntax
  // For now, we filter importance post-search if needed

  let results = await searchVectors(COLLECTIONS.MEMORY_EMBEDDINGS, queryVector, {
    limit: limit * 2, // Fetch more to account for post-filtering
    filter,
  });

  // Post-filter by importance if specified
  if (minImportance !== undefined) {
    results = results.filter(
      (r) => (r.payload.importance as number) >= minImportance
    );
  }

  return results.slice(0, limit);
}

/**
 * Search for similar topics
 */
export async function searchSimilarTopics(
  queryVector: number[],
  options: {
    limit?: number;
    topicTypes?: string[];
    campaignId?: string;
  } = {}
): Promise<SearchResult[]> {
  const { limit = 10, topicTypes, campaignId } = options;

  const filter: SearchFilter = { must: [] };

  if (campaignId) {
    filter.must!.push({ key: 'source_campaign_id', match: { value: campaignId } });
  }

  if (topicTypes && topicTypes.length > 0) {
    filter.should = topicTypes.map((type) => ({
      key: 'type',
      match: { value: type },
    }));
  }

  return searchVectors(COLLECTIONS.TOPIC_EMBEDDINGS, queryVector, {
    limit,
    filter: filter.must!.length > 0 || filter.should ? filter : undefined,
  });
}

/**
 * Find similar agents based on their profile embedding
 */
export async function searchSimilarAgents(
  queryVector: number[],
  options: {
    limit?: number;
    workspaceId?: string;
    excludeAgentId?: string;
  } = {}
): Promise<SearchResult[]> {
  const { limit = 10, workspaceId, excludeAgentId } = options;

  const filter: SearchFilter = {};

  if (workspaceId) {
    filter.must = [{ key: 'workspace_id', match: { value: workspaceId } }];
  }

  if (excludeAgentId) {
    filter.must_not = [{ key: 'id', match: { value: excludeAgentId } }];
  }

  return searchVectors(COLLECTIONS.AGENT_EMBEDDINGS, queryVector, {
    limit,
    filter: (filter.must || filter.must_not) ? filter : undefined,
  });
}

// ============================================================================
// Health Check
// ============================================================================

/**
 * Verify Qdrant connection is healthy
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    const qdrant = getQdrantClient();
    await qdrant.getCollections();
    return true;
  } catch (error) {
    console.error('Qdrant connection failed:', error);
    return false;
  }
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(
  collectionName: string
): Promise<{
  vectorsCount: number;
  indexedVectorsCount: number;
  pointsCount: number;
  status: string;
}> {
  const qdrant = getQdrantClient();
  const info = await qdrant.getCollection(collectionName);

  return {
    vectorsCount: info.vectors_count || 0,
    indexedVectorsCount: info.indexed_vectors_count || 0,
    pointsCount: info.points_count || 0,
    status: info.status,
  };
}
