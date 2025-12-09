/**
 * Initialize Qdrant Collections
 *
 * Creates all required vector collections for the SyntheticCohorts framework.
 *
 * Usage:
 *   npm run db:init-qdrant
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import {
  initializeCollections,
  verifyConnection,
  getCollectionStats,
  COLLECTIONS,
} from '../../vector/qdrant-client';

async function main() {
  console.log('\n🔷 Qdrant Collection Initialization\n');
  console.log('='.repeat(50));

  // 1. Verify connection
  console.log('\n📡 Verifying Qdrant connection...\n');

  const connected = await verifyConnection();
  if (!connected) {
    console.error('❌ Cannot connect to Qdrant. Is Docker running?');
    console.error('   Run: docker-compose up -d qdrant');
    process.exit(1);
  }
  console.log('  ✓ Qdrant connection OK');

  // 2. Initialize collections
  console.log('\n📦 Creating collections...\n');
  await initializeCollections();

  // 3. Print collection stats
  console.log('\n📊 Collection Status:\n');
  for (const [key, name] of Object.entries(COLLECTIONS)) {
    try {
      const stats = await getCollectionStats(name);
      console.log(`  ${key}:`);
      console.log(`    - Name: ${name}`);
      console.log(`    - Status: ${stats.status}`);
      console.log(`    - Points: ${stats.pointsCount}`);
      console.log(`    - Vectors: ${stats.vectorsCount}`);
      console.log('');
    } catch (error) {
      console.log(`  ${key}: (not found or error)`);
    }
  }

  console.log('✅ Qdrant initialization complete!\n');
}

main().catch((error) => {
  console.error('\n❌ Initialization failed:', error);
  process.exit(1);
});
