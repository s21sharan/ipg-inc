const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Directory containing interview transcripts
const TRANSCRIPTS_DIR = path.join(__dirname, '..', 'transcripts');
const OUTPUT_FILE = path.join(__dirname, '..', 'clusters.json');

// Number of clusters to create
const NUM_CLUSTERS = 5;

// Questions to extract for clustering (focus on pain points/frustrations)
const KEY_QUESTIONS = [
  'Most frustrating part?',
  'Most frustrating part of PRODUCT overall?',
  'One thing you\'d change about PRODUCT?',
  'Worst-case scenario in this space?',
  'What do you want to be different?',
];

async function loadTranscripts() {
  const files = fs.readdirSync(TRANSCRIPTS_DIR).filter(f => f.endsWith('.json'));
  const transcripts = [];

  for (const file of files) {
    const filePath = path.join(TRANSCRIPTS_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    // Extract key answers for clustering
    const keyAnswers = [];
    for (const item of data.interview_script || []) {
      if (KEY_QUESTIONS.some(q => item.question?.includes(q.replace('?', '')))) {
        keyAnswers.push(item.answer);
      }
    }

    // Combine summary and key answers for embedding
    const textForEmbedding = [
      data.summary,
      ...keyAnswers,
    ].filter(Boolean).join('\n\n');

    transcripts.push({
      user_name: data.user_name,
      summary: data.summary,
      top_quotes: data.top_quotes,
      textForEmbedding,
      file: file,
    });
  }

  console.log(`Loaded ${transcripts.length} transcripts`);
  return transcripts;
}

async function generateEmbeddings(transcripts) {
  console.log('Generating embeddings...');

  const embeddings = [];

  // Process in batches to avoid rate limits
  const batchSize = 20;
  for (let i = 0; i < transcripts.length; i += batchSize) {
    const batch = transcripts.slice(i, i + batchSize);
    const texts = batch.map(t => t.textForEmbedding);

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });

    for (let j = 0; j < response.data.length; j++) {
      embeddings.push(response.data[j].embedding);
    }

    console.log(`  Processed ${Math.min(i + batchSize, transcripts.length)}/${transcripts.length}`);
  }

  return embeddings;
}

// K-means clustering implementation
function kMeans(embeddings, k, maxIterations = 100) {
  const n = embeddings.length;
  const dim = embeddings[0].length;

  // Initialize centroids randomly
  const centroidIndices = [];
  while (centroidIndices.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!centroidIndices.includes(idx)) {
      centroidIndices.push(idx);
    }
  }
  let centroids = centroidIndices.map(i => [...embeddings[i]]);

  let assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    // Assign points to nearest centroid
    const newAssignments = embeddings.map(emb => {
      let minDist = Infinity;
      let minIdx = 0;
      for (let c = 0; c < k; c++) {
        const dist = euclideanDistance(emb, centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          minIdx = c;
        }
      }
      return minIdx;
    });

    // Check for convergence
    if (newAssignments.every((a, i) => a === assignments[i])) {
      console.log(`  K-means converged after ${iter + 1} iterations`);
      break;
    }
    assignments = newAssignments;

    // Update centroids
    for (let c = 0; c < k; c++) {
      const clusterPoints = embeddings.filter((_, i) => assignments[i] === c);
      if (clusterPoints.length > 0) {
        centroids[c] = new Array(dim).fill(0);
        for (const point of clusterPoints) {
          for (let d = 0; d < dim; d++) {
            centroids[c][d] += point[d] / clusterPoints.length;
          }
        }
      }
    }
  }

  return assignments;
}

function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

async function generateClusterLabels(clusters, transcripts) {
  console.log('Generating cluster labels and quotes...');

  const results = [];

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];

    // Get summaries and quotes from this cluster
    const summaries = cluster.members.map(m => {
      const t = transcripts.find(t => t.user_name === m.user_name);
      return `${t.user_name}: ${t.summary}`;
    }).join('\n');

    const prompt = `Analyze these user interview summaries from the same cluster. They share a common frustration.

User summaries:
${summaries}

Respond with EXACTLY this JSON format (no other text):
{
  "label": "short label 2-4 words",
  "quote": "short quote 5-6 words max"
}

The label should identify the pain point (e.g., "lacks depth", "too expensive").
The quote should be what these users would say in first person, like they're complaining (e.g., "it doesn't go deep enough", "I can't afford this").

JSON:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0.3,
    });

    try {
      const content = response.choices[0].message.content.trim();
      const parsed = JSON.parse(content);
      results.push({
        label: parsed.label.toLowerCase().replace(/['"]/g, ''),
        quote: parsed.quote.replace(/['"]/g, ''),
      });
      console.log(`  Cluster ${i + 1}: "${parsed.label}" - "${parsed.quote}" (${cluster.members.length} users)`);
    } catch (e) {
      // Fallback if JSON parsing fails
      const label = response.choices[0].message.content.trim().toLowerCase().replace(/['"]/g, '');
      results.push({ label, quote: label });
      console.log(`  Cluster ${i + 1}: "${label}" (${cluster.members.length} users)`);
    }
  }

  return results;
}

async function main() {
  try {
    // Load transcripts
    const transcripts = await loadTranscripts();

    // Generate embeddings
    const embeddings = await generateEmbeddings(transcripts);

    // Cluster embeddings
    console.log(`Clustering into ${NUM_CLUSTERS} groups...`);
    const assignments = kMeans(embeddings, NUM_CLUSTERS);

    // Group transcripts by cluster
    const clusters = [];
    for (let i = 0; i < NUM_CLUSTERS; i++) {
      const members = transcripts
        .filter((_, idx) => assignments[idx] === i)
        .map(t => ({
          user_name: t.user_name,
          summary: t.summary,
          top_quotes: t.top_quotes,
        }));

      clusters.push({
        cluster_id: i,
        members,
        count: members.length,
        percentage: Math.round((members.length / transcripts.length) * 100),
      });
    }

    // Sort clusters by size (largest first)
    clusters.sort((a, b) => b.count - a.count);

    // Reassign cluster IDs after sorting
    clusters.forEach((c, i) => {
      c.cluster_id = i;
    });

    // Generate labels and quotes for each cluster
    const labelResults = await generateClusterLabels(clusters, transcripts);

    // Add labels and quotes to clusters
    clusters.forEach((cluster, i) => {
      cluster.label = labelResults[i].label;
      cluster.quote = labelResults[i].quote;
    });

    // Create output
    const output = {
      total_users: transcripts.length,
      num_clusters: NUM_CLUSTERS,
      generated_at: new Date().toISOString(),
      clusters: clusters.map(c => ({
        group: String.fromCharCode(65 + c.cluster_id), // A, B, C, D, E
        label: c.label,
        quote: c.quote,
        count: c.count,
        percentage: c.percentage,
        members: c.members,
      })),
    };

    // Save results
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to ${OUTPUT_FILE}`);

    // Print summary
    console.log('\n=== Clustering Results ===');
    console.log(`Total users: ${output.total_users}\n`);
    for (const cluster of output.clusters) {
      console.log(`Group ${cluster.group} (${cluster.percentage}%): "${cluster.label}"`);
      console.log(`  Quote: "${cluster.quote}"`);
      console.log(`  ${cluster.count} users: ${cluster.members.map(m => m.user_name).join(', ')}`);
      console.log();
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
