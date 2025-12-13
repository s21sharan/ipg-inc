import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DiscoveryQuestion {
  id: string;
  question: string;
  placeholder?: string;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { title, goal, template } = await request.json();

    if (!title || !goal) {
      return NextResponse.json(
        { error: 'Missing required fields: title and goal' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const templateContext = template
      ? `\nTemplate selected: "${template}" - tailor questions to this research focus.`
      : '';

    const prompt = `You are a senior user research consultant. A client wants to run a research campaign and you need to ask 2 smart follow-up questions to deeply understand their specific goals before designing the interview guide.

Campaign Title: "${title}"
Campaign Goal: "${goal}"${templateContext}

Based on this specific goal, generate exactly 2 insightful questions that will help you understand:
- What they're really trying to learn or decide
- What specific outcomes, behaviors, or concerns matter most to them

Your questions should be:
1. Directly relevant to their stated goal (not generic research questions)
2. Conversational and natural (like a consultant would ask)
3. Designed to uncover the "why behind the why"

For example:
- If they want to test a new feature → ask what success looks like or what worries them
- If they want to understand churn → ask about specific user behaviors they've noticed
- If they want to improve conversion → ask what they think is blocking users

Return ONLY a JSON array with exactly 2 questions:
[
  {"id": "q1", "question": "Your first question here?", "placeholder": "Brief hint..."},
  {"id": "q2", "question": "Your second question here?", "placeholder": "Brief hint..."}
]

No markdown, no explanation. Just the JSON array.`;

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

    const questions: DiscoveryQuestion[] = JSON.parse(jsonStr);

    // Validate structure
    if (!Array.isArray(questions) || questions.length === 0) {
      throw new Error('Invalid response format: expected array of questions');
    }

    // Ensure each question has required fields (limit to 2)
    const validatedQuestions = questions.slice(0, 2).map((q, i) => ({
      id: q.id || `q${i + 1}`,
      question: q.question,
      placeholder: q.placeholder || '',
    }));

    return NextResponse.json({ questions: validatedQuestions });
  } catch (error) {
    console.error('Error generating discovery questions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
