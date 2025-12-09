/**
 * Seed Script: Sync Interviews to Knowledge Graph
 *
 * Fetches all interviews from Supabase and syncs them to:
 * - Memgraph (Agent, Trait, Memory nodes)
 * - Qdrant (embeddings for semantic search)
 *
 * Usage:
 *   npm run db:seed
 *   npm run db:seed -- --workspace-id=<uuid>
 *   npm run db:seed -- --limit=10
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { syncInterviewsBatch, Interview } from '../sync/interview-to-graph';
import { initializeCollections } from '../../vector/qdrant-client';
import { verifyConnection as verifyMemgraph, closeDriver } from '../client';
import { verifyConnection as verifyQdrant } from '../../vector/qdrant-client';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Fetch interviews from Supabase
 */
async function fetchInterviews(options: {
  workspaceId?: string;
  limit?: number;
}): Promise<Interview[]> {
  const { workspaceId, limit } = options;

  let query = supabase
    .from('interviews')
    .select('*')
    .not('reflection_memory', 'is', null);

  if (workspaceId) {
    query = query.eq('workspace_id', workspaceId);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch interviews: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    workspace_id: row.workspace_id,
    age: row.age,
    gender: row.gender,
    occupation: row.occupation,
    country: row.country,
    hometown: row.hometown,
    race: row.race,
    primary_app: row.primary_app,
    learning_language: row.learning_language,
    usage_frequency: row.usage_frequency,
    is_premium_user: row.is_premium_user,
    personality: row.personality,
    reflection_memory: row.reflection_memory,
    created_at: row.created_at,
  }));
}

/**
 * Parse command line arguments
 */
function parseArgs(): { workspaceId?: string; limit?: number } {
  const args: { workspaceId?: string; limit?: number } = {};

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--workspace-id=')) {
      args.workspaceId = arg.split('=')[1];
    } else if (arg.startsWith('--limit=')) {
      args.limit = parseInt(arg.split('=')[1], 10);
    }
  }

  return args;
}

/**
 * Main seed function
 */
async function main() {
  console.log('\n🌱 Interview to Knowledge Graph Seed Script\n');
  console.log('='.repeat(50));

  const args = parseArgs();

  // 1. Verify connections
  console.log('\n📡 Verifying database connections...\n');

  const memgraphOk = await verifyMemgraph();
  if (!memgraphOk) {
    console.error('❌ Cannot connect to Memgraph. Is Docker running?');
    console.error('   Run: docker-compose up -d memgraph');
    process.exit(1);
  }
  console.log('  ✓ Memgraph connection OK');

  const qdrantOk = await verifyQdrant();
  if (!qdrantOk) {
    console.error('❌ Cannot connect to Qdrant. Is Docker running?');
    console.error('   Run: docker-compose up -d qdrant');
    process.exit(1);
  }
  console.log('  ✓ Qdrant connection OK');

  // 2. Initialize Qdrant collections
  console.log('\n📦 Initializing Qdrant collections...\n');
  await initializeCollections();
  console.log('  ✓ Collections ready');

  // 3. Fetch interviews
  console.log('\n📥 Fetching interviews from Supabase...\n');
  const interviews = await fetchInterviews(args);

  if (interviews.length === 0) {
    console.log('  ⚠️ No interviews found with reflection_memory data');
    await closeDriver();
    process.exit(0);
  }

  console.log(`  Found ${interviews.length} interview(s)`);
  if (args.workspaceId) {
    console.log(`  Filtered by workspace: ${args.workspaceId}`);
  }
  if (args.limit) {
    console.log(`  Limited to: ${args.limit} interviews`);
  }

  // 4. Sync to graph
  console.log('\n' + '='.repeat(50));

  const result = await syncInterviewsBatch(interviews, {
    onProgress: (current, total, syncResult) => {
      const status = syncResult.success ? '✓' : '✗';
      const memoryInfo = syncResult.memoryCount > 0
        ? ` (${syncResult.memoryCount} memories, ${syncResult.embeddingCount} embeddings)`
        : '';
      console.log(`  ${status} [${current}/${total}] ${syncResult.agentId}${memoryInfo}`);
    },
  });

  // 5. Print summary
  console.log('='.repeat(50));
  console.log('\n📊 Sync Summary:\n');
  console.log(`   Total processed: ${result.total}`);
  console.log(`   Successful: ${result.successful}`);
  console.log(`   Failed: ${result.failed}`);
  console.log(`   Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);

  // Print memory/embedding totals
  const totalMemories = result.results.reduce((sum, r) => sum + r.memoryCount, 0);
  const totalEmbeddings = result.results.reduce((sum, r) => sum + r.embeddingCount, 0);
  console.log(`   Total memories created: ${totalMemories}`);
  console.log(`   Total embeddings created: ${totalEmbeddings}`);

  if (result.failed > 0) {
    console.log('\n⚠️ Failed syncs:');
    result.results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`   - ${r.agentId}: ${r.errors.join(', ')}`);
      });
  }

  console.log('');

  // Cleanup
  await closeDriver();
}

// Run
main().catch((error) => {
  console.error('\n❌ Seed script failed:', error);
  closeDriver().finally(() => process.exit(1));
});
