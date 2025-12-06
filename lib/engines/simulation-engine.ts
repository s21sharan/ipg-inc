import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export interface Interview {
  id: string;
  name: string;
  transcript: Array<{
    question: string;
    answer: string;
    is_followup?: boolean;
    followup_to_index?: number;
  }>;
  reflection_memory: any;
  personality: any;
}

export interface Campaign {
  id: string;
  title: string;
  caption: string;
  topics: Array<Topic>;
}

export interface Topic {
  id: string;
  name: string;
  type: 'statement' | 'conversation' | 'question';
  content?: string;
  persona?: string;
  goals?: string;
  maxDuration?: string;
  question?: string;
  probeQuestions?: string;
  probeDepth?: string;
}

export interface AgentContext {
  reflection_memory: any;
  original_recent_qa: Array<{ question: string; answer: string }>;
  personality: any;
}

export interface ConversationEntry {
  question: string;
  answer: string;
  is_followup?: boolean;
  followup_to_index?: number;
}

export interface SimulationResult {
  transcript: ConversationEntry[];
  topics_covered: string[];
  status: 'completed' | 'failed';
  error_message?: string;
}

/**
 * Build context for generative agent from interview data
 */
export function buildAgentContext(interview: Interview): AgentContext {
  // Get last 5-10 Q&As from original transcript (excluding followups)
  const mainQAs = interview.transcript.filter(item => !item.is_followup);
  const recentCount = Math.min(10, mainQAs.length);
  const recentQAs = mainQAs.slice(-recentCount).map(({ question, answer }) => ({
    question,
    answer
  }));

  return {
    reflection_memory: interview.reflection_memory || {},
    original_recent_qa: recentQAs,
    personality: interview.personality || {}
  };
}

/**
 * Format agent context for prompt
 */
function formatAgentContext(agentContext: AgentContext, participantName: string): string {
  const { reflection_memory, original_recent_qa, personality } = agentContext;

  let contextText = `You are ${participantName}, responding authentically in this interview.\n\n`;

  // Add reflection memory sections
  if (reflection_memory.basic_facts) {
    contextText += `ABOUT YOU:\n`;
    const facts = reflection_memory.basic_facts;
    if (facts.age) contextText += `- Age: ${facts.age}\n`;
    if (facts.occupation) contextText += `- Occupation: ${facts.occupation}\n`;
    if (facts.location) contextText += `- Location: ${facts.location}\n`;
    contextText += `\n`;
  }

  if (reflection_memory.personality_and_lifestyle) {
    const pal = reflection_memory.personality_and_lifestyle;
    if (pal.traits && pal.traits.length > 0) {
      contextText += `YOUR PERSONALITY:\n${pal.traits.map((t: string) => `- ${t}`).join('\n')}\n\n`;
    }
    if (pal.habits && pal.habits.length > 0) {
      contextText += `YOUR HABITS:\n${pal.habits.map((h: string) => `- ${h}`).join('\n')}\n\n`;
    }
  }

  if (reflection_memory.goals_and_motivations) {
    const gm = reflection_memory.goals_and_motivations;
    if (gm.primary_goals && gm.primary_goals.length > 0) {
      contextText += `YOUR GOALS:\n${gm.primary_goals.map((g: string) => `- ${g}`).join('\n')}\n\n`;
    }
    if (gm.values && gm.values.length > 0) {
      contextText += `YOUR VALUES:\n${gm.values.map((v: string) => `- ${v}`).join('\n')}\n\n`;
    }
  }

  if (reflection_memory.pain_points_and_frustrations) {
    const ppf = reflection_memory.pain_points_and_frustrations;
    if (ppf.current_problems && ppf.current_problems.length > 0) {
      contextText += `YOUR FRUSTRATIONS:\n${ppf.current_problems.map((p: string) => `- ${p}`).join('\n')}\n\n`;
    }
  }

  // Add recent Q&As for conversational context
  if (original_recent_qa.length > 0) {
    contextText += `RECENT CONTEXT FROM YOUR PREVIOUS INTERVIEW:\n`;
    original_recent_qa.forEach(({ question, answer }) => {
      contextText += `Q: ${question}\nA: ${answer}\n\n`;
    });
  }

  // Add personality scores if available
  if (personality && Object.keys(personality).length > 0) {
    contextText += `YOUR BIG FIVE PERSONALITY SCORES (0-5 scale):\n`;
    Object.entries(personality).forEach(([trait, score]) => {
      contextText += `- ${trait}: ${score}\n`;
    });
    contextText += `\n`;
  }

  contextText += `IMPORTANT RESPONSE GUIDELINES:
- Keep responses SHORT and CONVERSATIONAL (1-2 sentences for most answers)
- Answer naturally as if talking to a friend, not writing an essay
- Be authentic but concise - get to the point quickly
- Only give longer responses (3-4 sentences) when you have STRONG OPINIONS or deep emotional connection to the topic
- Use your personality traits to guide your tone, but keep it brief
- If you have more to say, let the interviewer ask follow-up questions

Respond naturally and authentically as this person would. Stay consistent with your stated values, frustrations, habits, and communication style.`;

  return contextText;
}

