/**
 * Memgraph Client
 *
 * Provides a connection to Memgraph using the neo4j-driver (Bolt protocol compatible).
 * Used for Knowledge Graph operations in the SyntheticCohorts framework.
 */

import neo4j, { Driver, Session, Result, Record as Neo4jRecord } from 'neo4j-driver';

// Singleton driver instance
let driver: Driver | null = null;

/**
 * Get or create the Memgraph driver instance
 */
function getDriver(): Driver {
  if (!driver) {
    const host = process.env.MEMGRAPH_HOST || 'localhost';
    const port = process.env.MEMGRAPH_PORT || '7687';
    const username = process.env.MEMGRAPH_USERNAME || '';
    const password = process.env.MEMGRAPH_PASSWORD || '';
    const encrypted = process.env.MEMGRAPH_ENCRYPTED === 'true';

    driver = neo4j.driver(
      `bolt://${host}:${port}`,
      neo4j.auth.basic(username, password),
      {
        encrypted: encrypted ? 'ENCRYPTION_ON' : 'ENCRYPTION_OFF',
        maxConnectionPoolSize: 50,
        connectionAcquisitionTimeout: 30000,
      }
    );
  }
  return driver;
}

/**
 * Run a Cypher query and return typed results
 */
export async function runQuery<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const session: Session = getDriver().session();
  try {
    const result: Result = await session.run(cypher, params);
    return result.records.map((record: Neo4jRecord) => record.toObject() as T);
  } finally {
    await session.close();
  }
}

/**
 * Run a Cypher query and return a single result or null
 */
export async function runQuerySingle<T = Record<string, unknown>>(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<T | null> {
  const results = await runQuery<T>(cypher, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * Run multiple Cypher queries in a transaction
 */
export async function runTransaction<T = Record<string, unknown>>(
  queries: Array<{ cypher: string; params?: Record<string, unknown> }>
): Promise<T[][]> {
  const session: Session = getDriver().session();
  const results: T[][] = [];

  try {
    await session.executeWrite(async (tx) => {
      for (const { cypher, params } of queries) {
        const result = await tx.run(cypher, params || {});
        results.push(result.records.map((record: Neo4jRecord) => record.toObject() as T));
      }
    });
    return results;
  } finally {
    await session.close();
  }
}

/**
 * Check if the database connection is healthy
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    await runQuery('RETURN 1 AS result');
    return true;
  } catch (error) {
    console.error('Memgraph connection failed:', error);
    return false;
  }
}

/**
 * Close the driver connection (call on application shutdown)
 */
export async function closeDriver(): Promise<void> {
  if (driver) {
    await driver.close();
    driver = null;
  }
}

/**
 * Get database statistics (Memgraph-compatible)
 */
export async function getDatabaseStats(): Promise<{
  nodeCount: number;
  relationshipCount: number;
  nodeLabels: string[];
  relationshipTypes: string[];
}> {
  // Node count
  const [nodeResult] = await runQuery<{ count: { low: number } | number }>(
    'MATCH (n) RETURN count(n) AS count'
  );

  // Relationship count
  const [relResult] = await runQuery<{ count: { low: number } | number }>(
    'MATCH ()-[r]->() RETURN count(r) AS count'
  );

  // Get labels using Memgraph's SHOW command or fallback
  let nodeLabels: string[] = [];
  try {
    // Try Memgraph's native command
    const labelResults = await runQuery<{ label: string }>(
      'MATCH (n) WITH DISTINCT labels(n) AS lbls UNWIND lbls AS label RETURN DISTINCT label'
    );
    nodeLabels = labelResults.map((r) => r.label);
  } catch {
    // Fallback: empty array
    nodeLabels = [];
  }

  // Get relationship types
  let relationshipTypes: string[] = [];
  try {
    const typeResults = await runQuery<{ type: string }>(
      'MATCH ()-[r]->() RETURN DISTINCT type(r) AS type'
    );
    relationshipTypes = typeResults.map((r) => r.type);
  } catch {
    relationshipTypes = [];
  }

  // Handle both integer and Neo4j Integer object formats
  const getCount = (val: { low: number } | number | undefined): number => {
    if (val === undefined) return 0;
    if (typeof val === 'number') return val;
    return val.low || 0;
  };

  return {
    nodeCount: getCount(nodeResult?.count),
    relationshipCount: getCount(relResult?.count),
    nodeLabels,
    relationshipTypes,
  };
}

// Export driver getter for advanced use cases
export { getDriver };
