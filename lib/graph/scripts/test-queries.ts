/**
 * Test Script: Verify Graph Queries
 *
 * Tests common Cypher queries against the Knowledge Graph to ensure
 * the schema is properly set up and data is accessible.
 *
 * Usage:
 *   npm run db:test
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { runQuery, runQuerySingle, verifyConnection, getDatabaseStats, closeDriver } from '../client';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  data?: unknown;
}

const results: TestResult[] = [];

function log(test: TestResult) {
  results.push(test);
  const icon = test.passed ? '✓' : '✗';
  console.log(`  ${icon} ${test.name}`);
  if (!test.passed) {
    console.log(`    Error: ${test.message}`);
  }
}

async function runTests() {
  console.log('\n🧪 Knowledge Graph Query Tests\n');
  console.log('='.repeat(50));

  // Test 1: Connection
  console.log('\n📡 Connection Tests\n');

  const connected = await verifyConnection();
  log({
    name: 'Database connection',
    passed: connected,
    message: connected ? 'Connected' : 'Failed to connect to Memgraph',
  });

  if (!connected) {
    console.log('\n❌ Cannot proceed without database connection');
    return;
  }

  // Test 2: Database stats
  console.log('\n📊 Database Stats\n');

  try {
    const stats = await getDatabaseStats();
    log({
      name: 'Get database stats',
      passed: true,
      message: 'Retrieved stats',
      data: stats,
    });
    console.log(`    Nodes: ${stats.nodeCount}`);
    console.log(`    Relationships: ${stats.relationshipCount}`);
    console.log(`    Labels: ${stats.nodeLabels.join(', ') || '(none)'}`);
    console.log(`    Rel Types: ${stats.relationshipTypes.join(', ') || '(none)'}`);
  } catch (error) {
    log({
      name: 'Get database stats',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 3: Agent queries
  console.log('\n👤 Agent Queries\n');

  try {
    const agents = await runQuery<{ id: string; name: string }>(
      'MATCH (a:Agent) RETURN a.id AS id, a.name AS name LIMIT 5'
    );
    log({
      name: 'List agents',
      passed: true,
      message: `Found ${agents.length} agent(s)`,
      data: agents,
    });
    if (agents.length > 0) {
      console.log(`    Sample: ${agents.map((a) => a.name).join(', ')}`);
    }
  } catch (error) {
    log({
      name: 'List agents',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 4: Agent with traits
  console.log('\n🎭 Trait Queries\n');

  try {
    const agentWithTraits = await runQuery<{
      name: string;
      trait: string;
      score: number;
    }>(`
      MATCH (a:Agent)-[r:HAS_TRAIT]->(t:Trait)
      RETURN a.name AS name, t.type AS trait, r.score AS score
      LIMIT 10
    `);
    log({
      name: 'Agent traits',
      passed: true,
      message: `Found ${agentWithTraits.length} trait relationship(s)`,
      data: agentWithTraits,
    });
    if (agentWithTraits.length > 0) {
      console.log(`    Sample: ${agentWithTraits[0].name} has ${agentWithTraits[0].trait} = ${agentWithTraits[0].score}`);
    }
  } catch (error) {
    log({
      name: 'Agent traits',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 5: Memory queries (Memory is reserved keyword, escape with backticks)
  console.log('\n🧠 Memory Queries\n');

  try {
    const memories = await runQuery<{
      type: string;
      count: number;
    }>(`
      MATCH (m:\`Memory\`)
      RETURN m.type AS type, count(*) AS count
      ORDER BY count DESC
    `);
    log({
      name: 'Memory type counts',
      passed: true,
      message: `Found ${memories.length} memory type(s)`,
      data: memories,
    });
    for (const m of memories.slice(0, 5)) {
      console.log(`    ${m.type}: ${m.count}`);
    }
  } catch (error) {
    log({
      name: 'Memory type counts',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 6: Agent memory retrieval
  try {
    const agentMemories = await runQuery<{
      agentName: string;
      memoryCount: number;
    }>(`
      MATCH (a:Agent)-[:REMEMBERS]->(m:\`Memory\`)
      RETURN a.name AS agentName, count(m) AS memoryCount
      ORDER BY memoryCount DESC
      LIMIT 5
    `);
    log({
      name: 'Agent memory counts',
      passed: true,
      message: `Agents with memories: ${agentMemories.length}`,
      data: agentMemories,
    });
    if (agentMemories.length > 0) {
      console.log(`    Top: ${agentMemories[0].agentName} (${agentMemories[0].memoryCount} memories)`);
    }
  } catch (error) {
    log({
      name: 'Agent memory counts',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 7: High importance memories
  console.log('\n⭐ Important Memories\n');

  try {
    const importantMemories = await runQuery<{
      content: string;
      type: string;
      importance: number;
    }>(`
      MATCH (m:\`Memory\`)
      WHERE m.importance >= 8
      RETURN m.content AS content, m.type AS type, m.importance AS importance
      ORDER BY m.importance DESC
      LIMIT 5
    `);
    log({
      name: 'High importance memories',
      passed: true,
      message: `Found ${importantMemories.length} memories with importance >= 8`,
      data: importantMemories,
    });
    for (const m of importantMemories.slice(0, 3)) {
      console.log(`    [${m.importance}] ${m.type}: "${m.content.slice(0, 50)}..."`);
    }
  } catch (error) {
    log({
      name: 'High importance memories',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Test 8: Full agent context retrieval
  console.log('\n📋 Full Agent Context\n');

  try {
    const agentContext = await runQuerySingle<{
      agent: { id: string; name: string };
      traits: Array<{ type: string; score: number }>;
      memoryCount: number;
    }>(`
      MATCH (a:Agent)
      WITH a LIMIT 1
      OPTIONAL MATCH (a)-[ht:HAS_TRAIT]->(t:Trait)
      OPTIONAL MATCH (a)-[:REMEMBERS]->(m:\`Memory\`)
      RETURN a AS agent,
             collect(DISTINCT {type: t.type, score: ht.score}) AS traits,
             count(DISTINCT m) AS memoryCount
    `);
    log({
      name: 'Full agent context',
      passed: !!agentContext,
      message: agentContext ? 'Retrieved full context' : 'No agents found',
      data: agentContext,
    });
    if (agentContext) {
      console.log(`    Agent: ${agentContext.agent?.name || 'Unknown'}`);
      console.log(`    Traits: ${agentContext.traits?.length || 0}`);
      console.log(`    Memories: ${agentContext.memoryCount || 0}`);
    }
  } catch (error) {
    log({
      name: 'Full agent context',
      passed: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Summary\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${results.length}`);

  if (failed > 0) {
    console.log('\n⚠️ Some tests failed. Check the output above for details.\n');
  } else {
    console.log('\n✅ All tests passed!\n');
  }
}

// Run tests
runTests()
  .catch((error) => {
    console.error('\n❌ Test script failed:', error);
  })
  .finally(() => {
    closeDriver();
  });
