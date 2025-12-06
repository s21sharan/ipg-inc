import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface ConversationTranscript {
  question: string;
  answer: string;
  is_followup?: boolean;
  followup_to_index?: number;
}

export interface ConversationReflectionMemory {
  // Campaign-specific insights
  campaign_responses: {
    key_opinions: string[];        // Main opinions expressed about the campaign topic
    specific_feedback: string[];   // Concrete feedback or suggestions
    emotional_reactions: string[]; // How they felt about the topics
    quotes: string[];              // Notable verbatim quotes
  };
  // Pain points specific to campaign topic
  pain_points: {
    problems_mentioned: string[];  // Issues they brought up
    frustrations: string[];        // Things that frustrated them
    unmet_needs: string[];         // Gaps they identified
  };
  // Goals and desires related to campaign
  goals_and_desires: {
    wants: string[];               // What they want
    priorities: string[];          // What matters most to them
    ideal_solutions: string[];     // Their ideal scenario
  };
  // Behavioral insights
  behaviors: {
    current_behaviors: string[];   // What they currently do
    workarounds: string[];         // How they cope with problems
    decision_factors: string[];    // What influences their decisions
  };
  // Meta
  extracted_at: string;
  model: string;
}

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

/**
 * Extract reflection memory from a simulated conversation transcript
 */
export async function extractConversationReflection(
  transcript: ConversationTranscript[],
  campaignTitle?: string
): Promise<ConversationReflectionMemory> {
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

  // Add metadata
  return {
    ...extracted,
    extracted_at: new Date().toISOString(),
    model: 'gpt-4o-mini'
  };
}

/**
 * Extract reflection memory with retry logic
 */
export async function extractConversationReflectionWithRetry(
  transcript: ConversationTranscript[],
  campaignTitle?: string,
  maxRetries: number = 3
): Promise<ConversationReflectionMemory | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await extractConversationReflection(transcript, campaignTitle);
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        return null;
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  return null;
}
