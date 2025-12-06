const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

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
    "other_demographics": {} // any other relevant demographic info
  },
  "personality_and_lifestyle": {
    "traits": [], // list of observable personality traits with brief evidence
    "habits": [], // daily routines, behaviors, patterns
    "interests": [], // hobbies, passions, preferences
    "tech_savviness": string or null, // their relationship with technology
    "communication_style": string or null // how they express themselves
  },
  "goals_and_motivations": {
    "primary_goals": [], // what they're trying to achieve
    "motivations": [], // why they do what they do
    "values": [], // what matters most to them
    "aspirations": [] // future hopes and dreams
  },
  "pain_points_and_frustrations": {
    "current_problems": [], // active pain points they're experiencing
    "recurring_frustrations": [], // patterns of dissatisfaction
    "unmet_needs": [], // gaps in their current solutions
    "workarounds": [] // how they currently cope with problems
  },
  "product_attitudes": {
    "current_products": [], // products/services they currently use
    "likes": [], // what they appreciate in products
    "dislikes": [], // what they avoid or dislike
    "feature_preferences": [], // specific features they value or want
    "pricing_sensitivity": string or null, // their attitude toward pricing
    "switching_barriers": [] // what prevents them from changing products
  },
  "open_questions": {
    "topics_to_explore": [], // areas that need more investigation
    "contradictions": [], // any inconsistencies to clarify
    "hypotheses": [] // assumptions to test in future conversations
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

async function extractReflectionMemory(transcript, demographics = {}) {
  // Format transcript for GPT
  const formattedTranscript = transcript
    .filter(item => !item.is_followup) // Only use main interview for reflection (followups are supplementary)
    .map(item => `Q: ${item.question}\nA: ${item.answer}`)
    .join('\n\n');

  const fullPrompt = `${REFLECTION_PROMPT}\n\nTRANSCRIPT:\n${formattedTranscript}\n\nDEMOGRAPHICS (for context):\n${JSON.stringify(demographics, null, 2)}`;

  try {
    const response = await openai.chat.completions.create({
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
      temperature: 0.3, // Lower temperature for more consistent extraction
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    return JSON.parse(content);
  } catch (error) {
    console.error('Error calling OpenAI:', error.message);
    throw error;
  }
}

async function processInterviews() {
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

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < interviews.length; i++) {
    const interview = interviews[i];
    console.log(`[${i + 1}/${interviews.length}] Processing: ${interview.name}...`);

    try {
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

      // Extract reflection memory
      const reflectionMemory = await extractReflectionMemory(
        interview.transcript,
        demographics
      );

      // Add metadata
      reflectionMemory.extracted_at = new Date().toISOString();
      reflectionMemory.model = 'gpt-4o-mini';

      // Update Supabase
      const { error: updateError } = await supabase
        .from('interviews')
        .update({
          reflection_memory: reflectionMemory,
          updated_at: new Date().toISOString()
        })
        .eq('id', interview.id);

      if (updateError) {
        console.error(`  ✗ Failed to update: ${updateError.message}`);
        errorCount++;
        continue;
      }

      console.log(`  ✓ Reflection memory extracted and saved`);
      successCount++;

      // Rate limiting: wait 500ms between requests to avoid hitting OpenAI limits
      if (i < interviews.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      console.error(`  ✗ Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Processing complete!`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
  console.log(`========================================`);
}

// Run the script
processInterviews().catch(console.error);
