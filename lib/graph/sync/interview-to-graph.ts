/**
 * Interview to Graph Sync
 *
 * Syncs interview data from Supabase to the Knowledge Graph (Memgraph)
 * and Vector Store (Qdrant). Creates:
 * - Agent nodes from interview demographics
 * - Trait nodes from Big Five personality scores
 * - Memory nodes from reflection_memory (fine-grained extraction)
 * - Vector embeddings for semantic retrieval
 */

import OpenAI from 'openai';
import { runQuery, runQuerySingle } from '../client';
import {
  upsertPoints,
  COLLECTIONS,
  EMBEDDING_DIMENSIONS,
} from '../../vector/qdrant-client';
import {
  extractMemoriesFromReflection,
  getMemoryStats,
  type ReflectionMemory,
  type ExtractedMemory,
} from '../extractors/memory-extractor';

// OpenAI client for embeddings (lazy-loaded to allow env vars to be set first)
let openai: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openai) {
    openai = new OpenAI();
  }
  return openai;
}

// Batch size for embedding requests
const EMBEDDING_BATCH_SIZE = 20;

/**
 * Interview data structure (from Supabase)
 */
export interface Interview {
  id: string;
  name: string;
  workspace_id?: string;

  // Demographics
  age?: number;
  gender?: string;
  occupation?: string;
  country?: string;
  hometown?: string;
  race?: string;

  // Domain-specific (Duolingo)
  primary_app?: string;
  learning_language?: string;
  usage_frequency?: string;
  is_premium_user?: boolean;

  // Personality (Big Five)
  personality?: {
    scores?: {
      openness?: number;
      conscientiousness?: number;
      extraversion?: number;
      agreeableness?: number;
      neuroticism?: number;
    };
  };

  // Reflection memory
  reflection_memory?: ReflectionMemory;

  // Metadata
  created_at?: string;
}

/**
 * Sync result with statistics
 */
export interface SyncResult {
  success: boolean;
  agentId: string;
  traitCount: number;
  memoryCount: number;
  embeddingCount: number;
  errors: string[];
  durationMs: number;
}

/**
 * Generate embedding for text using OpenAI
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAIClient().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batches
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const client = getOpenAIClient();
  const embeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const response = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      dimensions: EMBEDDING_DIMENSIONS,
    });
    embeddings.push(...response.data.map((d) => d.embedding));
  }

  return embeddings;
}

/**
 * Create Agent node in Memgraph
 */
async function createAgentNode(interview: Interview): Promise<void> {
  await runQuery(
    `
    MERGE (a:Agent {id: $id})
    SET a.name = $name,
        a.workspace_id = $workspace_id,
        a.age = $age,
        a.gender = $gender,
        a.occupation = $occupation,
        a.country = $country,
        a.hometown = $hometown,
        a.race = $race,
        a.primary_app = $primary_app,
        a.learning_language = $learning_language,
        a.usage_frequency = $usage_frequency,
        a.is_premium_user = $is_premium_user,
        a.created_at = datetime($created_at),
        a.synced_at = datetime()
    `,
    {
      id: interview.id,
      name: interview.name,
      workspace_id: interview.workspace_id || null,
      age: interview.age || null,
      gender: interview.gender || null,
      occupation: interview.occupation || null,
      country: interview.country || null,
      hometown: interview.hometown || null,
      race: interview.race || null,
      primary_app: interview.primary_app || null,
      learning_language: interview.learning_language || null,
      usage_frequency: interview.usage_frequency || null,
      is_premium_user: interview.is_premium_user || null,
      created_at: interview.created_at || new Date().toISOString(),
    }
  );
}

/**
 * Create Trait nodes from personality scores
 */
async function createTraitNodes(
  agentId: string,
  personality: Interview['personality']
): Promise<number> {
  if (!personality?.scores) {
    return 0;
  }

  const traits = Object.entries(personality.scores).filter(
    ([, value]) => value !== undefined && value !== null
  );

  for (const [type, value] of traits) {
    const level =
      value < 2 ? 'low' : value > 3.5 ? 'high' : 'medium';

    await runQuery(
      `
      MATCH (a:Agent {id: $agent_id})
      MERGE (t:Trait {id: $trait_id})
      SET t.type = $type,
          t.value = $value,
          t.level = $level
      MERGE (a)-[r:HAS_TRAIT]->(t)
      SET r.score = $value
      `,
      {
        agent_id: agentId,
        trait_id: `${agentId}_trait_${type}`,
        type,
        value,
        level,
      }
    );
  }

  return traits.length;
}