/**
 * Get agent response to a question
 */
async function getAgentResponse(
  question: string,
  agentContext: AgentContext,
  participantName: string,
  currentTranscript: ConversationEntry[]
): Promise<string> {
  const systemPrompt = formatAgentContext(agentContext, participantName);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt }
  ];

  // Add current conversation history
  currentTranscript.forEach(({ question: q, answer: a }) => {
    messages.push({ role: 'user', content: q });
    messages.push({ role: 'assistant', content: a });
  });

  // Add new question
  messages.push({ role: 'user', content: question });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.8,
    max_tokens: 100 // Reduced to 100 for 1-2 sentence responses
  });

  return response.choices[0].message.content || '';
}

/**
 * Decide if follow-up is needed based on response detail
 */
async function shouldAskFollowUp(
  question: string,
  answer: string,
  topic: Topic
): Promise<{ should_followup: boolean; followup_question?: string }> {
  const systemPrompt = `You are an experienced qualitative researcher analyzing interview responses.

Your task is to determine if a follow-up question is needed based on the participant's answer.

IMPORTANT: Bias toward asking follow-ups to get richer, more detailed responses. Your goal is to extract deeper insights.

Ask a follow-up if ANY of these apply:
- The answer is brief (less than 20 words)
- The answer lacks specific details, examples, or stories
- The answer is vague or surface-level
- The answer mentions something interesting but doesn't elaborate
- The answer uses general terms without concrete specifics
- The answer could reveal more about motivations, feelings, or reasoning
- The answer raises new questions or curiosities
- You sense there's more to uncover about their experience

ONLY skip the follow-up if:
- The answer is already rich with specific details and examples
- The answer fully addresses the question with depth
- A follow-up would feel repetitive or pushy

When generating follow-up questions:
- Ask "why" or "how" to understand motivations and processes
- Ask for specific examples or stories
- Probe into emotions and frustrations
- Ask about context and background
- Be conversational and natural

Respond with JSON only:
{
  "should_followup": true or false,
  "followup_question": "a natural, conversational follow-up question" or null,
  "reasoning": "brief explanation"
}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Main Question: ${question}\n\nParticipant's Answer: ${answer}\n\nShould we ask a follow-up?`
    }
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const decision = JSON.parse(response.choices[0].message.content || '{}');
  return {
    should_followup: decision.should_followup === true,
    followup_question: decision.followup_question || undefined
  };
}

/**
 * AI Interviewer decides next action
 */
async function decideNextProbe(
  topic: Topic,
  lastAnswer: string,
  probesAsked: string[],
  currentTranscript: ConversationEntry[]
): Promise<{ next_action: 'probe' | 'move_on'; question?: string }> {
  const availableProbes = topic.probeQuestions
    ?.split('\n')
    .filter(p => p.trim() && !probesAsked.includes(p.trim())) || [];

  if (availableProbes.length === 0) {
    return { next_action: 'move_on' };
  }

  const systemPrompt = `You are an experienced qualitative researcher conducting a conversational interview.

Research context: ${topic.goals || 'General exploration'}

Available probe questions:
${availableProbes.map((p, i) => `${i + 1}. ${p}`).join('\n')}

Your goal is to have a NATURAL, CONVERSATIONAL interview - not an interrogation.

Based on the participant's last response, decide:
1. If their answer was brief or unclear, definitely probe
2. If their answer was thorough but there's an interesting point to explore, probe
3. If they gave a comprehensive answer, move on to keep the conversation flowing

BIAS TOWARD PROBING - aim for 2-3 follow-ups per main question to create natural back-and-forth dialogue.

Respond with JSON only:
{
  "next_action": "probe" or "move_on",
  "question": "the exact probe question to ask" or null,
  "reasoning": "brief explanation"
}`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `Last question: ${currentTranscript[currentTranscript.length - 1]?.question || topic.question}\n\nParticipant's response: ${lastAnswer}\n\nWhat should we do next?`
    }
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });

  const decision = JSON.parse(response.choices[0].message.content || '{}');
  return {
    next_action: decision.next_action === 'probe' ? 'probe' : 'move_on',
    question: decision.question || undefined
  };
}

/**
 * Handle statement topic
 */
async function handleStatementTopic(
  topic: Topic,
  agentContext: AgentContext,
  participantName: string,
  currentTranscript: ConversationEntry[]
): Promise<void> {
  const statement = topic.content || '';

  // Present statement and get agent's natural reaction
  const prompt = `${statement}\n\n[Interviewer waits for your reaction or acknowledgment]`;
  const response = await getAgentResponse(prompt, agentContext, participantName, currentTranscript);

  currentTranscript.push({
    question: statement,
    answer: response
  });
}

/**
 * Handle question topic with dynamic probing and follow-ups
 */
