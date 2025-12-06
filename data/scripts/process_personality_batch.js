const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Initialize clients
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

if (!openaiKey) {
  console.error('Missing OPENAI_API_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

// Question indices for each trait (0-indexed)
// Based on BFPT scoring: some questions are reverse-scored (marked with isReverse)
const TRAIT_QUESTIONS = {
  extroversion: [
    { index: 0, isReverse: false },   // Q1: Am the life of the party
    { index: 5, isReverse: true },    // Q6: Don't talk a lot
    { index: 10, isReverse: false },  // Q11: Feel comfortable around people
    { index: 15, isReverse: true },   // Q16: Keep in the background
    { index: 20, isReverse: false },  // Q21: Start conversations
    { index: 25, isReverse: true },   // Q26: Have little to say
    { index: 30, isReverse: false },  // Q31: Talk to different people at parties
    { index: 35, isReverse: true },   // Q36: Don't like to draw attention
    { index: 40, isReverse: false },  // Q41: Don't mind being center of attention
    { index: 45, isReverse: true }    // Q46: Am quiet around strangers
  ],
  agreeableness: [
    { index: 1, isReverse: true },    // Q2: Feel little concern for others
    { index: 6, isReverse: false },   // Q7: Am interested in people
    { index: 11, isReverse: true },   // Q12: Insult people
    { index: 16, isReverse: false },  // Q17: Sympathize with others' feelings
    { index: 21, isReverse: true },   // Q22: Not interested in others' problems
    { index: 26, isReverse: false },  // Q27: Have a soft heart
    { index: 31, isReverse: true },   // Q32: Am not really interested in others
    { index: 36, isReverse: false },  // Q37: Take time out for others
    { index: 41, isReverse: false },  // Q42: Feel others' emotions
    { index: 46, isReverse: false }   // Q47: Make people feel at ease
  ],
  conscientiousness: [
    { index: 2, isReverse: false },   // Q3: Am always prepared
    { index: 7, isReverse: true },    // Q8: Leave my belongings around
    { index: 12, isReverse: false },  // Q13: Pay attention to details
    { index: 17, isReverse: true },   // Q18: Make a mess of things
    { index: 22, isReverse: false },  // Q23: Get chores done right away
    { index: 27, isReverse: true },   // Q28: Often forget to put things back
    { index: 32, isReverse: false },  // Q33: Like order
    { index: 37, isReverse: true },   // Q38: Shirk my duties
    { index: 42, isReverse: false },  // Q43: Follow a schedule
    { index: 47, isReverse: false }   // Q48: Am exacting in my work
  ],
  neuroticism: [
    { index: 3, isReverse: false },   // Q4: Get stressed out easily
    { index: 8, isReverse: true },    // Q9: Am relaxed most of the time
    { index: 13, isReverse: false },  // Q14: Worry about things
    { index: 18, isReverse: true },   // Q19: Seldom feel blue
    { index: 23, isReverse: false },  // Q24: Am easily disturbed
    { index: 28, isReverse: false },  // Q29: Get upset easily
    { index: 33, isReverse: false },  // Q34: Change my mood a lot
    { index: 38, isReverse: false },  // Q39: Have frequent mood swings
    { index: 43, isReverse: false },  // Q44: Get irritated easily
    { index: 48, isReverse: false }   // Q49: Often feel blue
  ],
  openness: [
    { index: 4, isReverse: false },   // Q5: Have a rich vocabulary
    { index: 9, isReverse: true },    // Q10: Have difficulty understanding abstract ideas
    { index: 14, isReverse: false },  // Q15: Have a vivid imagination
    { index: 19, isReverse: true },   // Q20: Am not interested in abstract ideas
    { index: 24, isReverse: false },  // Q25: Have excellent ideas
    { index: 29, isReverse: true },   // Q30: Do not have a good imagination
    { index: 34, isReverse: false },  // Q35: Am quick to understand things
    { index: 39, isReverse: false },  // Q40: Use difficult words
    { index: 44, isReverse: false },  // Q45: Spend time reflecting on things
    { index: 49, isReverse: false }   // Q50: Am full of ideas
  ]
};

// Polar opposite anchor texts for dimensional projection
const TRAIT_ANCHORS = {
  extroversion: {
    high: "I am extremely outgoing and social. I love being the center of attention at parties and gatherings. I thrive on social interaction, start conversations easily with strangers, and feel energized by being around large groups of people. I talk a lot and enjoy drawing attention to myself.",
    low: "I am very introverted and reserved. I prefer solitude and small, intimate gatherings over large parties. I feel drained by extensive social interaction, rarely start conversations with strangers, and prefer to stay in the background. I am quiet and don't like drawing attention to myself."
  },
  agreeableness: {
    high: "I am extremely compassionate and cooperative. I always put others' needs before my own, sympathize deeply with others' feelings, and go out of my way to help people. I avoid conflict, have a very soft heart, and am deeply interested in other people's problems and wellbeing.",
    low: "I am very direct and competitive. I prioritize my own needs, don't get emotionally involved in others' problems, and speak my mind regardless of how others might feel. I'm not particularly interested in others' feelings and can be critical or dismissive of people."
  },
  conscientiousness: {
    high: "I am extremely organized and disciplined. I always plan ahead, keep everything in perfect order, pay meticulous attention to details, and complete all tasks immediately. I follow schedules religiously, never procrastinate, and take my responsibilities very seriously.",
    low: "I am very spontaneous and flexible. I often leave things messy, forget to put things back, and procrastinate on chores. I don't follow strict schedules, sometimes shirk responsibilities, and prefer to go with the flow rather than plan meticulously."
  },
  neuroticism: {
    high: "I am extremely emotionally reactive and sensitive. I get stressed out easily, worry constantly about things, and experience frequent mood swings. I get upset and irritated easily, often feel blue or anxious, and am easily disturbed by changes or problems.",
    low: "I am extremely emotionally stable and calm. I rarely get stressed, almost never worry, and maintain a consistent mood. I'm very relaxed, seldom feel blue or anxious, and handle problems and changes with equanimity. Very little disturbs my peace of mind."
  },
  openness: {
    high: "I am extremely creative and intellectually curious. I have a vivid imagination, love abstract ideas and philosophical discussions, and am constantly generating new ideas. I have a rich vocabulary, enjoy learning complex concepts, and spend a lot of time reflecting on things.",
    low: "I am very practical and conventional. I prefer concrete, straightforward ideas over abstract concepts. I don't spend much time on imagination or philosophical thinking, prefer routine over novelty, and focus on practical, down-to-earth matters rather than theoretical ideas."
  }
};

// Embed text using OpenAI's embedding model
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });
  return response.data[0].embedding;
}