/**
 * Create Memory nodes and link to Agent
 */
async function createMemoryNodes(
  agentId: string,
  memories: ExtractedMemory[]
): Promise<string[]> {
  const memoryIds: string[] = [];

  for (let i = 0; i < memories.length; i++) {
    const memory = memories[i];
    const memoryId = `${agentId}_memory_${i}`;

    // Note: Memory is a reserved keyword in Memgraph, escape with backticks
    await runQuery(
      `
      MATCH (a:Agent {id: $agent_id})
      MERGE (m:\`Memory\` {id: $memory_id})
      SET m.type = $type,
          m.content = $content,
          m.importance = $importance,
          m.source_type = 'interview',
          m.source_id = $agent_id,
          m.category = $category,
          m.created_at = datetime()
      MERGE (a)-[r:REMEMBERS]->(m)
      SET r.importance = $importance
      `,
      {
        agent_id: agentId,
        memory_id: memoryId,
        type: memory.type,
        content: memory.content,
        importance: memory.importance,
        category: memory.category,
      }
    );

    memoryIds.push(memoryId);
  }

  return memoryIds;
}

/**
 * Sync interview to both Memgraph and Qdrant
 */
export async function syncInterviewToGraph(
  interview: Interview
): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: string[] = [];

  let traitCount = 0;
  let memoryCount = 0;
  let embeddingCount = 0;

  try {
    // 1. Create Agent node in Memgraph
    await createAgentNode(interview);
    console.log(`  Created Agent: ${interview.name} (${interview.id})`);

    // 2. Create Trait nodes from personality
    traitCount = await createTraitNodes(interview.id, interview.personality);
    if (traitCount > 0) {
      console.log(`  Created ${traitCount} Trait nodes`);
    }

    // 3. Extract and create Memory nodes
    const memories = extractMemoriesFromReflection(interview.reflection_memory);
    const stats = getMemoryStats(memories);
    console.log(`  Extracted ${stats.total} memories (avg importance: ${stats.avgImportance.toFixed(1)})`);

    if (memories.length > 0) {
      const memoryIds = await createMemoryNodes(interview.id, memories);
      memoryCount = memoryIds.length;

      // 4. Generate embeddings for memories
      console.log(`  Generating embeddings for ${memories.length} memories...`);
      const memoryTexts = memories.map((m) => m.content);
      const memoryEmbeddings = await generateEmbeddings(memoryTexts);

      // 5. Upsert to Qdrant
      const vectorPoints = memories.map((memory, index) => ({
        id: memoryIds[index],
        vector: memoryEmbeddings[index],
        payload: {
          content: memory.content,
          type: memory.type,
          importance: memory.importance,
          agent_id: interview.id,
          agent_name: interview.name,
          memgraph_id: memoryIds[index],
          category: memory.category,
        },
      }));

      await upsertPoints(COLLECTIONS.MEMORY_EMBEDDINGS, vectorPoints);
      embeddingCount = vectorPoints.length;
      console.log(`  Upserted ${embeddingCount} vectors to Qdrant`);
    }

    // 6. Create agent profile embedding
    const profileText = buildAgentProfileText(interview);
    const profileEmbedding = await generateEmbedding(profileText);

    await upsertPoints(COLLECTIONS.AGENT_EMBEDDINGS, [
      {
        id: interview.id,
        vector: profileEmbedding,
        payload: {
          name: interview.name,
          workspace_id: interview.workspace_id || '',
          age: interview.age || null,
          occupation: interview.occupation || null,
          country: interview.country || null,
          memgraph_id: interview.id,
        },
      },
    ]);
    embeddingCount++;
    console.log(`  Created agent profile embedding`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(message);
    console.error(`  Error syncing interview: ${message}`);
  }

  const durationMs = Date.now() - startTime;

  return {
    success: errors.length === 0,
    agentId: interview.id,
    traitCount,
    memoryCount,
    embeddingCount,
    errors,
    durationMs,
  };
}

/**
 * Build a text representation of agent profile for embedding
 */
