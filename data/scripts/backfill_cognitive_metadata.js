/**
 * Backfill cognitive metadata for existing conversations
 *
 * This script processes old conversations that don't have cognitive metadata
 * and uses GPT-4o-mini to extract emotional states, importance scores, entities, etc.
 *
 * Run with: node data/scripts/backfill_cognitive_metadata.js
 */

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.local') });

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

const COGNITIVE_EXTRACTION_PROMPT = `You are analyzing a Q&A exchange from an interview to extract full cognitive metadata for a Generative Agent system.

Given the question, answer, and conversation context, analyze the participant's cognitive state and return structured metadata.

You MUST return a JSON object with this exact structure:
{
  "emotional_before": {
    "curiosity": 0.0-1.0, "frustration": 0.0-1.0, "enthusiasm": 0.0-1.0, "anxiety": 0.0-1.0, "contentment": 0.0-1.0
  },
  "emotional_after": {
    "curiosity": 0.0-1.0, "frustration": 0.0-1.0, "enthusiasm": 0.0-1.0, "anxiety": 0.0-1.0, "contentment": 0.0-1.0
  },
  "emotional_trigger": "What about this question shifted their emotions",

  "importance_score": 1-10,
  "memory_type": "observation" | "reflection" | "plan",

  "entities": [
    { "id": "e1", "type": "Product|Concept|Person|Brand|Feature|Emotion", "name": "entity name" }
  ],
  "relationships": [
    { "source": "self", "relation": "FRUSTRATED_BY|LIKES|USES|WANTS|AVOIDS|CAUSED_BY", "target": "e1" }
  ],

  "reflection": {
    "insight": "A deeper realization this triggered",
    "evidence": ["what in this exchange supports the insight"],
    "importance": 1-10,
    "type": "observation|reflection|plan"
  } or null if no significant insight
}

Analyze based on:
- Word choice and tone in the answer (detect emotional shifts)
- Topics that seem personal or emotionally charged (high importance)
- Extract ALL products, concepts, people, brands mentioned as entities
- Infer relationships between the participant and entities (likes, dislikes, uses, frustrated by)
- Only include reflection if this exchange reveals something meaningful about the participant`;

/**
 * Extract cognitive metadata for a single Q&A exchange
 */
async function extractCognitiveMetadata(qa, context, participantContext = '') {
  const messages = [
    {
      role: 'system',
      content: COGNITIVE_EXTRACTION_PROMPT
    },
    {
      role: 'user',
      content: `PARTICIPANT CONTEXT:
${participantContext}

CONVERSATION SO FAR:
${context}

CURRENT EXCHANGE TO ANALYZE:
Q: ${qa.question}
A: ${qa.answer}

Extract the cognitive metadata for this exchange.`
    }
  ];

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  } catch (error) {
    console.error('Error extracting cognitive metadata:', error.message);
    return null;
  }
}

/**
 * Process a single conversation's transcript
 */
async function processConversation(conversation, interview) {
  const transcript = conversation.transcript || [];

  // Check if already has cognitive metadata
  const hasCognitive = transcript.some(qa => qa.cognitive);
  if (hasCognitive) {
    console.log(`  Skipping - already has cognitive metadata`);
    return null;
  }

  // Build participant context from interview reflection memory
  let participantContext = '';
  if (interview?.reflection_memory) {
    const rm = interview.reflection_memory;
    if (rm.basic_facts) {
      participantContext += `Demographics: ${JSON.stringify(rm.basic_facts)}\n`;
    }
    if (rm.personality_and_lifestyle?.traits) {
      participantContext += `Personality: ${rm.personality_and_lifestyle.traits.join(', ')}\n`;
    }
    if (rm.pain_points_and_frustrations?.current_problems) {
      participantContext += `Frustrations: ${rm.pain_points_and_frustrations.current_problems.join(', ')}\n`;
    }
  }

  const updatedTranscript = [];
  let contextSoFar = '';

  for (let i = 0; i < transcript.length; i++) {
    const qa = transcript[i];

    // Extract cognitive metadata
    const cognitive = await extractCognitiveMetadata(qa, contextSoFar, participantContext);

    const defaultEmotional = {
      curiosity: 0.5,
      frustration: 0.2,
      enthusiasm: 0.5,
      anxiety: 0.2,
      contentment: 0.5
    };

    updatedTranscript.push({
      ...qa,
      cognitive: cognitive || {
        emotional_before: defaultEmotional,
        emotional_after: defaultEmotional,
        emotional_trigger: 'backfill_default',
        importance_score: 5,
        memory_type: 'observation',
        entities: [],
        relationships: [],
        reflection: null
      },
      timestamp: qa.timestamp || new Date().toISOString()
    });

    // Build context for next iteration
    contextSoFar += `Q: ${qa.question}\nA: ${qa.answer}\n\n`;

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return updatedTranscript;
}

/**
 * Main backfill function
 */
async function backfillCognitiveMetadata() {
  console.log('Fetching conversations without cognitive metadata...\n');

  // Fetch all completed conversations
  const { data: conversations, error: fetchError } = await supabase
    .from('conversations')
    .select(`
      id,
      participant_name,
      transcript,
      source_interview_id,
      interviews!inner (
        id,
        name,
        reflection_memory
      )
    `)
    .eq('status', 'completed')
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('Error fetching conversations:', fetchError.message);
    process.exit(1);
  }

  // Filter to only those without cognitive metadata
  const conversationsToProcess = conversations?.filter(c => {
    const transcript = c.transcript || [];
    return transcript.length > 0 && !transcript.some(qa => qa.cognitive);
  }) || [];

  if (conversationsToProcess.length === 0) {
    console.log('No conversations found without cognitive metadata.');
    process.exit(0);
  }

  console.log(`Found ${conversationsToProcess.length} conversations to process.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < conversationsToProcess.length; i++) {
    const conversation = conversationsToProcess[i];
    const interview = conversation.interviews;

    console.log(`[${i + 1}/${conversationsToProcess.length}] Processing: ${conversation.participant_name}...`);
    console.log(`  ${conversation.transcript.length} Q&A pairs to analyze`);

    try {
      const updatedTranscript = await processConversation(conversation, interview);

      if (!updatedTranscript) {
        continue;
      }

      // Update Supabase
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          transcript: updatedTranscript,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id);

      if (updateError) {
        console.error(`  Error updating: ${updateError.message}`);
        errorCount++;
        continue;
      }

      console.log(`  Cognitive metadata extracted and saved`);
      successCount++;

    } catch (error) {
      console.error(`  Error: ${error.message}`);
      errorCount++;
    }
  }

  console.log(`\n========================================`);
  console.log(`Backfill complete!`);
  console.log(`Successful: ${successCount}`);
  console.log(`Failed: ${errorCount}`);
  console.log(`========================================`);
}

// Run the script
backfillCognitiveMetadata().catch(console.error);
