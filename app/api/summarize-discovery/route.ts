import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DiscoveryQA {
  question: string;
  answer: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { discoveryQAs, title, goal } = await request.json();

    if (!discoveryQAs || !Array.isArray(discoveryQAs) || discoveryQAs.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: discoveryQAs' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Format the Q&A pairs for the prompt
    const qaText = discoveryQAs
      .map((qa: DiscoveryQA) => `Q: ${qa.question}\nA: ${qa.answer}`)
      .join('\n\n');

    const prompt = `You are summarizing research context for a user research campaign.

Campaign: "${title}"
Goal: "${goal}"

The researcher provided these answers to discovery questions:

${qaText}

Summarize these answers into 3-5 concise bullet points that capture the key research objectives, success criteria, and concerns. Each bullet should be:
- Written in third person (e.g., "Wants to understand..." not "I want to understand...")
- Actionable and specific
- 10-20 words maximum

Return ONLY a JSON object with a "bullets" array of strings. No markdown, no explanation.

Example format:
{"bullets": ["Deciding whether to launch the feature based on user interest", "Success means increased app engagement and feature discovery", "Main concern is low adoption and feature underutilization"]}`;

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: prompt,
    });

    const content = response.output_text;
    if (!content) {
      throw new Error('No content generated from OpenAI API');
    }

    // Parse JSON response
    let jsonStr = content.trim();
    if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
    else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
    jsonStr = jsonStr.trim();

    const result = JSON.parse(jsonStr);

    if (!Array.isArray(result.bullets)) {
      throw new Error('Invalid response format: expected bullets array');
    }

    return NextResponse.json({ bullets: result.bullets });
  } catch (error) {
    console.error('Error summarizing discovery:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
