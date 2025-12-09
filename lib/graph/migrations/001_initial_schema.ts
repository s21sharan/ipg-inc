/**
 * Migration: 001_initial_schema
 *
 * Creates the initial Knowledge Graph schema for SyntheticCohorts.
 * Includes constraints, indexes, and node labels for:
 * - Agent, Trait, Topic, Product, Event, Sentiment, Memory, Cluster
 */

// Load environment variables from .env.local
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runQuery, verifyConnection, getDatabaseStats, closeDriver } from '../client';

// Schema version for tracking
export const MIGRATION_VERSION = '001';
export const MIGRATION_NAME = 'initial_schema';

/**
 * Constraint definitions for unique node IDs
 * Note: Memory is a reserved keyword in Memgraph, so we use backticks
 */
const CONSTRAINTS = [
  { label: 'Agent', property: 'id' },
  { label: 'Trait', property: 'id' },
  { label: 'Topic', property: 'id' },
  { label: 'Product', property: 'id' },
  { label: 'Event', property: 'id' },
  { label: 'Sentiment', property: 'id' },
  { label: '`Memory`', property: 'id' },  // Memory is reserved keyword
  { label: 'Cluster', property: 'id' },
];

/**
 * Index definitions for frequent queries
 */
const INDEXES = [
  // Agent indexes
  { label: 'Agent', property: 'workspace_id' },
  { label: 'Agent', property: 'name' },
  { label: 'Agent', property: 'created_at' },

  // Trait indexes
  { label: 'Trait', property: 'type' },
  { label: 'Trait', property: 'level' },

  // Topic indexes
  { label: 'Topic', property: 'name' },
  { label: 'Topic', property: 'type' },
  { label: 'Topic', property: 'source_campaign_id' },

  // Product indexes
  { label: 'Product', property: 'name' },
  { label: 'Product', property: 'category' },

  // Event indexes
  { label: 'Event', property: 'conversation_id' },
  { label: 'Event', property: 'type' },
  { label: 'Event', property: 'timestamp' },
  { label: 'Event', property: 'importance_score' },

  // Sentiment indexes
  { label: 'Sentiment', property: 'type' },
  { label: 'Sentiment', property: 'event_id' },

  // Memory indexes (Memory is reserved keyword, use backticks)
  { label: '`Memory`', property: 'type' },
  { label: '`Memory`', property: 'importance' },
  { label: '`Memory`', property: 'source_type' },
  { label: '`Memory`', property: 'source_id' },
  { label: '`Memory`', property: 'created_at' },

  // Cluster indexes
  { label: 'Cluster', property: 'campaign_id' },
  { label: 'Cluster', property: 'label' },
  { label: 'Cluster', property: 'version' },
];

/**
 * Create a constraint (with error handling for already exists)
 */
async function createConstraint(label: string, property: string): Promise<boolean> {
  try {
    await runQuery(
      `CREATE CONSTRAINT ON (n:${label}) ASSERT n.${property} IS UNIQUE`
    );
    console.log(`  ✓ Created constraint: ${label}.${property}`);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists') || message.includes('Constraint already exists')) {
      console.log(`  - Constraint already exists: ${label}.${property}`);
      return true;
    }
    console.error(`  ✗ Failed to create constraint ${label}.${property}:`, message);
    return false;
  }
}

/**
 * Create an index (with error handling for already exists)
 */
async function createIndex(label: string, property: string): Promise<boolean> {
  try {
    await runQuery(`CREATE INDEX ON :${label}(${property})`);
    console.log(`  ✓ Created index: ${label}.${property}`);
    return true;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already exists') || message.includes('Index already exists')) {
      console.log(`  - Index already exists: ${label}.${property}`);
      return true;
    }
    console.error(`  ✗ Failed to create index ${label}.${property}:`, message);
    return false;
  }
}

/**
 * Run the migration
 */
