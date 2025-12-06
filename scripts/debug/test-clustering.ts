/**
 * Test script for LLM-based clustering (no embeddings)
 * Run with: npx tsx scripts/test-clustering.ts
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CAMPAIGN_ID = '1aaab4d3-6d8f-4bfa-ae4c-a9ff2606610e';
const TARGET_CLUSTERS = 4;
const MIN_CLUSTER_SIZE_PCT = 0.01; // 1% minimum (allow small clusters)

interface ConversationData {
  id: string;
  participant_name: string;
  transcript: Array<{ question: string; answer: string }>;
  patterns?: string[];
  clusterId?: number;
}

interface ClusterDefinition {
  id: number;
  name: string;
  description: string;
  keyCharacteristics: string[];
}

// Extract patterns from each conversation
async function extractPatterns(conversations: ConversationData[]): Promise<ConversationData[]> {
  const batchSize = 20;
  const results: ConversationData[] = [];

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);

    const batchPromises = batch.map(async (conv) => {
      const qaPairs = conv.transcript
        .map(t => `Q: ${t.question}\nA: ${t.answer}`)
        .join('\n\n');

      const prompt = `Analyze this interview and extract 2-3 KEY PATTERNS that characterize this person's perspective.

Interview with ${conv.participant_name}:
${qaPairs}

Extract patterns that capture:
- Their main concerns or hesitations
- What they value or prioritize
- Their decision-making approach
- What would make them act/change

Rules:
- Each pattern should be a specific, concrete statement (not generic)
- Use their actual words/phrases where possible
- Patterns should be things that could differentiate people into groups

JSON format:
{
  "patterns": [
    "Pattern 1: specific insight about this person",
    "Pattern 2: another distinct pattern"
  ]
}`;

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 400,
          temperature: 0.2,
        });

        const content = response.choices[0].message.content?.trim() || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { ...conv, patterns: parsed.patterns || [] };
        }
      } catch (e) {
        console.error('Pattern extraction error:', e);
      }

      return { ...conv, patterns: [] };
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    console.log(`Extracted patterns: ${results.length}/${conversations.length}`);
  }

  return results;
}

// Step 2: LLM analyzes all patterns and proposes cluster categories
async function proposeClusterCategories(
  conversations: ConversationData[],
  numClusters: number
): Promise<ClusterDefinition[]> {
  // Collect all patterns with participant context
  const allPatternsWithContext = conversations
    .flatMap((c, idx) => (c.patterns || []).map(p => `[P${idx + 1}] ${p}`))
    .slice(0, 300); // Limit to avoid token overflow

  const prompt = `You are a UX researcher. Analyze these ${conversations.length} user interview patterns and identify ${numClusters} distinct ISSUES or PATTERNS that ACTUALLY EXIST in the data.

ALL PATTERNS FROM INTERVIEWS:
${allPatternsWithContext.join('\n')}

INSTRUCTIONS:
1. Read ALL the patterns above carefully
2. Identify the ${numClusters} most common/distinct themes that ACTUALLY appear in the data
3. Each cluster must be grounded in real patterns from the interviews - do NOT invent issues that aren't there
4. Name each cluster with a 2-4 word label that summarizes the core issue

NAMING STYLE EXAMPLES (from different domains - do NOT use these, create names from YOUR data):
- E-commerce: "Checkout Abandonment Friction", "Trust Deficit", "Price Comparison Fatigue"
- Banking: "Hidden Fee Anxiety", "Security Concern Paralysis", "Branch Dependency"
- Fitness: "Plateau Frustration", "Equipment Intimidation", "Schedule Inflexibility"

Your cluster names should emerge FROM the patterns above, not from these examples.

JSON format:
{
  "clusters": [
    {
      "id": 1,
      "name": "2-4 word issue label FROM THE DATA",
      "description": "What this issue is based on the actual patterns",
      "keyCharacteristics": ["actual symptom from data", "another symptom", "third symptom"],
      "evidencePatterns": ["P## quote that proves this cluster exists", "another P## quote"]
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.5,
    });

    const content = response.choices[0].message.content?.trim() || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.clusters || [];
    }
  } catch (e) {
    console.error('Cluster proposal error:', e);
  }

  return [];
}

// Step 3: LLM assigns each conversation to a cluster
async function assignConversationsToClusters(
  conversations: ConversationData[],
  clusters: ClusterDefinition[]
): Promise<Map<string, number>> {
  const assignments = new Map<string, number>();
  const batchSize = 15;

  // Create cluster description for the prompt
  const clusterDesc = clusters
    .map(c => `CLUSTER ${c.id}: "${c.name}"\n  - ${c.description}\n  - Key traits: ${c.keyCharacteristics.join(', ')}`)
    .join('\n\n');

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);

    const batchPromises = batch.map(async (conv) => {
      const patterns = (conv.patterns || []).join('\n- ');

      const prompt = `Assign this Duolingo user to the cluster that best matches their PRIMARY issue/pattern.

CLUSTERS:
${clusterDesc}

USER'S PATTERNS:
- ${patterns}

Which cluster BEST describes this user's main issue? Pick the ONE that is most dominant.

JSON:
{
  "cluster_id": <number 1-${clusters.length}>
}`;

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 150,
          temperature: 0.3,
        });

        const content = response.choices[0].message.content?.trim() || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return { id: conv.id, clusterId: parsed.cluster_id };
        }
      } catch (e) {
        console.error('Assignment error:', e);
      }

      return { id: conv.id, clusterId: 1 }; // Default to cluster 1
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(r => assignments.set(r.id, r.clusterId));
    console.log(`Assigned: ${Math.min(i + batchSize, conversations.length)}/${conversations.length}`);
  }

  return assignments;
}

// Step 4: Rebalance clusters if any are too small
async function rebalanceClusters(
  conversations: ConversationData[],
  assignments: Map<string, number>,
  clusters: ClusterDefinition[],
  minSize: number
): Promise<{ assignments: Map<string, number>; clusters: ClusterDefinition[] }> {
  // Count cluster sizes
  const clusterSizes = new Map<number, number>();
  clusters.forEach(c => clusterSizes.set(c.id, 0));
  assignments.forEach(clusterId => {
    clusterSizes.set(clusterId, (clusterSizes.get(clusterId) || 0) + 1);
  });

  console.log('\nCluster sizes before rebalance:');
  clusters.forEach(c => {
    const size = clusterSizes.get(c.id) || 0;
    const pct = Math.round((size / conversations.length) * 100);
    console.log(`  ${c.name}: ${size} (${pct}%)`);
  });

  // Find small clusters
  const smallClusters = clusters.filter(c => (clusterSizes.get(c.id) || 0) < minSize);
  const largeClusters = clusters.filter(c => (clusterSizes.get(c.id) || 0) >= minSize);

  if (smallClusters.length === 0) {
    console.log('All clusters meet minimum size requirement.');
    return { assignments, clusters };
  }

  console.log(`\n⚠️  ${smallClusters.length} cluster(s) below minimum size. Redistributing...`);

  // For participants in small clusters, reassign to best-fit large cluster
  const largeClusterDesc = largeClusters
    .map(c => `CLUSTER ${c.id}: "${c.name}"\n  - ${c.description}\n  - Key traits: ${c.keyCharacteristics.join(', ')}`)
    .join('\n\n');

  const newAssignments = new Map(assignments);
  const participantsToReassign = conversations.filter(c =>
    smallClusters.some(sc => sc.id === assignments.get(c.id))
  );

  for (const conv of participantsToReassign) {
    const patterns = (conv.patterns || []).join('\n- ');

    const prompt = `Reassign this participant to one of the AVAILABLE clusters.

AVAILABLE CLUSTERS:
${largeClusterDesc}

PARTICIPANT PATTERNS:
- ${patterns}

Which available cluster BEST fits?

JSON: { "cluster_id": <number> }`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 50,
        temperature: 0.2,
      });

      const content = response.choices[0].message.content?.trim() || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        newAssignments.set(conv.id, parsed.cluster_id);
      }
    } catch (e) {
      // Assign to largest cluster as fallback
      const largestCluster = largeClusters.reduce((a, b) =>
        (clusterSizes.get(a.id) || 0) > (clusterSizes.get(b.id) || 0) ? a : b
      );
      newAssignments.set(conv.id, largestCluster.id);
    }
  }

  return { assignments: newAssignments, clusters: largeClusters };
}

// Generate final labels and quotes for clusters
async function generateClusterLabels(
  conversations: ConversationData[],
  assignments: Map<string, number>,
  clusters: ClusterDefinition[]
): Promise<Array<{ cluster: ClusterDefinition; members: ConversationData[]; quote: string }>> {
  const results: Array<{ cluster: ClusterDefinition; members: ConversationData[]; quote: string }> = [];

  for (const cluster of clusters) {
    const members = conversations.filter(c => assignments.get(c.id) === cluster.id);

    // Get sample patterns for quote generation
    const samplePatterns = members
      .flatMap(m => m.patterns || [])
      .slice(0, 15)
      .join('\n- ');

    const prompt = `Based on these interview patterns from ${members.length} participants in the "${cluster.name}" cluster, generate a representative first-person quote.

PATTERNS:
- ${samplePatterns}

Create a quote that:
- Is 8-15 words
- Captures the core sentiment/concern of this group
- Sounds like something a real person would say
- Uses "I" perspective

JSON: { "quote": "The first-person quote" }`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.5,
      });

      const content = response.choices[0].message.content?.trim() || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        results.push({ cluster, members, quote: parsed.quote });
      } else {
        results.push({ cluster, members, quote: '' });
      }
    } catch (e) {
      results.push({ cluster, members, quote: '' });
    }
  }

  return results.sort((a, b) => b.members.length - a.members.length);
}

// Main test function
async function testClustering() {
  console.log('=== LLM-Based Clustering (No Embeddings) ===\n');

  // Fetch conversations
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('id, participant_name, transcript, status')
    .eq('campaign_id', CAMPAIGN_ID)
    .eq('status', 'completed');

  if (error || !conversations) {
    console.error('Error fetching conversations:', error);
    return;
  }

  console.log(`Found ${conversations.length} completed conversations`);
  const minClusterSize = Math.ceil(conversations.length * MIN_CLUSTER_SIZE_PCT);
  console.log(`Minimum cluster size: ${minClusterSize} (${MIN_CLUSTER_SIZE_PCT * 100}%)`);
  console.log(`Target clusters: ${TARGET_CLUSTERS}\n`);

  // Convert to our format
  const convData: ConversationData[] = conversations.map(c => ({
    id: c.id,
    participant_name: c.participant_name,
    transcript: c.transcript || [],
  }));

  // Step 1: Extract patterns
  console.log('Step 1: Extracting patterns from conversations...');
  const withPatterns = await extractPatterns(convData);
  console.log();

  // Step 2: LLM proposes cluster categories
  console.log('Step 2: LLM proposing cluster categories...');
  const proposedClusters = await proposeClusterCategories(withPatterns, TARGET_CLUSTERS);

  if (proposedClusters.length === 0) {
    console.error('Failed to propose clusters');
    return;
  }

  console.log('\nProposed clusters:');
  proposedClusters.forEach(c => {
    console.log(`  ${c.id}. ${c.name}`);
    console.log(`     ${c.description}`);
  });
  console.log();

  // Step 3: LLM assigns each conversation to a cluster
  console.log('Step 3: Assigning conversations to clusters...');
  const assignments = await assignConversationsToClusters(withPatterns, proposedClusters);
  console.log();

  // Step 4: Show cluster sizes
  console.log('Step 4: Cluster distribution:');
  const clusterSizes = new Map<number, number>();
  proposedClusters.forEach(c => clusterSizes.set(c.id, 0));
  assignments.forEach(clusterId => {
    clusterSizes.set(clusterId, (clusterSizes.get(clusterId) || 0) + 1);
  });
  proposedClusters.forEach(c => {
    const size = clusterSizes.get(c.id) || 0;
    const pct = Math.round((size / conversations.length) * 100);
    console.log(`  ${c.name}: ${size} (${pct}%)`);
  });

  // Step 5: Generate quotes
  console.log('\nStep 5: Generating representative quotes...');
  const clusterResults = await generateClusterLabels(withPatterns, assignments, proposedClusters);

  // Print results
  console.log('\n\n' + '='.repeat(60));
  console.log('                    FINAL RESULTS');
  console.log('='.repeat(60));
  console.log(`Total participants: ${conversations.length}`);
  console.log(`Final clusters: ${clusterResults.length}\n`);

  clusterResults.forEach((result, idx) => {
    const count = result.members.length;
    const pct = Math.round((count / conversations.length) * 100);
    const prevalence = pct >= 30 ? 'High' : pct >= 20 ? 'Medium' : 'Low';

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Cluster ${idx + 1}: ${result.cluster.name}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`💬 "${result.quote}"`);
    console.log(`👥 ${count} participants (${pct}%) - ${prevalence} Prevalence`);
    console.log(`📝 ${result.cluster.description}`);
    console.log(`🔑 Key traits: ${result.cluster.keyCharacteristics.join(', ')}`);
    console.log();
  });

  // Print sample members from each cluster
  console.log('\n' + '='.repeat(60));
  console.log('                  SAMPLE MEMBERS');
  console.log('='.repeat(60));

  clusterResults.forEach((result, idx) => {
    console.log(`\nCluster ${idx + 1}: ${result.cluster.name}`);
    console.log('Sample participants:');
    result.members.slice(0, 5).forEach(m => {
      console.log(`  - ${m.participant_name}: ${(m.patterns || [])[0] || 'No pattern'}`);
    });
  });
}

testClustering().catch(console.error);
