const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
require('dotenv').config({ path: '../../.env.local' });

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

const CONVERSATION_REFLECTION_PROMPT = `You are analyzing a simulated interview conversation to extract structured insights for future reference.

This conversation was conducted as part of a market research campaign. Extract insights that are SPECIFIC to what was discussed in THIS conversation.

Given the conversation transcript below, extract and synthesize the following information into a structured JSON format. Be thorough but concise. Extract ONLY information that is explicitly stated or clearly implied in the transcript.

Required JSON structure:
{
  "campaign_responses": {
    "key_opinions": [],        // Main opinions expressed (1-2 sentence each)
    "specific_feedback": [],   // Concrete feedback, suggestions, or critiques
    "emotional_reactions": [], // How they felt (frustrated, excited, indifferent, etc.)
    "quotes": []               // 3-5 notable verbatim quotes that capture their perspective
  },
  "pain_points": {
    "problems_mentioned": [],  // Specific issues or problems they brought up
    "frustrations": [],        // Things that clearly frustrated or annoyed them
    "unmet_needs": []          // Gaps or missing features they identified
  },
  "goals_and_desires": {
    "wants": [],               // What they explicitly said they want
    "priorities": [],          // What seems most important to them
    "ideal_solutions": []      // Their vision of the ideal scenario
  },
  "behaviors": {
    "current_behaviors": [],   // What they currently do or how they use products
    "workarounds": [],         // How they cope with current limitations
    "decision_factors": []     // What influences their choices/decisions
  }
}

Important guidelines:
- Focus on THIS conversation's content, not general assumptions
- Keep each item concise (1-2 sentences max)
- Include verbatim quotes when particularly insightful
- Use empty arrays if a category has no relevant information
- Prioritize actionable, specific insights over vague observations

Return ONLY the JSON object, no additional text.`;

async function extractReflectionMemory(transcript, campaignTitle) {
  // Format transcript for GPT
  const formattedTranscript = transcript
    .map(item => {
      const prefix = item.is_followup ? '  [Follow-up] ' : '';
      return `${prefix}Q: ${item.question}\n${prefix}A: ${item.answer}`;
    })
    .join('\n\n');

  const contextInfo = campaignTitle
    ? `\nCAMPAIGN TOPIC: ${campaignTitle}\n`
    : '';

  const fullPrompt = `${CONVERSATION_REFLECTION_PROMPT}${contextInfo}\nTRANSCRIPT:\n${formattedTranscript}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are an expert qualitative researcher specializing in extracting actionable insights from user interviews.'
      },
      {
        role: 'user',
        content: fullPrompt
      }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const content = response.choices[0].message.content;
  const extracted = JSON.parse(content || '{}');

  return {
    ...extracted,
    extracted_at: new Date().toISOString(),
    model: 'gpt-4o-mini'
  };
}

async function backfillReflectionMemory() {
  console.log('Fetching completed conversations without reflection memory...\n');

  // Fetch all completed conversations that don't have reflection_memory yet
  // Join with campaigns to get the campaign title
  const { data: conversations, error: fetchError } = await supabase
    .from('conversations')
    .select(`
      id,
      participant_name,
      transcript,
      campaign_id,
      campaigns!inner(title)
    `)
    .eq('status', 'completed')
    .is('reflection_memory', null)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error('Error fetching conversations:', fetchError.message);
    process.exit(1);
  }

  if (!conversations || conversations.length === 0) {
    console.log('No conversations found without reflection memory.');
    process.exit(0);
  }

  console.log(`Found ${conversations.length} conversations to process.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i];
    const campaignTitle = conversation.campaigns?.title || 'Unknown Campaign';

    console.log(`[${i + 1}/${conversations.length}] Processing: ${conversation.participant_name} (${campaignTitle})...`);

    try {
      // Skip if transcript is empty
      if (!conversation.transcript || conversation.transcript.length === 0) {
        console.log(`  ⚠ Skipped: Empty transcript`);
        continue;
      }

      // Extract reflection memory
      const reflectionMemory = await extractReflectionMemory(
        conversation.transcript,
        campaignTitle
      );

      // Update Supabase
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          reflection_memory: reflectionMemory,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id);

      if (updateError) {
        console.error(`  ✗ Failed to update: ${updateError.message}`);
        errorCount++;
        continue;
      }

      console.log(`  ✓ Reflection memory extracted and saved`);
      successCount++;

      // Rate limiting: wait 300ms between requests
      if (i < conversations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
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
backfillReflectionMemory().catch(console.error);
