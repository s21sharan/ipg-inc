/**
 * Cleanup Script: Remove All Agents from Knowledge Graph
 *
 * Deletes all Agent nodes and their related data (Traits, Memories)
 * from both Memgraph and Qdrant.
 *
 * Usage:
 *   npm run db:cleanup
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runQuery, verifyConnection, getDatabaseStats, closeDriver } from '../client';
import {
  getQdrantClient,
  COLLECTIONS,
  verifyConnection as verifyQdrant,
} from '../../vector/qdrant-client';

async function main() {
  console.log('\n🧹 Knowledge Graph Cleanup Script\n');
  console.log('='.repeat(50));

  // 1. Verify connections
  console.log('\n📡 Verifying database connections...\n');

  const memgraphOk = await verifyConnection();
  if (!memgraphOk) {
    console.error('❌ Cannot connect to Memgraph');
    process.exit(1);
  }
  console.log('  ✓ Memgraph connection OK');

  const qdrantOk = await verifyQdrant();
  if (!qdrantOk) {
    console.error('❌ Cannot connect to Qdrant');
    process.exit(1);
  }
  console.log('  ✓ Qdrant connection OK');

  // 2. Get current stats
  console.log('\n📊 Current Database Stats:\n');
  const statsBefore = await getDatabaseStats();
  console.log(`  Nodes: ${statsBefore.nodeCount}`);
  console.log(`  Relationships: ${statsBefore.relationshipCount}`);
  console.log(`  Labels: ${statsBefore.nodeLabels.join(', ') || '(none)'}`);

  // 3. Delete all Agent-related data from Memgraph
  console.log('\n🗑️  Cleaning up Memgraph...\n');

  // Delete Memory nodes and relationships
  try {
    const memoryResult = await runQuery<{ count: number }>(
      'MATCH (m:`Memory`) DETACH DELETE m RETURN count(*) AS count'
    );
    console.log(`  ✓ Deleted Memory nodes`);
  } catch (error) {
    console.log('  - No Memory nodes to delete');
  }

  // Delete Trait nodes and relationships
  try {
    await runQuery('MATCH (t:Trait) DETACH DELETE t');
    console.log('  ✓ Deleted Trait nodes');
  } catch (error) {
    console.log('  - No Trait nodes to delete');
  }

  // Delete Agent nodes
  try {
    await runQuery('MATCH (a:Agent) DETACH DELETE a');
    console.log('  ✓ Deleted Agent nodes');
  } catch (error) {
    console.log('  - No Agent nodes to delete');
  }

  // 4. Clear Qdrant collections
  console.log('\n🗑️  Cleaning up Qdrant...\n');

  const qdrant = getQdrantClient();

  for (const [key, collectionName] of Object.entries(COLLECTIONS)) {
    try {
      // Delete all points in collection
      const collectionInfo = await qdrant.getCollection(collectionName);
      if (collectionInfo.points_count && collectionInfo.points_count > 0) {
        // Scroll and delete all points
        let hasMore = true;
        let offset: string | number | undefined = undefined;
        let totalDeleted = 0;

        while (hasMore) {
          const scrollResult = await qdrant.scroll(collectionName, {
            limit: 100,
            offset,
            with_payload: false,
            with_vector: false,
          });

          if (scrollResult.points.length > 0) {
            const ids = scrollResult.points.map((p) => p.id as string);
            await qdrant.delete(collectionName, {
              wait: true,
              points: ids,
            });
            totalDeleted += ids.length;
          }

          offset = scrollResult.next_page_offset ?? undefined;
          hasMore = !!offset;
        }

        console.log(`  ✓ Deleted ${totalDeleted} points from ${collectionName}`);
      } else {
        console.log(`  - ${collectionName} is empty`);
      }
    } catch (error) {
      console.log(`  - ${collectionName} not found or error`);
    }
  }

  // 5. Final stats
  console.log('\n📊 Final Database Stats:\n');
  const statsAfter = await getDatabaseStats();
  console.log(`  Nodes: ${statsAfter.nodeCount}`);
  console.log(`  Relationships: ${statsAfter.relationshipCount}`);
  console.log(`  Labels: ${statsAfter.nodeLabels.join(', ') || '(none)'}`);

  console.log('\n✅ Cleanup complete!\n');

  await closeDriver();
}

main().catch((error) => {
  console.error('\n❌ Cleanup failed:', error);
  closeDriver().finally(() => process.exit(1));
});
