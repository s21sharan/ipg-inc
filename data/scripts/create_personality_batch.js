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

// Fixed Duolingo Demo workspace UUID
const DUOLINGO_DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

// The 50 Big Five Personality Test questions
const BFPT_QUESTIONS = [
  "Am the life of the party.",
  "Feel little concern for others.",
  "Am always prepared.",
  "Get stressed out easily.",
  "Have a rich vocabulary.",
  "Don't talk a lot.",
  "Am interested in people.",
  "Leave my belongings around.",
  "Am relaxed most of the time.",
  "Have difficulty understanding abstract ideas.",
  "Feel comfortable around people.",
  "Insult people.",
  "Pay attention to details.",
  "Worry about things.",
  "Have a vivid imagination.",
  "Keep in the background.",
  "Sympathize with others' feelings.",
  "Make a mess of things.",
  "Seldom feel blue.",
  "Am not interested in abstract ideas.",
  "Start conversations.",
  "Am not interested in other people's problems.",
  "Get chores done right away.",
  "Am easily disturbed.",
  "Have excellent ideas.",
  "Have little to say.",
  "Have a soft heart.",
  "Often forget to put things back in their proper place.",
  "Get upset easily.",
  "Do not have a good imagination.",
  "Talk to a lot of different people at parties.",
  "Am not really interested in others.",
  "Like order.",
  "Change my mood a lot.",
  "Am quick to understand things.",
  "Don't like to draw attention to myself.",
  "Take time out for others.",
  "Shirk my duties.",
  "Have frequent mood swings.",
  "Use difficult words.",
  "Don't mind being the center of attention.",
  "Feel others' emotions.",
  "Follow a schedule.",
  "Get irritated easily.",
  "Spend time reflecting on things.",
  "Am quiet around strangers.",
  "Make people feel at ease.",
  "Am exacting in my work.",
  "Often feel blue.",
  "Am full of ideas."
];

// System prompt for generating personality responses
const SYSTEM_PROMPT = `You are an expert psychologist analyzing interview transcripts to assess personality traits. Your task is to answer the Big Five Personality Test (BFPT) questions AS IF you were the interviewee, based on evidence from their interview.

You will receive:
1. The full interview transcript
2. Metadata about the person
3. A list of 50 personality statements to respond to

For EACH statement, write a 1-2 sentence response explaining how this person would relate to that statement, based on specific evidence from their interview. Be concrete and reference actual things they said or attitudes they displayed.

CRITICAL RULES:
- Base responses ONLY on evidence from the transcript - don't assume or generalize
- Write in third person (e.g., "Based on the interview, they seem to..." or "They mentioned that...")
- Be specific - cite actual quotes or behaviors when possible
- If there's no clear evidence for a statement, say "No clear evidence in the interview"
- Keep each response to 1-2 sentences maximum

Return a JSON object with this structure:
{
  "responses": [
    {
      "question_index": 0,
      "statement": "Am the life of the party.",
      "response": "Based on their mention of preferring small group conversations over large gatherings, they likely would not identify as the life of the party."
    },
    ...
  ]
}`;

async function createPersonalityBatch() {
  console.log('Fetching interviews from Supabase...\n');

  // Fetch all interviews from Duolingo Demo workspace
  const { data: interviews, error } = await supabase
    .from('interviews')
    .select('*')
    .eq('workspace_id', DUOLINGO_DEMO_WORKSPACE_ID);

  if (error) {
    console.error('Error fetching interviews:', error.message);
    process.exit(1);
  }

  console.log(`Found ${interviews.length} interviews\n`);

  // Create batch requests
  const batchRequests = [];

  for (const interview of interviews) {
    // Build user prompt with full context
    const userPrompt = buildUserPrompt(interview);

    // Create batch request object
    const request = {
      custom_id: interview.id, // Use interview ID as custom_id for matching results
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 8000,
        response_format: { type: "json_object" }
      }
    };

    batchRequests.push(request);
  }

  // Write batch input file
  const batchInputPath = path.join(__dirname, 'personality_batch_input.jsonl');
  const jsonlContent = batchRequests.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(batchInputPath, jsonlContent);
  console.log(`Created batch input file: ${batchInputPath}`);
  console.log(`Total requests: ${batchRequests.length}\n`);

  // Upload file to OpenAI
  console.log('Uploading batch file to OpenAI...');
  const file = await openai.files.create({
    file: fs.createReadStream(batchInputPath),
    purpose: 'batch'
  });
  console.log(`File uploaded: ${file.id}\n`);

  // Create batch job
  console.log('Creating batch job...');
  const batch = await openai.batches.create({
    input_file_id: file.id,
    endpoint: "/v1/chat/completions",
    completion_window: "24h",
    metadata: {
      description: "Duolingo interview Big Five personality assessment"
    }
  });

  console.log(`Batch created successfully!`);
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Status: ${batch.status}`);
  console.log(`Created at: ${new Date(batch.created_at * 1000).toISOString()}\n`);

  // Save batch status to file
  const statusPath = path.join(__dirname, 'personality_batch_status.json');
  const statusData = {
    batch_id: batch.id,
    input_file_id: file.id,
    status: batch.status,
    created_at: new Date(batch.created_at * 1000).toISOString(),
    total_requests: batchRequests.length,
    interview_ids: interviews.map(i => i.id)
  };
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
  console.log(`Batch status saved to: ${statusPath}`);
  console.log('\nNext steps:');
  console.log('1. Wait for batch to complete (up to 24 hours)');
  console.log('2. Run: node demo/scripts/process_personality_batch.js');
}

function buildUserPrompt(interview) {
  // Format transcript for context
  const transcriptText = interview.transcript
    .map((item, idx) => {
      const prefix = item.is_followup ? '  [Follow-up] ' : `[Q${idx}] `;
      return `${prefix}${item.question}\n${item.is_followup ? '  [A] ' : `[A${idx}] `}${item.answer}`;
    })
    .join('\n\n');

  // Format metadata
  const metadata = {
    name: interview.name,
    age: interview.age,
    gender: interview.gender,
    country: interview.country,
    occupation: interview.occupation,
    learning_language: interview.learning_language,
    learning_goal: interview.learning_goal,
    usage_frequency: interview.usage_frequency,
    is_premium_user: interview.is_premium_user
  };

  // Format the 50 questions
  const questionsText = BFPT_QUESTIONS
    .map((q, idx) => `${idx + 1}. "I ${q.charAt(0).toLowerCase()}${q.slice(1)}"`)
    .join('\n');

  return `## INTERVIEWEE METADATA
${JSON.stringify(metadata, null, 2)}

## INTERVIEW SUMMARY
${interview.summary || 'No summary available'}

## TOP QUOTES
${(interview.top_quotes || []).map((q, i) => `${i + 1}. "${q}"`).join('\n')}

## FULL INTERVIEW TRANSCRIPT
${transcriptText}

---

## BIG FIVE PERSONALITY TEST STATEMENTS

For each of the following 50 statements, write a 1-2 sentence response explaining how ${interview.name} would relate to it based on their interview:

${questionsText}

---

Analyze the interview and respond to all 50 statements. Return your analysis as JSON.`;
}

// Run the script
createPersonalityBatch().catch(console.error);
