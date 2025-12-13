import { NextRequest } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Topic {
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

interface GenerateRequest {
  title: string;
  goal: string;
  audience: string;
  focusCategory: string;
  template?: string;
  discoveryContext?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function detectNewFeature(goal: string): Promise<{ isNewFeature: boolean; featureName?: string }> {
  try {
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: `Analyze if this campaign goal mentions a NEW, UNRELEASED, or UPCOMING feature/product that users haven't experienced yet.

Goal: "${goal}"

If YES, return: {"isNewFeature": true, "featureName": "the feature name"}
If NO (existing product/feature that users can already use), return: {"isNewFeature": false}

Return ONLY the JSON object, nothing else.`,
    });

    const content = response.output_text;
    if (!content) return { isNewFeature: false };

    return JSON.parse(content.trim());
  } catch {
    return { isNewFeature: false };
  }
}

function buildPrompt(
  title: string,
  goal: string,
  audience: string,
  focusCategory: string,
  isNewFeature: boolean,
  featureName: string | undefined,
  discoveryContext?: string
): string {
  const featureContext = isNewFeature
    ? `IMPORTANT: This is about a NEW/UNRELEASED feature called "${featureName || 'this feature'}". Users have NOT used or experienced this yet. Frame questions about EXPECTATIONS, FIRST IMPRESSIONS, and ANTICIPATED VALUE rather than actual usage or experience.`
    : `This is about an existing product/feature that users can already use. Frame questions about their ACTUAL EXPERIENCE, USAGE PATTERNS, and FEEDBACK.`;

  const discoverySection = discoveryContext
    ? `\nAdditional Research Context (use this to make questions more specific and targeted):\n${discoveryContext}\n`
    : '';

  return `Generate an interview discussion guide for user research.

Campaign: "${title}"
Goal: "${goal}"
Target Audience: "${audience}"
Focus Area: "${focusCategory}"
${discoverySection}
${featureContext}

Generate a structured interview guide as a JSON array with the following structure:

1. First topic: Welcome message
   - id: "1"
   - name: "Introduction: Welcome"
   - type: "statement"
   - content: A warm, friendly welcome message (2-3 sentences)

2. Middle topics (4-6 question topics organized into 2-3 sections):
   - Each question topic has:
     - id: sequential number as string
     - name: "SectionName: Brief Question Title" (e.g., "Free Experience: Learning moments", "Upgrade Decision: Value perception")
     - type: "question"
     - question: The main interview question
     - probeQuestions: 3-5 follow-up probes as newline-separated string
     - probeDepth: one of "1-2", "3-5", or "5-10"

   For MULTIPLE CHOICE questions, embed options in the question text:
   "What keeps you coming back?

Options:
- The streak system motivates me
- I enjoy the gamification
- It fits my schedule
- Other"

3. Last topic: Closing message
   - id: last number as string
   - name: "Closing: Thank You"
   - type: "statement"
   - content: A warm thank you message (1-2 sentences)

Return ONLY a valid JSON array. Start with [ and end with ]. No markdown, no explanation.`;
}