function buildAgentProfileText(interview: Interview): string {
  const parts: string[] = [];

  parts.push(`Name: ${interview.name}`);

  if (interview.age) parts.push(`Age: ${interview.age}`);
  if (interview.gender) parts.push(`Gender: ${interview.gender}`);
  if (interview.occupation) parts.push(`Occupation: ${interview.occupation}`);
  if (interview.country) parts.push(`Country: ${interview.country}`);
  if (interview.hometown) parts.push(`Hometown: ${interview.hometown}`);

  if (interview.personality?.scores) {
    const scores = interview.personality.scores;
    const traitDescriptions: string[] = [];

    if (scores.openness !== undefined) {
      traitDescriptions.push(
        scores.openness > 3.5 ? 'highly open to new experiences' :
        scores.openness < 2 ? 'prefers routine and familiarity' : 'moderately open'
      );
    }
    if (scores.conscientiousness !== undefined) {
      traitDescriptions.push(
        scores.conscientiousness > 3.5 ? 'very organized and disciplined' :
        scores.conscientiousness < 2 ? 'flexible and spontaneous' : 'balanced conscientiousness'
      );
    }
    if (scores.extraversion !== undefined) {
      traitDescriptions.push(
        scores.extraversion > 3.5 ? 'outgoing and sociable' :
        scores.extraversion < 2 ? 'reserved and introspective' : 'ambivert'
      );
    }
    if (scores.agreeableness !== undefined) {
      traitDescriptions.push(
        scores.agreeableness > 3.5 ? 'cooperative and empathetic' :
        scores.agreeableness < 2 ? 'competitive and skeptical' : 'moderately agreeable'
      );
    }
    if (scores.neuroticism !== undefined) {
      traitDescriptions.push(
        scores.neuroticism > 3.5 ? 'emotionally sensitive' :
        scores.neuroticism < 2 ? 'emotionally stable and calm' : 'moderate emotional reactivity'
      );
    }

    if (traitDescriptions.length > 0) {
      parts.push(`Personality: ${traitDescriptions.join(', ')}`);
    }
  }

  // Add key memories to profile
  const memories = extractMemoriesFromReflection(interview.reflection_memory);
  const topMemories = memories
    .filter((m) => m.importance >= 7)
    .slice(0, 5)
    .map((m) => m.content);

  if (topMemories.length > 0) {
    parts.push(`Key insights: ${topMemories.join('; ')}`);
  }

  return parts.join('. ');
}

/**
 * Sync multiple interviews in batch
 */
export async function syncInterviewsBatch(
  interviews: Interview[],
  options: {
    onProgress?: (current: number, total: number, result: SyncResult) => void;
    concurrency?: number;
  } = {}
): Promise<{
  total: number;
  successful: number;
  failed: number;
  results: SyncResult[];
  totalDurationMs: number;
}> {
  const { onProgress, concurrency = 1 } = options;
  const startTime = Date.now();
  const results: SyncResult[] = [];

  console.log(`\n🔄 Syncing ${interviews.length} interviews to Knowledge Graph...\n`);

  // Process sequentially for now (can be parallelized with concurrency > 1)
  for (let i = 0; i < interviews.length; i++) {
    const interview = interviews[i];
    console.log(`[${i + 1}/${interviews.length}] Processing: ${interview.name}`);

    const result = await syncInterviewToGraph(interview);
    results.push(result);

    if (onProgress) {
      onProgress(i + 1, interviews.length, result);
    }

    // Small delay to avoid rate limiting
    if (i < interviews.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalDurationMs = Date.now() - startTime;

  console.log(`\n✅ Sync complete!`);
  console.log(`   Total: ${interviews.length}`);
  console.log(`   Successful: ${successful}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Duration: ${(totalDurationMs / 1000).toFixed(1)}s\n`);

  return {
    total: interviews.length,
    successful,
    failed,
    results,
    totalDurationMs,
  };
}

/**
 * Check if an interview has already been synced
 */
export async function isInterviewSynced(interviewId: string): Promise<boolean> {
  const result = await runQuerySingle<{ count: number }>(
    `MATCH (a:Agent {id: $id}) RETURN count(a) AS count`,
    { id: interviewId }
  );
  return (result?.count || 0) > 0;
}

/**
 * Delete an agent and all related nodes from the graph
 */
export async function deleteAgentFromGraph(agentId: string): Promise<void> {
  // Delete all relationships and connected nodes
  // Note: Memory is a reserved keyword in Memgraph, escape with backticks
  await runQuery(
    `
    MATCH (a:Agent {id: $id})
    OPTIONAL MATCH (a)-[r1:HAS_TRAIT]->(t:Trait)
    OPTIONAL MATCH (a)-[r2:REMEMBERS]->(m:\`Memory\`)
    DETACH DELETE a, t, m
    `,
    { id: agentId }
  );
}