async function handleQuestionTopic(
  topic: Topic,
  agentContext: AgentContext,
  participantName: string,
  currentTranscript: ConversationEntry[]
): Promise<void> {
  // Ask main question
  const mainQuestion = topic.question || '';
  const mainQuestionIndex = currentTranscript.length;
  const mainAnswer = await getAgentResponse(mainQuestion, agentContext, participantName, currentTranscript);

  currentTranscript.push({
    question: mainQuestion,
    answer: mainAnswer
  });

  // Check if we should ask a follow-up for the main answer
  const followUpDecision = await shouldAskFollowUp(mainQuestion, mainAnswer, topic);

  if (followUpDecision.should_followup && followUpDecision.followup_question) {
    const followUpAnswer = await getAgentResponse(followUpDecision.followup_question, agentContext, participantName, currentTranscript);

    currentTranscript.push({
      question: followUpDecision.followup_question,
      answer: followUpAnswer,
      is_followup: true,
      followup_to_index: mainQuestionIndex
    });

    // Potentially ask one more follow-up if the first follow-up was also brief
    const secondFollowUp = await shouldAskFollowUp(followUpDecision.followup_question, followUpAnswer, topic);

    if (secondFollowUp.should_followup && secondFollowUp.followup_question) {
      const secondAnswer = await getAgentResponse(secondFollowUp.followup_question, agentContext, participantName, currentTranscript);

      currentTranscript.push({
        question: secondFollowUp.followup_question,
        answer: secondAnswer,
        is_followup: true,
        followup_to_index: mainQuestionIndex
      });
    }
  }

  // Dynamic probing (original probe questions from discussion guide)
  const probesAsked: string[] = [];
  const maxProbes = topic.probeDepth === '5-10' ? 10 : topic.probeDepth === '3-5' ? 5 : 2;

  for (let i = 0; i < maxProbes; i++) {
    const decision = await decideNextProbe(topic, currentTranscript[currentTranscript.length - 1].answer, probesAsked, currentTranscript);

    if (decision.next_action === 'move_on' || !decision.question) {
      break;
    }

    probesAsked.push(decision.question);
    const probeQuestionIndex = currentTranscript.length;
    const probeAnswer = await getAgentResponse(decision.question, agentContext, participantName, currentTranscript);

    currentTranscript.push({
      question: decision.question,
      answer: probeAnswer
    });

    // Check if probe answer needs follow-up
    const probeFollowUp = await shouldAskFollowUp(decision.question, probeAnswer, topic);

    if (probeFollowUp.should_followup && probeFollowUp.followup_question) {
      const probeFollowUpAnswer = await getAgentResponse(probeFollowUp.followup_question, agentContext, participantName, currentTranscript);

      currentTranscript.push({
        question: probeFollowUp.followup_question,
        answer: probeFollowUpAnswer,
        is_followup: true,
        followup_to_index: probeQuestionIndex
      });
    }
  }
}

/**
 * Handle conversation topic
 */
async function handleConversationTopic(
  topic: Topic,
  agentContext: AgentContext,
  participantName: string,
  currentTranscript: ConversationEntry[]
): Promise<void> {
  const goals = topic.goals || '';
  const maxDuration = parseInt(topic.maxDuration || '5');
  const maxExchanges = Math.ceil(maxDuration / 2); // Roughly 2 minutes per exchange

  const systemPrompt = `You are ${topic.persona || 'an experienced interviewer'} conducting a conversational interview.

Research goals:
${goals}

Generate natural, open-ended questions that explore these goals. Ask one question at a time. Be conversational and build on previous responses.

Respond with JSON only:
{
  "question": "the next question to ask",
  "continue": true or false
}

Set "continue" to false when you feel the goals have been sufficiently explored.`;

  for (let i = 0; i < maxExchanges; i++) {
    // Generate next question
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add conversation history
    currentTranscript.forEach(({ question: q, answer: a }) => {
      messages.push({ role: 'user', content: `[Asked]: ${q}` });
      messages.push({ role: 'assistant', content: `[Participant responded]: ${a}` });
    });

    messages.push({ role: 'user', content: 'What question should we ask next?' });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
      response_format: { type: 'json_object' }
    });

    const decision = JSON.parse(response.choices[0].message.content || '{}');

    if (!decision.continue || !decision.question) {
      break;
    }

    // Get agent response
    const answer = await getAgentResponse(decision.question, agentContext, participantName, currentTranscript);

    currentTranscript.push({
      question: decision.question,
      answer
    });
  }
}

/**
 * Simulate full interview
 */
export async function simulateInterview(
  campaign: Campaign,
  interview: Interview,
  agentContext: AgentContext
): Promise<SimulationResult> {
  const transcript: ConversationEntry[] = [];
  const topicsCovered: string[] = [];

  try {
    // Process each topic in order
    for (const topic of campaign.topics) {
      if (topic.type === 'statement') {
        await handleStatementTopic(topic, agentContext, interview.name, transcript);
      } else if (topic.type === 'question') {
        await handleQuestionTopic(topic, agentContext, interview.name, transcript);
      } else if (topic.type === 'conversation') {
        await handleConversationTopic(topic, agentContext, interview.name, transcript);
      }

      topicsCovered.push(topic.id);

      // Safety: cap at 50 Q&As
      if (transcript.length >= 50) {
        break;
      }
    }

    return {
      transcript,
      topics_covered: topicsCovered,
      status: 'completed'
    };
  } catch (error) {
    return {
      transcript,
      topics_covered: topicsCovered,
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