export async function up(): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  console.log(`\n🚀 Running migration: ${MIGRATION_VERSION}_${MIGRATION_NAME}\n`);

  // Verify connection
  console.log('Verifying Memgraph connection...');
  const connected = await verifyConnection();
  if (!connected) {
    return {
      success: false,
      errors: ['Failed to connect to Memgraph. Is the database running?'],
    };
  }
  console.log('  ✓ Connected to Memgraph\n');

  // Create constraints
  console.log('Creating constraints...');
  for (const { label, property } of CONSTRAINTS) {
    const success = await createConstraint(label, property);
    if (!success) {
      errors.push(`Failed to create constraint: ${label}.${property}`);
    }
  }
  console.log('');

  // Create indexes
  console.log('Creating indexes...');
  for (const { label, property } of INDEXES) {
    const success = await createIndex(label, property);
    if (!success) {
      errors.push(`Failed to create index: ${label}.${property}`);
    }
  }
  console.log('');

  // Record migration in database
  try {
    await runQuery(`
      MERGE (m:_Migration {version: $version})
      SET m.name = $name,
          m.applied_at = $applied_at,
          m.status = 'completed'
    `, {
      version: MIGRATION_VERSION,
      name: MIGRATION_NAME,
      applied_at: new Date().toISOString(),
    });
    console.log('  ✓ Migration recorded in database\n');
  } catch (error) {
    console.warn('  ⚠ Could not record migration (non-critical)\n');
  }

  // Print summary
  const stats = await getDatabaseStats();
  console.log('📊 Database Status:');
  console.log(`   Node labels: ${stats.nodeLabels.join(', ') || '(none yet)'}`);
  console.log(`   Relationship types: ${stats.relationshipTypes.join(', ') || '(none yet)'}`);
  console.log(`   Total nodes: ${stats.nodeCount}`);
  console.log(`   Total relationships: ${stats.relationshipCount}`);
  console.log('');

  const success = errors.length === 0;
  if (success) {
    console.log('✅ Migration completed successfully!\n');
  } else {
    console.log(`⚠️ Migration completed with ${errors.length} error(s)\n`);
  }

  return { success, errors };
}

/**
 * Rollback the migration (drop all constraints and indexes)
 */
export async function down(): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  console.log(`\n🔄 Rolling back migration: ${MIGRATION_VERSION}_${MIGRATION_NAME}\n`);

  // Note: In Memgraph, dropping constraints and indexes requires specific syntax
  // This is a best-effort rollback

  console.log('⚠️  Warning: Rollback will drop all data associated with schema elements\n');

  // Drop indexes first
  console.log('Dropping indexes...');
  for (const { label, property } of INDEXES) {
    try {
      await runQuery(`DROP INDEX ON :${label}(${property})`);
      console.log(`  ✓ Dropped index: ${label}.${property}`);
    } catch (error) {
      // Index might not exist
      console.log(`  - Index not found: ${label}.${property}`);
    }
  }
  console.log('');

  // Drop constraints
  console.log('Dropping constraints...');
  for (const { label, property } of CONSTRAINTS) {
    try {
      await runQuery(
        `DROP CONSTRAINT ON (n:${label}) ASSERT n.${property} IS UNIQUE`
      );
      console.log(`  ✓ Dropped constraint: ${label}.${property}`);
    } catch (error) {
      // Constraint might not exist
      console.log(`  - Constraint not found: ${label}.${property}`);
    }
  }
  console.log('');

  // Remove migration record
  try {
    await runQuery(`
      MATCH (m:_Migration {version: $version})
      DELETE m
    `, { version: MIGRATION_VERSION });
    console.log('  ✓ Migration record removed\n');
  } catch (error) {
    // Non-critical
  }

  console.log('✅ Rollback completed!\n');

  return { success: errors.length === 0, errors };
}

/**
 * Check if migration has been applied
 */
export async function isApplied(): Promise<boolean> {
  try {
    const result = await runQuery<{ count: number }>(`
      MATCH (m:_Migration {version: $version, status: 'completed'})
      RETURN count(m) AS count
    `, { version: MIGRATION_VERSION });

    return result.length > 0 && result[0].count > 0;
  } catch {
    return false;
  }
}

// CLI runner
const isMainModule = typeof require !== 'undefined' && require.main === module;
const isDirectRun = process.argv[1]?.includes('001_initial_schema');

if (isMainModule || isDirectRun) {
  const command = process.argv[2];

  (async () => {
    try {
      if (command === 'down') {
        await down();
      } else {
        await up();
      }
      await closeDriver();
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      await closeDriver();
      process.exit(1);
    }
  })();
}
