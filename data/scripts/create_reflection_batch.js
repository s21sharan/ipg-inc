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

const REFLECTION_PROMPT = `You are analyzing an interview transcript to extract structured insights for future reference.

Given the interview transcript below, extract and synthesize the following information into a structured JSON format. Be thorough but concise. Extract ONLY information that is explicitly stated or clearly implied in the transcript.

Required JSON structure:
{
  "basic_facts": {
    "age": number or null,
    "location": string or null,
    "occupation": string or null,
    "education": string or null,
    "relationship_status": string or null,
    "other_demographics": {}
  },
  "personality_and_lifestyle": {
    "traits": [],
    "habits": [],
    "interests": [],
    "tech_savviness": string or null,
    "communication_style": string or null
  },
  "goals_and_motivations": {
    "primary_goals": [],
    "motivations": [],
    "values": [],
    "aspirations": []
  },
  "pain_points_and_frustrations": {
    "current_problems": [],
    "recurring_frustrations": [],
    "unmet_needs": [],
    "workarounds": []
  },
  "product_attitudes": {
    "current_products": [],
    "likes": [],
    "dislikes": [],
    "feature_preferences": [],
    "pricing_sensitivity": string or null,
    "switching_barriers": []
  },
  "open_questions": {
    "topics_to_explore": [],
    "contradictions": [],
    "hypotheses": []
  }
}

Important guidelines:
- Use null for missing information, don't guess or infer beyond what's clearly stated
- Keep bullet points concise (1-2 sentences max)
- Include specific quotes when they're particularly revealing
- Focus on actionable insights, not just data collection
- If a section has no relevant information, use empty arrays/objects
- For traits and patterns, provide brief supporting evidence from the transcript

Return ONLY the JSON object, no additional text.`;

async function createReflectionBatch() {
  console.log('Fetching interviews without reflection memory...\n');

  // Fetch all interviews that don't have reflection_memory yet
  const { data: interviews, error: fetchError } = await supabase
    .from('interviews')
    .select('id, name, transcript, age, gender, race, hometown, occupation, country, learning_language, learning_goal')
    .is('reflection_memory', null)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('Error fetching interviews:', fetchError.message);
    process.exit(1);
  }

  if (!interviews || interviews.length === 0) {
    console.log('No interviews found without reflection memory.');
    process.exit(0);
  }

  console.log(`Found ${interviews.length} interviews to process.\n`);

  // Create batch requests
  const batchRequests = interviews.map(interview => {
    // Format transcript for GPT
    const formattedTranscript = interview.transcript
      .filter(item => !item.is_followup) // Only use main interview for reflection
      .map(item => `Q: ${item.question}\nA: ${item.answer}`)
      .join('\n\n');

    // Prepare demographics context
    const demographics = {
      age: interview.age,
      gender: interview.gender,
      race: interview.race,
      hometown: interview.hometown,
      occupation: interview.occupation,
      country: interview.country,
      learning_language: interview.learning_language,
      learning_goal: interview.learning_goal
    };

    const fullPrompt = `${REFLECTION_PROMPT}\n\nTRANSCRIPT:\n${formattedTranscript}\n\nDEMOGRAPHICS (for context):\n${JSON.stringify(demographics, null, 2)}`;

    return {
      custom_id: interview.id,
      method: 'POST',
      url: '/v1/chat/completions',
      body: {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert qualitative researcher specializing in user interviews and insight extraction.'
          },
          {
            role: 'user',
            content: fullPrompt
          }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }
    };
  });

  // Write batch file
  const batchFilePath = path.join(__dirname, 'reflection_batch_input.jsonl');
  const batchContent = batchRequests.map(req => JSON.stringify(req)).join('\n');
  fs.writeFileSync(batchFilePath, batchContent);

  console.log(`Created batch file with ${batchRequests.length} requests`);
  console.log(`File: ${batchFilePath}\n`);

  // Upload batch file to OpenAI
  console.log('Uploading batch file to OpenAI...');
  const fileUpload = await openai.files.create({
    file: fs.createReadStream(batchFilePath),
    purpose: 'batch'
  });

  console.log(`File uploaded: ${fileUpload.id}\n`);

  // Create batch job
  console.log('Creating batch job...');
  const batch = await openai.batches.create({
    input_file_id: fileUpload.id,
    endpoint: '/v1/chat/completions',
    completion_window: '24h',
    metadata: {
      description: 'Extract reflection memory from interview transcripts'
    }
  });

  console.log(`\n========================================`);
  console.log(`Batch created successfully!`);
  console.log(`Batch ID: ${batch.id}`);
  console.log(`Status: ${batch.status}`);
  console.log(`Total requests: ${batchRequests.length}`);
  console.log(`========================================\n`);

  // Save batch info for later processing
  const statusData = {
    batch_id: batch.id,
    created_at: new Date().toISOString(),
    total_requests: batchRequests.length,
    interview_ids: interviews.map(i => i.id)
  };

  const statusPath = path.join(__dirname, 'reflection_batch_status.json');
  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));

  console.log(`Batch status saved to: ${statusPath}`);
  console.log(`\nTo check status and process results, run:`);
  console.log(`node demo/scripts/process_reflection_batch.js`);
}

// Run the script
createReflectionBatch().catch(console.error);
