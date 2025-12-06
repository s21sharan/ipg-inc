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

// System prompt for generating follow-up questions
const SYSTEM_PROMPT = `You are an expert qualitative researcher analyzing interview transcripts. Your task is to identify key moments in the interview worth probing deeper, generate follow-up questions, and answer them in-character as the interviewee.

You will receive:
1. The full interview transcript (51 questions and answers)
2. Metadata about the person (personality traits, pain points, what they value, sentiments)

Your task:
1. Identify 4-5 KEY MOMENTS in the interview where a follow-up question would reveal deeper insights
2. For each moment, generate 1-2 natural follow-up questions that a skilled interviewer would ask
3. Answer each follow-up question IN CHARACTER as the interviewee, matching their:
   - Speaking style from the original transcript
   - Personality traits
   - Attitudes and sentiments toward Duolingo
   - Level of detail and expressiveness

CRITICAL RULES:
- Follow-up questions should feel natural, not interrogative
- Answers should be 3-6 sentences, matching the interviewee's style
- Reference specific things they said in the original transcript
- Maintain consistency with their stated opinions and experiences
- Focus on pain points, unique experiences, or emotionally charged moments

Return a JSON object with this structure:
{
  "followups": [
    {
      "original_question_index": 15,
      "original_question": "The original question text...",
      "followup_questions": [
        {
          "question": "Your follow-up question...",
          "answer": "In-character response..."
        }
      ]
    }
  ]
}`;

async function createFollowupBatch() {
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
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 4000,
        response_format: { type: "json_object" }
      }
    };

    batchRequests.push(request);
  }

  // Write batch input file
  const batchInputPath = path.join(__dirname, 'batch_input.jsonl');
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
      description: "Duolingo interview follow-up questions"
    }
  });

  console.log(`Batch created successfully!`);
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Status: ${batch.status}`);
  console.log(`Created at: ${new Date(batch.created_at * 1000).toISOString()}\n`);

  // Save batch status to file
  const statusPath = path.join(__dirname, 'batch_status.json');
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
  console.log('2. Run: node demo/scripts/process_followup_batch.js');
}

function buildUserPrompt(interview) {
  // Format transcript for context
  const transcriptText = interview.transcript
    .map((item, idx) => `[Q${idx}] ${item.question}\n[A${idx}] ${item.answer}`)
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
    is_premium_user: interview.is_premium_user,
    personality: interview.personality || [],
    pain_points: interview.pain_points || [],
    value_props: interview.value_props || [],
    sentiments: interview.sentiments || {}
  };

  return `## INTERVIEWEE METADATA
${JSON.stringify(metadata, null, 2)}

## INTERVIEW SUMMARY
${interview.summary || 'No summary available'}

## TOP QUOTES
${(interview.top_quotes || []).map((q, i) => `${i + 1}. "${q}"`).join('\n')}

## FULL INTERVIEW TRANSCRIPT
${transcriptText}

---

Based on this interview, identify 4-5 key moments worth probing deeper. Generate 1-2 follow-up questions for each moment, and answer them in-character as ${interview.name}.`;
}

// Run the script
createFollowupBatch().catch(console.error);
