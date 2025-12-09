// =============================================================================
// SyntheticCohorts Knowledge Graph Schema
// Database: Memgraph
// =============================================================================

// -----------------------------------------------------------------------------
// NODE CONSTRAINTS (Unique IDs)
// -----------------------------------------------------------------------------

// Agent - Synthetic user persona
CREATE CONSTRAINT ON (a:Agent) ASSERT a.id IS UNIQUE;

// Trait - Big Five personality dimensions
CREATE CONSTRAINT ON (t:Trait) ASSERT t.id IS UNIQUE;

// Topic - Discussion subjects and themes
CREATE CONSTRAINT ON (t:Topic) ASSERT t.id IS UNIQUE;

// Product - Items/services discussed
CREATE CONSTRAINT ON (p:Product) ASSERT p.id IS UNIQUE;

// Event - Simulation occurrences (Q&A turns, decisions)
CREATE CONSTRAINT ON (e:Event) ASSERT e.id IS UNIQUE;

// Sentiment - Emotional reactions
CREATE CONSTRAINT ON (s:Sentiment) ASSERT s.id IS UNIQUE;

// Memory - Reflection/insight nodes
CREATE CONSTRAINT ON (m:Memory) ASSERT m.id IS UNIQUE;

// Cluster - Community groupings
CREATE CONSTRAINT ON (c:Cluster) ASSERT c.id IS UNIQUE;

// -----------------------------------------------------------------------------
// INDEXES FOR FREQUENT QUERIES
// -----------------------------------------------------------------------------

// Agent indexes
CREATE INDEX ON :Agent(workspace_id);
CREATE INDEX ON :Agent(name);
CREATE INDEX ON :Agent(created_at);

// Trait indexes (for filtering by personality)
CREATE INDEX ON :Trait(type);
CREATE INDEX ON :Trait(level);

// Topic indexes
CREATE INDEX ON :Topic(name);
CREATE INDEX ON :Topic(type);
CREATE INDEX ON :Topic(source_campaign_id);

// Product indexes
CREATE INDEX ON :Product(name);
CREATE INDEX ON :Product(category);

// Event indexes
CREATE INDEX ON :Event(conversation_id);
CREATE INDEX ON :Event(type);
CREATE INDEX ON :Event(timestamp);
CREATE INDEX ON :Event(importance_score);

// Sentiment indexes
CREATE INDEX ON :Sentiment(type);
CREATE INDEX ON :Sentiment(event_id);

// Memory indexes
CREATE INDEX ON :Memory(type);
CREATE INDEX ON :Memory(importance);
CREATE INDEX ON :Memory(source_type);
CREATE INDEX ON :Memory(source_id);
CREATE INDEX ON :Memory(created_at);

// Cluster indexes
CREATE INDEX ON :Cluster(campaign_id);
CREATE INDEX ON :Cluster(label);
CREATE INDEX ON :Cluster(version);

// -----------------------------------------------------------------------------
// EDGE/RELATIONSHIP TYPE DEFINITIONS (Documentation)
// -----------------------------------------------------------------------------
// Note: Memgraph doesn't require pre-definition of relationship types,
// but we document them here for reference.

// Agent-centric relationships:
// (:Agent)-[:HAS_TRAIT {score: FLOAT}]->(:Trait)
// (:Agent)-[:REMEMBERS {recency: FLOAT, importance: FLOAT}]->(:Memory)
// (:Agent)-[:USES {frequency: STRING, since: DATE}]->(:Product)
// (:Agent)-[:LIKES {reason: STRING}]->(:Product)
// (:Agent)-[:DISLIKES {reason: STRING}]->(:Product)
// (:Agent)-[:FRUSTRATED_BY {severity: INTEGER}]->(:Product)
// (:Agent)-[:INTERESTED_IN {intensity: FLOAT}]->(:Topic)
// (:Agent)-[:CONCERNED_ABOUT {urgency: STRING}]->(:Topic)
// (:Agent)-[:KNOWS {strength: FLOAT}]->(:Agent)
// (:Agent)-[:SIMILAR_TO {similarity: FLOAT}]->(:Agent)
// (:Agent)-[:BELONGS_TO {confidence: FLOAT}]->(:Cluster)

// Event/Conversation relationships:
// (:Agent)-[:PARTICIPATED_IN {role: STRING}]->(:Event)
// (:Event)-[:FOLLOWED_BY {delay_ms: INTEGER}]->(:Event)
// (:Event)-[:IS_FOLLOWUP_TO]->(:Event)
// (:Event)-[:TRIGGERED {before_after: STRING}]->(:Sentiment)
// (:Agent)-[:EXPRESSED {during_event: UUID}]->(:Sentiment)
// (:Event)-[:DISCUSSES]->(:Topic)
// (:Event)-[:MENTIONS]->(:Product)

// Knowledge relationships:
// (:Topic)-[:RELATES_TO {relationship: STRING}]->(:Product)
// (:Topic)-[:SUBTOPIC_OF]->(:Topic)
// (:Memory)-[:ABOUT]->(:Topic)
// (:Memory)-[:REFERENCES]->(:Product)
// (:Cluster)-[:CHARACTERIZED_BY]->(:Topic)
