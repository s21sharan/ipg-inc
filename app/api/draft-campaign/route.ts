import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { prompt } = await request.json();

    if (!prompt) {
      return NextResponse.json(
        { error: 'Prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Make all API calls simultaneously
    const [basicDetailsResponse, topicsResponse, completionResponse] = await Promise.all([
      // Call 1: Generate basic campaign details
      fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          input: `You are an experienced market researcher designing an AI-moderated interview campaign to study consumers and gather deep customer insights. You're setting up a campaign to help businesses understand their users better through dynamic, conversational interviews.

Based on this study objective: "${prompt}"

Generate campaign details with:
1. name: Short internal identifier (2-4 words, lowercase with hyphens, e.g., "product-feedback-q1")
2. title: User-facing campaign title (engaging, 3-6 words that would appeal to participants)
3. caption: Brief description shown to participants before starting (1-2 sentences explaining what they'll discuss and why their input matters)
4. timeEstimate: Estimated minutes to complete (number only, typically 10-30)

Return ONLY valid JSON in this exact format:
{
  "name": "your-campaign-name",
  "title": "Your Campaign Title",
  "caption": "Your campaign description here.",
  "timeEstimate": "15"
}`,
          reasoning: { effort: 'low' },
          text: { verbosity: 'low' },
        }),
      }),

      // Call 2: Generate discussion topics
      fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          input: `You are an experienced market researcher designing an AI-moderated interview campaign to study consumers and gather deep customer insights. You're creating a discussion guide that will help uncover authentic user experiences, needs, and behaviors.

Based on this study objective: "${prompt}"

Design 2-4 interview topics that follow best practices in qualitative research:
1. Kickoff (type: statement) - Warm, welcoming introduction that builds rapport (2-3 sentences)
2. 1-3 middle topics - Mix of conversation and question types strategically chosen to achieve research objectives:
   - For conversation type (use for exploring experiences, stories, and deeper insights):
     * name: Topic name (2-4 words)
     * persona: Choose the most appropriate from: "Jordan – The Empathetic Listener", "Riley – The Energetic Product Researcher", "Sam – The Analytical Moderator", "David - The Curious Friend"
     * goals: 2-3 specific research goals you want to achieve (newline separated)
     * maxDuration: estimated minutes for this topic (typically 3-10 minutes)
   - For question type (use for structured questions where consistency matters):
     * name: Topic name (2-4 words)
     * question: The specific question to ask verbatim
     * probeQuestions: 2-3 follow-up probe questions to dig deeper (newline separated)
     * probeDepth: Choose from "No probe questions", "1-2", "3-5", "5-10"
3. Signoff (type: statement) - Appreciative closing that thanks participants (1-2 sentences)

Return ONLY valid JSON array. Example format:
[
  {"id": "1", "name": "Kickoff", "type": "statement", "content": "welcome message"},
  {"id": "2", "name": "Topic Name", "type": "conversation", "content": "", "persona": "Jordan – The Empathetic Listener", "goals": "Goal 1\\nGoal 2", "maxDuration": "5"},
  {"id": "3", "name": "Topic Name", "type": "question", "content": "", "question": "What is your question?", "probeQuestions": "Probe 1\\nProbe 2", "probeDepth": "3-5"},
  {"id": "4", "name": "Signoff", "type": "statement", "content": "thank you message"}
]`,
          reasoning: { effort: 'low' },
          text: { verbosity: 'low' },
        }),
      }),

      // Call 3: Generate completion logic
      fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-nano',
          input: `You are an experienced market researcher designing an AI-moderated interview campaign to study consumers. You need to craft thoughtful completion messages that show appreciation for participants' time and valuable insights.

Based on this study objective: "${prompt}"

Generate completion messages:
1. completionMessage: Message shown when interview completes successfully (2-3 sentences expressing genuine gratitude for their insights and mentioning how their input will help, if applicable mention next steps)
2. exitMessage: Message shown if participant exits early (1-2 sentences that are understanding, appreciative, and leave the door open for future participation)

Return ONLY valid JSON:
{
  "completionAction": "Show Message",
  "completionMessage": "your completion message",
  "completionUrl": "",
  "earlyExitAction": "Show Message",
  "exitMessage": "your exit message",
  "exitUrl": ""
}`,
          reasoning: { effort: 'low' },
          text: { verbosity: 'low' },
        }),
      }),
    ]);

    // Check all responses
    if (!basicDetailsResponse.ok || !topicsResponse.ok || !completionResponse.ok) {
      throw new Error('One or more OpenAI API calls failed');
    }

    // Parse all responses
    const [basicDetailsData, topicsData, completionData] = await Promise.all([
      basicDetailsResponse.json(),
      topicsResponse.json(),
      completionResponse.json(),
    ]);

    // Extract content from Responses API output
    const extractContent = (data: any) => {
      const messageItem = data.output?.find((item: any) => item.type === 'message');
      const content = messageItem?.content?.[0]?.text ?? null;
      if (!content) {
        throw new Error('No content generated from OpenAI API');
      }
      return JSON.parse(content);
    };

    const basicDetails = extractContent(basicDetailsData);
    const topics = extractContent(topicsData);
    const completionLogic = extractContent(completionData);

    return NextResponse.json({
      basicDetails,
      topics,
      completionLogic,
    });
  } catch (error) {
    console.error('Error drafting campaign:', error);
    return NextResponse.json(
      { error: 'Failed to draft campaign' },
      { status: 500 }
    );
  }
}
