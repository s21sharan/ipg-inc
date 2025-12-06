/**
 * Clustering Engine (LLM-Based)
 *
 * Generates insight clusters from campaign conversations using:
 * 1. Pattern extraction from each conversation
 * 2. LLM proposes cluster categories from patterns
 * 3. LLM assigns each conversation to a cluster
 * 4. Quote generation for each cluster
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const TARGET_CLUSTERS = 4;

// Types
export interface ClusterMember {
  conversation_id: string;
  participant_name: string;
  quotes: string[];
}

export interface Cluster {
  cluster_id: string; // 'A', 'B', 'C', 'D'
  label: string;
  quote: string;
  description: string;
  count: number;
  percentage: number;
  confidence: number;
  prevalence: 'High' | 'Medium' | 'Low';
  members: ClusterMember[];
}

export interface ClusteringResult {
  dimension: string;
  dimension_rationale: string;
  clusters: Cluster[];
}

interface ConversationData {
  id: string;
  participant_name: string;
  transcript: Array<{ question: string; answer: string }>;
  patterns?: string[];
}

interface ClusterDefinition {
  id: number;
  name: string;
  description: string;
  keyCharacteristics: string[];
}

// Step 1: Extract patterns from each conversation
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

// Step 2: LLM proposes cluster categories from all patterns
async function proposeClusterCategories(
  conversations: ConversationData[],
  numClusters: number
): Promise<ClusterDefinition[]> {
  const allPatternsWithContext = conversations
    .flatMap((c, idx) => (c.patterns || []).map(p => `[P${idx + 1}] ${p}`))
    .slice(0, 300);

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
      "keyCharacteristics": ["actual symptom from data", "another symptom", "third symptom"]
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

  const clusterDesc = clusters
    .map(c => `CLUSTER ${c.id}: "${c.name}"\n  - ${c.description}\n  - Key traits: ${c.keyCharacteristics.join(', ')}`)
    .join('\n\n');

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);

    const batchPromises = batch.map(async (conv) => {
      const patterns = (conv.patterns || []).join('\n- ');

      const prompt = `Assign this user to the cluster that best matches their PRIMARY issue/pattern.

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
          max_tokens: 100,
          temperature: 0.2,
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

      return { id: conv.id, clusterId: 1 };
    });

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(r => assignments.set(r.id, r.clusterId));
    console.log(`Assigned: ${Math.min(i + batchSize, conversations.length)}/${conversations.length}`);
  }

  return assignments;
}

// Step 4: Generate representative quotes for each cluster
async function generateClusterQuotes(
  conversations: ConversationData[],
  assignments: Map<string, number>,
  clusters: ClusterDefinition[]
): Promise<Map<number, string>> {
  const quotes = new Map<number, string>();

  for (const cluster of clusters) {
    const members = conversations.filter(c => assignments.get(c.id) === cluster.id);

    if (members.length === 0) {
      quotes.set(cluster.id, '');
      continue;
    }

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
        quotes.set(cluster.id, parsed.quote);
      }
    } catch (e) {
      quotes.set(cluster.id, '');
    }
  }

  return quotes;
}

function getPrevalence(percentage: number): 'High' | 'Medium' | 'Low' {
  if (percentage >= 30) return 'High';
  if (percentage >= 20) return 'Medium';
  return 'Low';
}

// Main clustering function
export async function runClustering(
  campaignId: string,
  analysisId: string | null
): Promise<ClusteringResult> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get campaign info
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error('Campaign not found');
  }

  // Get completed conversations
  const { data: conversations, error: convError } = await supabase
    .from('conversations')
    .select('id, source_interview_id, status, transcript, participant_name')
    .eq('campaign_id', campaignId)
    .eq('status', 'completed');

  if (convError) {
    console.error('Error fetching conversations:', convError);
    throw new Error(`Failed to fetch conversations: ${convError.message}`);
  }

  if (!conversations || conversations.length === 0) {
    throw new Error('No completed conversations found for this campaign');
  }

  console.log(`Processing ${conversations.length} conversations for clustering`);

  // Transform to ConversationData
  const conversationData: ConversationData[] = conversations.map((conv: any) => ({
    id: conv.id,
    participant_name: conv.participant_name || 'Unknown',
    transcript: conv.transcript || [],
  }));

  // Step 1: Extract patterns
  console.log('Step 1: Extracting patterns from conversations...');
  const withPatterns = await extractPatterns(conversationData);

  // Step 2: LLM proposes cluster categories
  console.log('Step 2: LLM proposing cluster categories...');
  const proposedClusters = await proposeClusterCategories(withPatterns, TARGET_CLUSTERS);

  if (proposedClusters.length === 0) {
    throw new Error('Failed to propose clusters');
  }

  console.log('Proposed clusters:');
  proposedClusters.forEach(c => {
    console.log(`  ${c.id}. ${c.name}: ${c.description}`);
  });

  // Step 3: LLM assigns each conversation to a cluster
  console.log('Step 3: Assigning conversations to clusters...');
  const assignments = await assignConversationsToClusters(withPatterns, proposedClusters);

  // Count cluster sizes
  const clusterSizes = new Map<number, number>();
  proposedClusters.forEach(c => clusterSizes.set(c.id, 0));
  assignments.forEach(clusterId => {
    clusterSizes.set(clusterId, (clusterSizes.get(clusterId) || 0) + 1);
  });

  console.log('Cluster distribution:');
  proposedClusters.forEach(c => {
    const size = clusterSizes.get(c.id) || 0;
    const pct = Math.round((size / conversations.length) * 100);
    console.log(`  ${c.name}: ${size} (${pct}%)`);
  });

  // Step 4: Generate quotes
  console.log('Step 4: Generating representative quotes...');
  const quotes = await generateClusterQuotes(withPatterns, assignments, proposedClusters);

  // Build final result
  console.log('Step 5: Building results...');
  const totalConversations = conversations.length;

  // Sort clusters by size (largest first) and filter out empty ones
  const sortedClusters = proposedClusters
    .map(cluster => ({
      cluster,
      count: clusterSizes.get(cluster.id) || 0,
      members: withPatterns.filter(c => assignments.get(c.id) === cluster.id),
    }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const clusters: Cluster[] = sortedClusters.map((item, idx) => {
    const percentage = Math.round((item.count / totalConversations) * 100);

    return {
      cluster_id: String.fromCharCode(65 + idx), // A, B, C, D
      label: item.cluster.name,
      quote: quotes.get(item.cluster.id) || '',
      description: item.cluster.description,
      count: item.count,
      percentage,
      confidence: 0.85, // LLM-based clustering doesn't have distance metrics
      prevalence: getPrevalence(percentage),
      members: item.members.map(m => ({
        conversation_id: m.id,
        participant_name: m.participant_name,
        quotes: m.patterns || [],
      })),
    };
  });

  return {
    dimension: 'issues', // LLM-based approach focuses on issues/patterns
    dimension_rationale: 'Clusters identified by analyzing user patterns and concerns',
    clusters,
  };
}

// Trigger clustering for a campaign
export async function triggerClustering(
  campaignId: string,
  analysisId: string | null = null
): Promise<{ clusterId: string }> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get next version number
  const { data: existing } = await supabase
    .from('campaign_clusters')
    .select('version_number')
    .eq('campaign_id', campaignId)
    .order('version_number', { ascending: false })
    .limit(1);

  const versionNumber = (existing?.[0]?.version_number || 0) + 1;

  // Get conversation count
  const { count } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'completed');

  // Create cluster record
  const { data: cluster, error } = await supabase
    .from('campaign_clusters')
    .insert({
      campaign_id: campaignId,
      analysis_id: analysisId,
      version_number: versionNumber,
      dimension: 'pending',
      status: 'pending',
      conversations_analyzed: count || 0,
    })
    .select()
    .single();

  if (error || !cluster) {
    throw new Error('Failed to create cluster record');
  }

  // Start clustering in background (non-blocking)
  processClusteringAsync(cluster.id, campaignId, analysisId);

  return { clusterId: cluster.id };
}

// Process clustering asynchronously
async function processClusteringAsync(
  clusterId: string,
  campaignId: string,
  analysisId: string | null
) {
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Update status to extracting
    await supabase
      .from('campaign_clusters')
      .update({ status: 'extracting' })
      .eq('id', clusterId);

    // Run the clustering pipeline
    const result = await runClustering(campaignId, analysisId);

    // Update with results
    await supabase
      .from('campaign_clusters')
      .update({
        status: 'completed',
        dimension: result.dimension,
        dimension_rationale: result.dimension_rationale,
        clusters_json: { clusters: result.clusters },
        completed_at: new Date().toISOString(),
      })
      .eq('id', clusterId);

    console.log(`Clustering completed for campaign ${campaignId}`);
  } catch (error: any) {
    console.error('Clustering failed:', error);

    await supabase
      .from('campaign_clusters')
      .update({
        status: 'failed',
        error_message: error.message || 'Unknown error',
      })
      .eq('id', clusterId);
  }
}

// Get latest completed clusters for a campaign
export async function getLatestClusters(campaignId: string): Promise<{
  id: string;
  dimension: string;
  dimension_rationale: string;
  clusters: Cluster[];
  status: string;
  created_at: string;
  completed_at: string | null;
} | null> {
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supabase
    .from('campaign_clusters')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'completed')
    .order('version_number', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    dimension: data.dimension,
    dimension_rationale: data.dimension_rationale,
    clusters: data.clusters_json?.clusters || [],
    status: data.status,
    created_at: data.created_at,
    completed_at: data.completed_at,
  };
}