// Batch embed multiple texts
async function batchEmbed(texts) {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts
  });
  return response.data.map(d => d.embedding);
}

// Calculate dot product of two vectors
function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

// Calculate vector magnitude
function magnitude(v) {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

// Subtract two vectors
function subtractVectors(a, b) {
  return a.map((val, i) => val - b[i]);
}

// Project vector onto axis and return scalar projection
function projectOntoAxis(vector, axis) {
  return dotProduct(vector, axis) / magnitude(axis);
}

// Calculate average of projections for a trait
function calculateTraitAverage(projections) {
  return projections.reduce((a, b) => a + b, 0) / projections.length;
}

// Normalize score to 0-5 range using actual observed min/max (rounded to 2 decimal places)
function normalizeScore(avgProjection, minObserved, maxObserved) {
  // Avoid division by zero
  if (maxObserved === minObserved) return 2.5;

  // Normalize to 0-5 based on observed range
  const normalized = ((avgProjection - minObserved) / (maxObserved - minObserved)) * 5;
  return Math.round(Math.max(0, Math.min(5, normalized)) * 100) / 100; // Round to 2 decimal places
}

async function processPersonalityBatch() {
  // Read batch status
  const statusPath = path.join(__dirname, 'personality_batch_status.json');

  if (!fs.existsSync(statusPath)) {
    console.error('personality_batch_status.json not found. Run create_personality_batch.js first.');
    process.exit(1);
  }

  const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  console.log(`Batch ID: ${statusData.batch_id}`);
  console.log(`Total requests: ${statusData.total_requests}\n`);

  // Check batch status
  console.log('Checking batch status...');
  const batch = await openai.batches.retrieve(statusData.batch_id);

  console.log(`Status: ${batch.status}`);
  console.log(`Completed: ${batch.request_counts?.completed || 0}/${batch.request_counts?.total || 0}`);
  console.log(`Failed: ${batch.request_counts?.failed || 0}`);

  if (batch.status === 'in_progress' || batch.status === 'validating' || batch.status === 'finalizing') {
    console.log('\nBatch is still processing. Please wait and try again later.');
    console.log(`Progress: ${Math.round((batch.request_counts?.completed / batch.request_counts?.total) * 100)}%`);
    process.exit(0);
  }

  if (batch.status === 'failed') {
    console.error('\nBatch failed!');
    if (batch.errors) {
      console.error('Errors:', JSON.stringify(batch.errors, null, 2));
    }
    process.exit(1);
  }

  if (batch.status === 'expired') {
    console.error('\nBatch expired before completion.');
    process.exit(1);
  }

  if (batch.status !== 'completed') {
    console.log(`\nUnexpected status: ${batch.status}`);
    process.exit(1);
  }

  // Batch completed - download results
  console.log('\nBatch completed! Downloading results...');

  if (!batch.output_file_id) {
    console.error('No output file ID found');
    process.exit(1);
  }

  // Download the output file
  const fileResponse = await openai.files.content(batch.output_file_id);
  const outputContent = await fileResponse.text();

  // Save raw output for debugging
  const outputPath = path.join(__dirname, 'personality_batch_output.jsonl');
  fs.writeFileSync(outputPath, outputContent);
  console.log(`Raw output saved to: ${outputPath}\n`);

  // Parse results
  const results = outputContent.trim().split('\n').map(line => JSON.parse(line));
  console.log(`Processing ${results.length} results...\n`);

  // First, embed all trait anchors
  console.log('Embedding trait anchors...');
  const traitAxes = {};
  for (const [trait, anchors] of Object.entries(TRAIT_ANCHORS)) {
    const [highEmbed, lowEmbed] = await batchEmbed([anchors.high, anchors.low]);
    traitAxes[trait] = subtractVectors(highEmbed, lowEmbed);
  }
  console.log('Trait axes created.\n');

  // ============================================
  // PASS 1: Collect all projections to find range
  // ============================================
  console.log('=== PASS 1: Calculating projections for all interviews ===\n');

  const allInterviewData = []; // Store parsed data for pass 2
  const traitProjections = {
    extroversion: [],
    agreeableness: [],
    conscientiousness: [],
    neuroticism: [],
    openness: []
  };

  let pass1Errors = 0;

  for (const result of results) {
    const interviewId = result.custom_id;

    if (result.error) {
      console.error(`Error for interview ${interviewId}:`, result.error);
      pass1Errors++;
      continue;
    }

    try {
      // Parse the GPT response
      const gptResponse = result.response.body.choices[0].message.content;
      const personalityData = JSON.parse(gptResponse);

      if (!personalityData.responses || personalityData.responses.length !== 50) {
        console.error(`Invalid response format for ${interviewId}: expected 50 responses, got ${personalityData.responses?.length || 0}`);
        pass1Errors++;
        continue;
      }

      // Extract response texts
      const responseTexts = personalityData.responses.map(r => r.response);

      // Embed all 50 responses
      console.log(`[Pass 1] Embedding responses for ${interviewId}...`);
      const responseEmbeddings = await batchEmbed(responseTexts);

      // Calculate raw projections for each trait
      const rawProjections = {};
      for (const [trait, questions] of Object.entries(TRAIT_QUESTIONS)) {
        const projections = [];

        for (const { index, isReverse } of questions) {
          const embedding = responseEmbeddings[index];
          let projection = projectOntoAxis(embedding, traitAxes[trait]);

          // Reverse the projection for reverse-scored items
          if (isReverse) {
            projection = -projection;
          }

          projections.push(projection);
        }

        const avgProjection = calculateTraitAverage(projections);
        rawProjections[trait] = avgProjection;
        traitProjections[trait].push(avgProjection);
      }

      // Store for pass 2
      allInterviewData.push({
        interviewId,
        personalityData,
        rawProjections
      });

    } catch (err) {
      console.error(`Error processing interview ${interviewId}:`, err.message);
      pass1Errors++;
    }
  }

  console.log(`\n[Pass 1] Complete. Processed ${allInterviewData.length} interviews, ${pass1Errors} errors.\n`);

  // Calculate observed min/max for each trait
  const traitRanges = {};
  console.log('=== Observed Projection Ranges ===');
  for (const [trait, projections] of Object.entries(traitProjections)) {
    const min = Math.min(...projections);
    const max = Math.max(...projections);
    traitRanges[trait] = { min, max };
    console.log(`${trait}: min=${min.toFixed(4)}, max=${max.toFixed(4)}, range=${(max - min).toFixed(4)}`);
  }
  console.log('');

  // ============================================
  // PASS 2: Normalize scores and update Supabase
  // ============================================
  console.log('=== PASS 2: Normalizing scores and updating Supabase ===\n');

  let successCount = 0;
  let errorCount = 0;

  for (const { interviewId, personalityData, rawProjections } of allInterviewData) {
    try {
      // Normalize scores using observed ranges
      const scores = {};
      for (const [trait, avgProjection] of Object.entries(rawProjections)) {
        const { min, max } = traitRanges[trait];
        scores[trait] = normalizeScore(avgProjection, min, max);
      }

      // Fetch interview name for logging
      const { data: interview } = await supabase
        .from('interviews')
        .select('name')
        .eq('id', interviewId)
        .single();

      // Build personality object to store
      const personalityObj = {
        responses: personalityData.responses,
        rawProjections: rawProjections,
        scores: scores,
        generated_at: new Date().toISOString()
      };

      // Update Supabase
      const { error: updateError } = await supabase
        .from('interviews')
        .update({
          personality: personalityObj,
          updated_at: new Date().toISOString()
        })
        .eq('id', interviewId);

      if (updateError) {
        console.error(`Failed to update interview ${interviewId}:`, updateError.message);
        errorCount++;
        continue;
      }

      console.log(`✓ ${interview?.name || interviewId}: E=${scores.extroversion} A=${scores.agreeableness} C=${scores.conscientiousness} N=${scores.neuroticism} O=${scores.openness}`);
      successCount++;

    } catch (err) {
      console.error(`Error updating interview ${interviewId}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Processing complete!`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
  console.log(`========================================`);

  // Update status file
  statusData.processed_at = new Date().toISOString();
  statusData.success_count = successCount;
  statusData.error_count = errorCount;
  statusData.trait_ranges = traitRanges;
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
}

// Run the script
processPersonalityBatch().catch(console.error);
