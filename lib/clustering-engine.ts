/**
 * Clustering Engine
 *
 * Generates insight clusters from campaign conversations using:
 * 1. Dimension detection (pain_points vs goals)
 * 2. Quote extraction (2-4 verbatim quotes per conversation)
 * 3. Embedding generation (text-embedding-3-small)
 * 4. K-means clustering (k=4)
 * 5. Cluster labeling (GPT-4o-mini)
 * 6. Confidence calculation
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Types
export interface ClusterMember {
  conversation_id: string;
  participant_name: string;
  quotes: string[];
}

export interface Cluster {
  cluster_id: string; // 'A', 'B', 'C', 'D'
  label: string;
  quote: string; // First-person quote (5-7 words)
  description: string;
  count: number;
  percentage: number;
  confidence: number; // 0-1
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
  transcript: Array<{ role: string; content: string }>;
  quotes?: string[];
  embedding?: number[];
}

// Step 1: Detect the best clustering dimension
async function detectDimension(
  campaignTitle: string,
  campaignCaption: string,
  sampleConversations: ConversationData[]
): Promise<{ dimension: string; rationale: string }> {
  // Get sample quotes from conversations
  const sampleTexts = sampleConversations.slice(0, 5).map(conv => {
    const userResponses = conv.transcript
      .filter(t => t.role === 'user')
      .map(t => t.content)
      .slice(0, 3)
      .join('\n');
    return `${conv.participant_name}: ${userResponses.substring(0, 500)}`;
  }).join('\n\n');

  const prompt = `You are analyzing a market research campaign to determine the best way to cluster participants.

Campaign: "${campaignTitle}"
Description: "${campaignCaption}"

Sample participant responses:
${sampleTexts}

Based on the campaign focus and participant responses, choose the SINGLE BEST dimension for clustering:
- "pain_points" - Group by frustrations, problems, or challenges they face
- "goals" - Group by what they want to achieve or their motivations

Respond with EXACTLY this JSON format:
{
  "dimension": "pain_points" or "goals",
  "rationale": "Brief 1-sentence explanation of why this dimension is most insightful for this campaign"
}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 150,
    temperature: 0.3,
  });

  try {
    const content = response.choices[0].message.content?.trim() || '';
    const parsed = JSON.parse(content);
    return {
      dimension: parsed.dimension,
      rationale: parsed.rationale,
    };
  } catch {
    // Default to pain_points if parsing fails
    return {
      dimension: 'pain_points',
      rationale: 'Defaulted to pain points analysis',
    };
  }
}

// Step 2: Extract quotes from each conversation
async function extractQuotes(
  conversations: ConversationData[],
  dimension: string
): Promise<ConversationData[]> {
  const dimensionPrompt = dimension === 'pain_points'
    ? 'frustrations, complaints, problems, or challenges'
    : 'goals, desires, motivations, or what they want to achieve';

  // Process in batches
  const batchSize = 10;
  const results: ConversationData[] = [];

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);

    const batchPromises = batch.map(async (conv) => {
      const userResponses = conv.transcript
        .filter(t => t.role === 'user')
        .map(t => t.content)
        .join('\n\n');

      const prompt = `Extract 2-4 verbatim quotes from this interview participant that reveal their ${dimensionPrompt}.

Participant: ${conv.participant_name}
Responses:
${userResponses}

Rules:
- Extract EXACT quotes from the text (do not paraphrase)
- Each quote should be 1-3 sentences
- Focus on quotes that reveal ${dimensionPrompt}
- Return 2-4 quotes total

Respond with EXACTLY this JSON format:
{
  "quotes": ["quote 1", "quote 2", "quote 3"]
}`;

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.3,
        });

        const content = response.choices[0].message.content?.trim() || '';
        const parsed = JSON.parse(content);
        return {
          ...conv,
          quotes: parsed.quotes || [],
        };
      } catch {
        // Fallback: use first few user responses
        const fallbackQuotes = conv.transcript
          .filter(t => t.role === 'user')
          .slice(0, 3)
          .map(t => t.content.substring(0, 200));
        return {
          ...conv,
          quotes: fallbackQuotes,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    console.log(`Extracted quotes: ${Math.min(i + batchSize, conversations.length)}/${conversations.length}`);
  }

  return results;
}

// Step 3: Generate embeddings
async function generateEmbeddings(
  conversations: ConversationData[]
): Promise<ConversationData[]> {
  const batchSize = 20;
  const results: ConversationData[] = [...conversations];

  for (let i = 0; i < conversations.length; i += batchSize) {
    const batch = conversations.slice(i, i + batchSize);
    const texts = batch.map(conv => (conv.quotes || []).join('\n\n'));

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    for (let j = 0; j < response.data.length; j++) {
      results[i + j].embedding = response.data[j].embedding;
    }

    console.log(`Generated embeddings: ${Math.min(i + batchSize, conversations.length)}/${conversations.length}`);
  }

  return results;
}

// Step 4: K-means clustering
function kMeans(embeddings: number[][], k: number, maxIterations = 100): {
  assignments: number[];
  centroids: number[][];
  distances: number[];
} {
  const n = embeddings.length;
  if (n === 0) return { assignments: [], centroids: [], distances: [] };

  const dim = embeddings[0].length;

  // Initialize centroids using k-means++
  const centroids: number[][] = [];
  const usedIndices = new Set<number>();

  // First centroid: random
  let firstIdx = Math.floor(Math.random() * n);
  centroids.push([...embeddings[firstIdx]]);
  usedIndices.add(firstIdx);

  // Remaining centroids: weighted by distance
  while (centroids.length < k) {
    const distances = embeddings.map((emb, idx) => {
      if (usedIndices.has(idx)) return 0;
      let minDist = Infinity;
      for (const centroid of centroids) {
        const dist = euclideanDistance(emb, centroid);
        minDist = Math.min(minDist, dist);
      }
      return minDist * minDist;
    });

    const totalDist = distances.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalDist;

    for (let i = 0; i < n; i++) {
      random -= distances[i];
      if (random <= 0 && !usedIndices.has(i)) {
        centroids.push([...embeddings[i]]);
        usedIndices.add(i);
        break;
      }
    }
  }

  let assignments = new Array(n).fill(0);
  let pointDistances = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign points to nearest centroid
    const newAssignments: number[] = [];
    const newDistances: number[] = [];

    for (const emb of embeddings) {
      let minDist = Infinity;
      let minIdx = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(emb, centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = c;
        }
      }
      newAssignments.push(minIdx);
      newDistances.push(minDist);
    }

    // Check for convergence
    if (newAssignments.every((a, i) => a === assignments[i])) {
      console.log(`K-means converged after ${iter + 1} iterations`);
      assignments = newAssignments;
      pointDistances = newDistances;
      break;
    }

    assignments = newAssignments;
    pointDistances = newDistances;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const clusterIndices = assignments
        .map((a, i) => (a === c ? i : -1))
        .filter(i => i >= 0);

      if (clusterIndices.length > 0) {
        centroids[c] = new Array(dim).fill(0);
        for (const idx of clusterIndices) {
          for (let d = 0; d < dim; d++) {
            centroids[c][d] += embeddings[idx][d] / clusterIndices.length;
          }
        }
      }
    }
  }

  return { assignments, centroids, distances: pointDistances };
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

// Step 5: Label clusters
async function labelClusters(
  clusters: Array<{
    members: ConversationData[];
    avgDistance: number;
  }>,
  dimension: string
): Promise<Array<{
  label: string;
  quote: string;
  description: string;
}>> {
  const dimensionNoun = dimension === 'pain_points' ? 'frustration' : 'goal';

  const results = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    // Gather all quotes from cluster members
    const allQuotes = cluster.members
      .flatMap(m => m.quotes || [])
      .slice(0, 15) // Limit to avoid token issues
      .map((q, idx) => `${idx + 1}. "${q}"`)
      .join('\n');

    const prompt = `These quotes are from interview participants who share a common ${dimensionNoun}. Analyze them to identify the theme.

Quotes:
${allQuotes}

Respond with EXACTLY this JSON format:
{
  "label": "2-4 word label for the ${dimensionNoun} (e.g., 'Repetition Fatigue', 'Progress Tracking')",
  "quote": "5-7 word first-person statement expressing this ${dimensionNoun} (e.g., 'I feel stuck doing the same thing')",
  "description": "1-2 sentence description of this ${dimensionNoun} pattern"
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
        temperature: 0.5,
      });

      const content = response.choices[0].message.content?.trim() || '';
      const parsed = JSON.parse(content);
      results.push({
        label: parsed.label,
        quote: parsed.quote,
        description: parsed.description,
      });

      console.log(`Labeled cluster ${i + 1}: "${parsed.label}"`);
    } catch {
      results.push({
        label: `Cluster ${String.fromCharCode(65 + i)}`,
        quote: 'Common experience shared',
        description: 'A group of participants with similar perspectives.',
      });
    }
  }

  return results;
}

// Step 6: Calculate confidence based on cluster cohesion
function calculateConfidence(distances: number[], clusterSize: number, totalSize: number): number {
  if (distances.length === 0) return 0.5;

  // Average distance to centroid (lower = more cohesive)
  const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;

  // Normalize distance to 0-1 range (assuming typical range 0-2 for normalized embeddings)
  const normalizedDistance = Math.min(avgDistance / 2, 1);

  // Convert to confidence (higher distance = lower confidence)
  const distanceConfidence = 1 - normalizedDistance;

  // Factor in cluster size (very small or very large clusters are less confident)
  const expectedSize = totalSize / 4;
  const sizeRatio = clusterSize / expectedSize;
  const sizeConfidence = sizeRatio > 0.5 && sizeRatio < 2 ? 1 : 0.7;

  return Math.round(distanceConfidence * sizeConfidence * 100) / 100;
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

  // Step 1: Detect dimension
  console.log('Step 1: Detecting clustering dimension...');
  const { dimension, rationale } = await detectDimension(
    campaign.title || campaign.name,
    campaign.caption || '',
    conversationData
  );
  console.log(`Dimension: ${dimension} - ${rationale}`);

  // Step 2: Extract quotes
  console.log('Step 2: Extracting quotes...');
  const withQuotes = await extractQuotes(conversationData, dimension);

  // Step 3: Generate embeddings
  console.log('Step 3: Generating embeddings...');
  const withEmbeddings = await generateEmbeddings(withQuotes);

  // Step 4: K-means clustering
  console.log('Step 4: Running k-means clustering...');
  const embeddings = withEmbeddings
    .filter(c => c.embedding && c.embedding.length > 0)
    .map(c => c.embedding!);

  const validConversations = withEmbeddings.filter(c => c.embedding && c.embedding.length > 0);

  const { assignments, distances } = kMeans(embeddings, 4);

  // Group by cluster
  const clusterGroups: Map<number, { members: ConversationData[]; distances: number[] }> = new Map();
  for (let i = 0; i < assignments.length; i++) {
    const clusterId = assignments[i];
    if (!clusterGroups.has(clusterId)) {
      clusterGroups.set(clusterId, { members: [], distances: [] });
    }
    clusterGroups.get(clusterId)!.members.push(validConversations[i]);
    clusterGroups.get(clusterId)!.distances.push(distances[i]);
  }

  // Convert to array and sort by size
  const sortedClusters = Array.from(clusterGroups.entries())
    .map(([, data]) => ({
      members: data.members,
      avgDistance: data.distances.reduce((a, b) => a + b, 0) / data.distances.length,
      distances: data.distances,
    }))
    .sort((a, b) => b.members.length - a.members.length);

  // Step 5: Label clusters
  console.log('Step 5: Labeling clusters...');
  const labels = await labelClusters(sortedClusters, dimension);

  // Step 6: Build final result
  console.log('Step 6: Building results...');
  const totalConversations = validConversations.length;

  const clusters: Cluster[] = sortedClusters.map((cluster, idx) => {
    const count = cluster.members.length;
    const percentage = Math.round((count / totalConversations) * 100);
    const confidence = calculateConfidence(cluster.distances, count, totalConversations);

    return {
      cluster_id: String.fromCharCode(65 + idx), // A, B, C, D
      label: labels[idx].label,
      quote: labels[idx].quote,
      description: labels[idx].description,
      count,
      percentage,
      confidence,
      prevalence: getPrevalence(percentage),
      members: cluster.members.map(m => ({
        conversation_id: m.id,
        participant_name: m.participant_name,
        quotes: m.quotes || [],
      })),
    };
  });

  return {
    dimension,
    dimension_rationale: rationale,
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