// Parse complete topic objects from a JSON array string buffer
function extractCompleteTopics(buffer: string): { topics: Topic[]; remaining: string } {
  const topics: Topic[] = [];
  let remaining = buffer;

  // Try to find complete topic objects in the buffer
  // Look for pattern: {...}
  let searchStart = 0;

  while (true) {
    const objStart = remaining.indexOf('{', searchStart);
    if (objStart === -1) break;

    // Find matching closing brace
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    let objEnd = -1;

    for (let i = objStart; i < remaining.length; i++) {
      const char = remaining[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\') {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            objEnd = i;
            break;
          }
        }
      }
    }

    if (objEnd === -1) {
      // Incomplete object, keep it in buffer
      break;
    }

    // Try to parse the complete object
    const objStr = remaining.slice(objStart, objEnd + 1);
    try {
      const topic = JSON.parse(objStr) as Topic;
      if (topic.id && topic.name && topic.type) {
        topics.push(topic);
        searchStart = objEnd + 1;
        // Update remaining to exclude parsed topic
        remaining = remaining.slice(0, objStart) + remaining.slice(objEnd + 1);
        searchStart = 0; // Reset search since we modified remaining
      } else {
        searchStart = objEnd + 1;
      }
    } catch {
      // Not valid JSON yet, try next position
      searchStart = objStart + 1;
    }
  }

  return { topics, remaining };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get('title');
  const goal = searchParams.get('goal');
  const audience = searchParams.get('audience');
  const focusCategory = searchParams.get('focusCategory');
  const discoveryContext = searchParams.get('discoveryContext');

  if (!title || !goal || !audience || !focusCategory) {
    return new Response(
      JSON.stringify({ error: 'Missing required parameters: title, goal, audience, focusCategory' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!process.env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (type: string, data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`));
      };

      try {
        // Step 1: Detect if this is about a new feature
        const featureContext = await detectNewFeature(goal);
        sendEvent('context', featureContext);

        // Step 2: Build the prompt
        const prompt = buildPrompt(
          title,
          goal,
          audience,
          focusCategory,
          featureContext.isNewFeature,
          featureContext.featureName,
          discoveryContext || undefined
        );

        // Step 3: Stream the response from OpenAI
        const openaiStream = await openai.responses.create({
          model: 'gpt-4o-mini',
          input: prompt,
          stream: true,
        });

        let buffer = '';
        let sentTopicIds = new Set<string>();
        let currentText = '';

        for await (const event of openaiStream) {
          if (event.type === 'response.output_text.delta') {
            const delta = event.delta;
            buffer += delta;
            currentText += delta;

            // Send text delta for live typing effect
            sendEvent('text_delta', { delta, fullText: currentText });

            // Try to extract complete topics from buffer
            const { topics, remaining } = extractCompleteTopics(buffer);
            buffer = remaining;

            // Send any newly complete topics
            for (const topic of topics) {
              if (!sentTopicIds.has(topic.id)) {
                sentTopicIds.add(topic.id);
                sendEvent('topic', topic);
              }
            }
          }
        }

        // Final parse attempt for any remaining content
        if (buffer.trim()) {
          try {
            // Try to parse as complete JSON array
            let cleanBuffer = buffer.trim();
            if (!cleanBuffer.startsWith('[')) cleanBuffer = '[' + cleanBuffer;
            if (!cleanBuffer.endsWith(']')) cleanBuffer = cleanBuffer + ']';

            const finalTopics = JSON.parse(cleanBuffer) as Topic[];
            for (const topic of finalTopics) {
              if (!sentTopicIds.has(topic.id)) {
                sentTopicIds.add(topic.id);
                sendEvent('topic', topic);
              }
            }
          } catch {
            // Try extracting remaining topics
            const { topics } = extractCompleteTopics(buffer + '}]');
            for (const topic of topics) {
              if (!sentTopicIds.has(topic.id)) {
                sentTopicIds.add(topic.id);
                sendEvent('topic', topic);
              }
            }
          }
        }

        // Send completion
        sendEvent('complete', { topicCount: sentTopicIds.size });
        controller.close();
      } catch (error) {
        console.error('Error generating interview guide:', error);
        sendEvent('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// Also support POST for more complex requests
export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { title, goal, audience, focusCategory, discoveryContext } = body;

    if (!title || !goal || !audience || !focusCategory) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: title, goal, audience, focusCategory' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Detect new feature context
    const featureContext = await detectNewFeature(goal);

    // Build prompt
    const prompt = buildPrompt(
      title,
      goal,
      audience,
      focusCategory,
      featureContext.isNewFeature,
      featureContext.featureName,
      discoveryContext
    );

    // Generate topics (non-streaming for POST)
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('No content generated from OpenAI API');
    }

    // Parse JSON
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const topics: Topic[] = JSON.parse(jsonStr);

    return new Response(
      JSON.stringify({
        contextFlags: featureContext,
        topics,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating interview guide:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
